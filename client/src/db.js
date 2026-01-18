import { createRxDatabase } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import { Subject } from 'rxjs';
import { io } from 'socket.io-client';

// Updated Schema to include userId
const todoSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        userId: { type: 'string' }, // New field for ownership
        text: { type: 'string' },
        isDone: { type: 'boolean' },
        updatedAt: { type: 'number' }
    },
    required: ['id', 'userId', 'text', 'isDone', 'updatedAt']
};

// Map to store database instances per user (Support for switching users)
const dbPromises = new Map();

export const initDB = async (userId, token) => {
    if (!userId) throw new Error("User ID is required to initialize database");
    if (!token) throw new Error("Auth token is required to initialize database");

    // Return existing promise if we are already loading this user's DB
    if (dbPromises.has(userId)) {
        return dbPromises.get(userId);
    }

    const promise = (async () => {
        // 1. Initialize Database (Unique name per user)
        const dbName = `todos_${userId}`;
        const db = await createRxDatabase({
            name: dbName,
            storage: getRxStorageDexie()
        });

        await db.addCollections({
            todos: { schema: todoSchema }
        });

        // 2. Setup Real-time Socket Connection
        const socket = io('http://localhost:5000', {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 10,
            transports: ['websocket'],
            query: { userId } 
        });

        const pullStream$ = new Subject();

        socket.on('data-changed', (data) => {
            if (data && data.userId && data.userId !== userId) return;
            pullStream$.next('RESYNC');
        });
        socket.on('connect', () => pullStream$.next('RESYNC'));

        // Auth Headers with JWT Bearer Token
        const authHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };

        // 3. Priority Sync Logic
        let isFirstSync = true;

        const syncState = replicateRxCollection({
            collection: db.todos,
            replicationIdentifier: `sync-${userId}-v1`,
            pull: {
                async handler(lastPulledAt) {
                    const queryParams = new URLSearchParams({
                        lastPulledAt: lastPulledAt || 0,
                        limit: 100
                    });

                    if (isFirstSync && !lastPulledAt) {
                        queryParams.set('activeOnly', 'true');
                    }

                    const response = await fetch(`http://localhost:5000/sync?${queryParams}`, {
                        method: 'GET',
                        headers: authHeaders
                    });
                    
                    if (!response.ok) throw new Error(`Sync failed: ${response.status}`);
                    
                    const data = await response.json();
                    const documents = Array.isArray(data.documents) ? data.documents : [];

                    if (isFirstSync && !lastPulledAt) {
                        isFirstSync = false;
                        setTimeout(() => pullStream$.next('RESYNC'), 500);
                    }
                    
                    return { documents, checkpoint: data.checkpoint || Date.now() };
                },
                stream$: pullStream$.asObservable(),
                batchSize: 100
            },
            push: {
                async handler(changes) {
                    const docs = changes.map(c => ({
                        ...c.newDocumentState,
                        userId: userId
                    }));

                    const response = await fetch('http://localhost:5000/sync', {
                        method: 'POST',
                        headers: authHeaders,
                        body: JSON.stringify({ changes: docs })
                    });
                    
                    if (!response.ok) throw new Error('Push failed');
                    return docs;
                },
                batchSize: 100
            },
            retryTime: 5000,
            autoStart: true
        });

        return db;
    })();

    dbPromises.set(userId, promise);
    return promise;
};