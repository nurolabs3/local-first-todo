const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: 'http://localhost:4173', credentials: true }
});

// JWT Authentication Middleware
const requireAuth = (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized: No token provided' });
        }
        
        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        req.userId = decoded.userId; // Attach userId from token
        req.userEmail = decoded.email;
        next();
    } catch (err) {
        console.error('Auth error:', err.message);
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};

app.use(cors({
    origin: [
        "http://localhost:5173", 
        "http://localhost:4173"  
    ],
    credentials: true
}));
app.use(express.json());

// Connect to MongoDB (Replace with your URI if using Atlas)
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/localfirst_db')
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error(err));

// ===== USER MODEL =====
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// Define Schema with "updatedAt" for sync logic
const todoSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true }, // <--- CRITICAL NEW FIELD
    text: String,
    isDone: { type: Boolean, index: true },
    updatedAt: { type: Number, required: true, index: true },
    deleted: { type: Boolean, default: false, index: true }
});
todoSchema.index({ userId: 1, updatedAt: 1 });
const Todo = mongoose.model('Todo', todoSchema);

// ===== AUTH ENDPOINTS =====

// Register: Create new user
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        
        // Check if user exists
        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);
        
        // Create user
        const user = await User.create({ email, passwordHash });
        
        // Generate JWT
        const token = jwt.sign(
            { userId: user._id.toString(), email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );
        
        res.status(201).json({ 
            token, 
            user: { id: user._id, email: user.email } 
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login: Authenticate user
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }
        
        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Verify password
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Generate JWT
        const token = jwt.sign(
            { userId: user._id.toString(), email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );
        
        res.json({ 
            token, 
            user: { id: user._id, email: user.email } 
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// --- SYNC ENDPOINTS ---

// 1. PULL: Send changes to client with pagination & priority filtering
app.get('/sync', requireAuth, async (req, res) => {
    try {
        const lastPulledAt = parseInt(req.query.lastPulledAt) || 0;
        const activeOnly = req.query.activeOnly === 'true';
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);
        
        // FILTER BY USER ID
        const query = { 
            userId: req.userId, // <--- Security Barrier
            updatedAt: { $gt: lastPulledAt } 
        };

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
app.post('/sync', requireAuth, async (req, res) => {
    try {
        const { changes } = req.body;
        if (!changes || changes.length > 500) return res.status(400).json({ error: 'Batch too large' });
        
        const bulkOps = changes.map(change => {
            // SECURITY: Force the userId to match the authenticated user
            // This prevents User A from injecting data into User B's account
            const secureDoc = { ...change, userId: req.userId };

            return {
                updateOne: {
                    filter: { id: change.id }, // ID collision is fine if uuid, but strictly: { id: change.id, userId: req.userId }
                    update: { $set: secureDoc },
                    upsert: true
                }
            };
        });
        
        await Todo.bulkWrite(bulkOps);
        
        // Notify only RELEVANT clients (Optimization for later: Rooms)
        io.emit('data-changed', { userId: req.userId }); 
        
        res.json({ success: true });
    } catch (err) {
        console.error('Sync push error:', err);
        res.status(500).json({ error: 'Sync failed' });
    }
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));