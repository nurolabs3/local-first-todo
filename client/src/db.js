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
        storage: getRxStorageDexie() // Uses IndexedDB in the browser
    });

    // 2. Create the Collection
    await db.addCollections({
        todos: { schema: todoSchema }
    });

    // 3. Setup WebSocket for real-time push
    const socket = io('http://localhost:5000');
    const pullStream$ = new Subject();

    socket.on('data-changed', () => {
        pullStream$.next('pull');
    });

    // 4. Start Sync (Replication)
    const syncState = replicateRxCollection({
        collection: db.todos,
        replicationIdentifier: 'my-sync',
        pull: {
            async handler(lastPulledAt) {
                const response = await fetch(`http://localhost:5000/sync?lastPulledAt=${lastPulledAt || 0}`);
                const data = await response.json();
                return { documents: data.documents, checkpoint: data.checkpoint };
            },
            stream$: pullStream$.asObservable()
        },
        push: {
            async handler(changes) {
                const docs = changes.map(c => c.newDocumentState);
                await fetch('http://localhost:5000/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ changes: docs })
                });
                return docs;
            }
        }
    });

    return db;
};