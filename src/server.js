
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Load configuration
const config = (() => {
    try {
        return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json')));
    } catch (err) {
        console.warn('Failed to load config.json, using default values:', err.message);
        return { server: { port: 3000 } };
    }
})();

// Helper function to get MediaMTX host based on environment
function getMediaMTXHost() {
    return process.env.NODE_ENV === 'production'
        ? process.env.MEDIAMTX_HOST
        : 'localhost:8889';
}

// Initialize Express app and HTTP server
const app = express();
const httpServer = http.createServer(app);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// MediaMTX WebRTC proxy endpoint
app.get('/stream', (req, res) => {
    const mediamtxHost = getMediaMTXHost();
    const streamUrl = `http://${mediamtxHost}/stream/camera/webrtc`;
    console.log(`Redirecting to MediaMTX stream: ${streamUrl}`);
    res.redirect(streamUrl);
});

// Start HTTP server with error handling
const PORT = process.env.PORT || config.server.port || 3000;
httpServer.listen(PORT, () => {
    console.log('=== Server Configuration ===');
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Server port: ${PORT}`);
    console.log(`MediaMTX host: ${getMediaMTXHost()}`);
    console.log('========================');
});

