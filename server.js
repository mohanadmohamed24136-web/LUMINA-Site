const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config(); // Automatically looks for .env in root

const apiRoutes = require('./backend/routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({
    verify: (req, res, buf) => {
        if (req.originalUrl.startsWith('/api/stripe/webhook')) {
            req.rawBody = buf.toString();
        }
    }
}));
app.use(express.urlencoded({ extended: true }));

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, 'LUMINA')));

// Serve uploads
app.use('/uploads', express.static(path.join(__dirname, 'backend/uploads')));

// API Routes
app.use('/api', apiRoutes);

// Fallback for HTML files
app.get('*', (req, res) => {
    // If it's an API request that wasn't handled, return 404
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API route not found' });
    }
    // Otherwise serve index.html or the requested file if it exists
    res.sendFile(path.join(__dirname, 'LUMINA', 'index.html'));
});

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

module.exports = app;
