
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

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
        const { host } = getMediaMTXConfig();
        let targetUrl;

        // Try HTTPS first
        try {
            targetUrl = `https://${host}${req.url}`;
            console.log(`Trying HTTPS proxy to MediaMTX: ${targetUrl}`);
            
            const response = await fetch(targetUrl, {
                method: req.method,
                headers: {
                    ...req.headers,
                    host: host.split(':')[0],
                    'user-agent': 'Render-Proxy'
                },
                body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
                timeout: 5000
            });

            // Copy headers and stream response
            response.headers.forEach((value, key) => res.setHeader(key, value));
            res.status(response.status);
            
            if (response.body) {
                response.body.pipe(res);
            } else {
                res.end();
            }
            return;
        } catch (httpsError) {
            console.log('HTTPS proxy failed:', httpsError.message);
        }

        // Fallback to HTTP if HTTPS fails
        targetUrl = `http://${host}${req.url}`;
        console.log(`Falling back to HTTP proxy: ${targetUrl}`);
        
        const response = await fetch(targetUrl, {
            method: req.method,
            headers: {
                ...req.headers,
                host: host.split(':')[0],
                'user-agent': 'Render-Proxy'
            },
            body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
            timeout: 5000
        });

        // Copy headers and stream response
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.status(response.status);
        
        if (response.body) {
            response.body.pipe(res);
        } else {
            res.end();
        }
    } catch (error) {
        console.error('Proxy error:', error);
        const errorMessage = {
            error: 'MediaMTX server unreachable',
            details: error.message,
            help: 'Please ensure MediaMTX server is running and port 8889 is accessible'
        };
        console.error(errorMessage);
        res.status(502).json(errorMessage);
    }
});

// MediaMTX WebRTC proxy endpoint
app.get('/stream', async (req, res) => {
    try {
        const { host, protocol } = getMediaMTXConfig();
        
        // First try with HTTPS
        let streamUrl = `https://${host}/stream/camera/webrtc`;
        console.log(`Trying HTTPS connection to MediaMTX: ${streamUrl}`);
        
        try {
            const response = await fetch(streamUrl, {
                method: 'HEAD',
                timeout: 5000 // 5 second timeout
            });
            if (response.ok) {
                console.log('HTTPS connection successful');
                return res.redirect(streamUrl);
            }
        } catch (httpsError) {
            console.log('HTTPS connection failed:', httpsError.message);
        }

        // If HTTPS fails, try HTTP
        streamUrl = `http://${host}/stream/camera/webrtc`;
        console.log(`Trying HTTP connection to MediaMTX: ${streamUrl}`);
        
        try {
            const response = await fetch(streamUrl, {
                method: 'HEAD',
                timeout: 5000 // 5 second timeout
            });
            if (response.ok) {
                console.log('HTTP connection successful');
                return res.redirect(streamUrl);
            } else {
                throw new Error(`MediaMTX server returned ${response.status}`);
            }
        } catch (httpError) {
            console.error('HTTP connection failed:', httpError.message);
            
            // Try the proxy endpoint as a last resort
            const proxyUrl = `/mediamtx/stream/camera/webrtc`;
            console.log(`Falling back to proxy endpoint: ${proxyUrl}`);
            return res.redirect(proxyUrl);
        }
    } catch (error) {
        console.error('Stream endpoint error:', error);
        res.status(500).json({
            error: 'Failed to connect to MediaMTX server',
            details: error.message,
            help: 'Please check if MediaMTX is running and accessible'
        });
    }
});

// Start HTTP server with error handling
const PORT = process.env.PORT || config.server.port || 3000;
httpServer.listen(PORT, () => {
    const { host, protocol } = getMediaMTXConfig();
    console.log('=== Server Configuration ===');
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Server port: ${PORT}`);
    console.log(`MediaMTX host: ${host}`);
    console.log(`MediaMTX protocol: ${protocol}`);
    console.log('========================');
});

