import { createRxDatabase } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import { Subject } from 'rxjs';
import { io } from 'socket.io-client';

// Define the Todo Schema
const todoSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        text: { type: 'string' },
        isDone: { type: 'boolean' },
        updatedAt: { type: 'number' }
    },
    required: ['id', 'text', 'isDone', 'updatedAt']
};

export const initDB = async () => {
    // 1. Create the Database
    const db = await createRxDatabase({
        name: 'reacttodos',
        storage: getRxStorageDexie()
    });

    // 2. Create the Collection
    await db.addCollections({
        todos: { schema: todoSchema }
    });

    // 3. Setup WebSocket for real-time push with reconnection
    const socket = io('http://localhost:5000', {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10
    });
    const pullStream$ = new Subject();

    socket.on('data-changed', () => {
        pullStream$.next('pull');
    });

    socket.on('connect', () => {
        console.log('WebSocket connected');
        pullStream$.next('pull'); // Sync on reconnect
    });

    // 4. Priority Sync: Active tasks first
    let activeSynced = false;

    const syncState = replicateRxCollection({
        collection: db.todos,
        replicationIdentifier: 'my-sync',
        pull: {
            async handler(lastPulledAt) {
                const queryParams = new URLSearchParams({
                    lastPulledAt: lastPulledAt || 0,
                    limit: 100
                });

                // First sync: only active tasks
                if (!activeSynced && lastPulledAt === null) {
                    queryParams.set('activeOnly', 'true');
                }

                const response = await fetch(`http://localhost:5000/sync?${queryParams}`);
                if (!response.ok) throw new Error('Sync failed');
                
                const data = await response.json();
                
                // After first sync, mark active as synced and trigger full sync
                if (!activeSynced && lastPulledAt === null) {
                    activeSynced = true;
                    setTimeout(() => pullStream$.next('pull'), 1000);
                }
                
                return { documents: data.documents, checkpoint: data.checkpoint };
            },
            stream$: pullStream$.asObservable(),
            batchSize: 100
        },
        push: {
            async handler(changes) {
                const docs = changes.map(c => c.newDocumentState);
                const response = await fetch('http://localhost:5000/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
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
};