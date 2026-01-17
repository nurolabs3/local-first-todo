const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: 'http://localhost:5173', credentials: true }
});

app.use(cors());
app.use(express.json());

// Connect to MongoDB (Replace with your URI if using Atlas)
mongoose.connect('mongodb://127.0.0.1:27017/localfirst_db')
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error(err));

// Define Schema with "updatedAt" for sync logic
const todoSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true }, // Client-side ID
    text: String,
    isDone: { type: Boolean, index: true },
    updatedAt: { type: Number, required: true, index: true },
    deleted: { type: Boolean, default: false, index: true } // Soft delete
});

const Todo = mongoose.model('Todo', todoSchema);

// --- SYNC ENDPOINTS ---

// 1. PULL: Send changes to client with pagination & priority filtering
app.get('/sync', async (req, res) => {
    try {
        const lastPulledAt = parseInt(req.query.lastPulledAt) || 0;
        const activeOnly = req.query.activeOnly === 'true';
        const limit = Math.min(parseInt(req.query.limit) || 100, 500); // Max 500 per batch
        
        const query = { updatedAt: { $gt: lastPulledAt } };
        if (activeOnly) {
            query.isDone = false;
            query.deleted = false;
        }
        
        const changes = await Todo.find(query)
            .sort({ updatedAt: 1 })
            .limit(limit)
            .lean();
        
        res.json({ documents: changes, checkpoint: Date.now() });
    } catch (err) {
        console.error('Sync pull error:', err);
        res.status(500).json({ error: 'Sync failed' });
    }
});

// 2. PUSH: Receive changes from client
app.post('/sync', async (req, res) => {
    try {
        const { changes } = req.body;
        if (!changes || changes.length > 500) {
            return res.status(400).json({ error: 'Invalid batch size' });
        }
        
        const bulkOps = changes.map(change => ({
            updateOne: {
                filter: { id: change.id },
                update: { $set: change },
                upsert: true
            }
        }));
        
        await Todo.bulkWrite(bulkOps);
        io.emit('data-changed'); // Notify all clients
        res.json({ success: true });
    } catch (err) {
        console.error('Sync push error:', err);
        res.status(500).json({ error: 'Sync failed' });
    }
});

httpServer.listen(5000, () => console.log('Server running on port 5000'));