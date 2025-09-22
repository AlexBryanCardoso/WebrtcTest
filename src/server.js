
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

// Helper function to get MediaMTX host and protocol based on environment
function getMediaMTXConfig() {
    const host = process.env.NODE_ENV === 'production'
        ? process.env.MEDIAMTX_HOST
        : 'localhost:8889';
    const protocol = process.env.NODE_ENV === 'production'
        ? 'https'
        : 'http';
    return { host, protocol };
}

// Initialize Express app and HTTP server
const app = express();
const httpServer = http.createServer(app);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

/**
 * ✅ NEW: Secure Reverse Proxy for MediaMTX
 * Example: https://your-app.onrender.com/mediamtx/stream/camera/webrtc
 */
app.use('/mediamtx', async (req, res) => {
    try {
        const { host, protocol } = getMediaMTXConfig();

        // Build full URL to MediaMTX
        const targetUrl = `${protocol}://${host}${req.url}`;
        console.log(`Proxying request to MediaMTX: ${targetUrl}`);

        // Forward the request to MediaMTX
        const response = await fetch(targetUrl, {
            method: req.method,
            headers: { ...req.headers, host: undefined },
            body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined
        });

        // Copy headers from MediaMTX response
        response.headers.forEach((value, key) => res.setHeader(key, value));

        // Send status code
        res.status(response.status);

        // Stream the response back to client
        if (response.body) {
            response.body.pipe(res);
        } else {
            res.end();
        }
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(502).json({ error: 'MediaMTX server unreachable', details: error.message });
    }
});

// MediaMTX WebRTC proxy endpoint
app.get('/stream', async (req, res) => {
    try {
        const { host, protocol } = getMediaMTXConfig();
        const streamUrl = `${protocol}://${host}/stream/camera/webrtc`;
        
        // Test if MediaMTX server is accessible
        try {
            const response = await fetch(streamUrl, { method: 'HEAD' });
            if (!response.ok) {
                throw new Error(`MediaMTX server returned ${response.status}`);
            }
        } catch (error) {
            console.error('MediaMTX server error:', error);
            return res.status(502).json({
                error: 'MediaMTX server is not accessible',
                details: error.message
            });
        }

        console.log(`Redirecting to MediaMTX stream: ${streamUrl}`);
        res.redirect(streamUrl);
    } catch (error) {
        console.error('Stream endpoint error:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
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

