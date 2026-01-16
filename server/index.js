const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

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
    isDone: Boolean,
    updatedAt: { type: Number, required: true },
    deleted: { type: Boolean, default: false } // Soft delete
});

const Todo = mongoose.model('Todo', todoSchema);

// --- SYNC ENDPOINTS ---

// 1. PULL: Send changes to client
app.get('/sync', async (req, res) => {
    const lastPulledAt = parseInt(req.query.lastPulledAt) || 0;
    const changes = await Todo.find({ updatedAt: { $gt: lastPulledAt } });
    res.json({ documents: changes, checkpoint: Date.now() });
});

// 2. PUSH: Receive changes from client
app.post('/sync', async (req, res) => {
    const { changes } = req.body;
    for (const change of changes) {
        await Todo.findOneAndUpdate(
            { id: change.id },
            change,
            { upsert: true, new: true }
        );
    }
    res.json({ success: true });
});

app.listen(5000, () => console.log('Server running on port 5000'));