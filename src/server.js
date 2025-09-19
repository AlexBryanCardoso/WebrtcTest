// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');
// const path = require('path');
// const Stream = require('node-rtsp-stream');
// const config = require('../config.json');

// const app = express();
// const server = http.createServer(app);
// const io = new Server(server);

// // Serve static files from public directory
// app.use(express.static(path.join(__dirname, '../public')));

// // Create RTSP Stream
// const stream = new Stream({
//     name: 'ip-camera',
//     streamUrl: config.camera.url,
//     wsPort: 9999,
//     ffmpegOptions: {
//         '-stats': '',
//         '-r': config.stream.fps,
//         '-s': `${config.stream.width}x${config.stream.height}`
//     }
// });

// // Socket.IO connection handling
// io.on('connection', (socket) => {
//     console.log('A user connected');

//     // Handle WebRTC signaling
//     socket.on('offer', (offer) => {
//         socket.broadcast.emit('offer', offer);
//     });

//     socket.on('answer', (answer) => {
//         socket.broadcast.emit('answer', answer);
//     });

//     socket.on('ice-candidate', (candidate) => {
//         socket.broadcast.emit('ice-candidate', candidate);
//     });

//     socket.on('disconnect', () => {
//         console.log('User disconnected');
//     });
// });

// const PORT = config.server.port || 3000;
// server.listen(PORT, () => {
//     console.log(`Server is running on port ${PORT}`);
//     console.log(`WebSocket stream available at ws://localhost:9999`);
// });

const express = require('express');
const http = require('http');
const { Server: IOServer } = require('socket.io');
const path = require('path');
const fs = require('fs');

// Load config.json
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json')));

// Express app
const app = express();
const httpServer = http.createServer(app);

// Serve static files (public/index.html)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Proxy WebRTC requests to MediaMTX
app.all('/stream/*', async (req, res) => {
    const mediamtxHost = process.env.NODE_ENV === 'production'
        ? process.env.MEDIAMTX_HOST
        : 'localhost:8889';
    
    const targetUrl = `http://${mediamtxHost}${req.url}`;
    
    try {
        const response = await fetch(targetUrl, {
            method: req.method,
            headers: req.headers,
            body: req.method !== 'GET' ? req.body : undefined
        });
        
        res.status(response.status);
        response.headers.forEach((value, name) => {
            res.setHeader(name, value);
        });
        
        response.body.pipe(res);
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(502).send('Proxy error');
    }
});

// Socket.IO signaling server
const io = new IOServer(httpServer, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  console.log('Signaling client connected:', socket.id);

  socket.on('offer', (offer) => socket.broadcast.emit('offer', offer));
  socket.on('answer', (answer) => socket.broadcast.emit('answer', answer));
  socket.on('ice-candidate', (candidate) => socket.broadcast.emit('ice-candidate', candidate));

  socket.on('disconnect', () =>
    console.log('Signaling client disconnected:', socket.id)
  );
});

// Start HTTP + Socket.IO server
const PORT = process.env.PORT || config.server.port || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// MJPEG WebSocket server
let wss;
const isProduction = process.env.NODE_ENV === 'production';
console.log('Environment:', process.env.NODE_ENV);

if (isProduction) {
    // Production: Attach to HTTP server
    wss = new WebSocket.Server({ 
        server: httpServer,
        path: '/stream',
        perMessageDeflate: false  // Disable compression for better performance
    });
    console.log('MJPEG WebSocket server attached to HTTP server at path /stream');
} else {
    // Development: Standalone WebSocket server
    wss = new WebSocket.Server({ 
        port: 9999,
        perMessageDeflate: false  // Disable compression for better performance
    });
    console.log('MJPEG WebSocket server listening on ws://localhost:9999');
}

wss.on('connection', (ws) => {
  console.log('MJPEG client connected. Total clients:', wss.clients.size);
  ws.on('close', () =>
    console.log('MJPEG client disconnected. Total clients:', wss.clients.size)
  );
});

let retryCount = 0;
const MAX_RETRIES = 10;
const INITIAL_RETRY_DELAY = 2000;

// Launch ffmpeg and broadcast JPEG frames
function startFFmpeg() {
  const rtspUrl = process.env.CAMERA_URL || config.camera.url;
  if (!rtspUrl) {
    console.error('No camera URL provided. Please set CAMERA_URL environment variable or update config.json');
    return;
  }
  
  // Reset retry count if we've been running successfully
  if (retryCount > 0 && Date.now() - lastSuccessTime > 30000) {
    console.log('Stream was stable for 30 seconds, resetting retry count');
    retryCount = 0;
  }
  
  const width = config.stream.width || 1280;
  const height = config.stream.height || 720;
  const fps = config.stream.fps || 15;

  // Check if the URL is a local network address
  const isLocalUrl = /^rtsp:\/\/[^@]+@(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|localhost|127\.0\.0\.1)/.test(rtspUrl);
  
  console.log('FFmpeg configuration:', {
    rtspUrl: rtspUrl.replace(/(rtsp:\/\/)([^@]+@)/, '$1****@'), // Hide credentials in logs
    isLocalUrl,
    width,
    height,
    fps,
    env: process.env.NODE_ENV
  });

  if (process.env.NODE_ENV === 'production' && isLocalUrl) {
    console.error('ERROR: Attempting to access local network camera from production environment.');
    console.error('Please use a public IP/domain or set up proper network access.');
    return;
  }

  // Use MediaMTX URL instead of direct RTSP
  const mediamtxUrl = process.env.NODE_ENV === 'production' 
    ? `rtsp://${process.env.MEDIAMTX_HOST}/camera`  // Production MediaMTX URL
    : 'rtsp://localhost:8554/camera';  // Local MediaMTX URL

  const ffmpegArgs = [
    '-rtsp_transport', 'tcp',
    '-i', mediamtxUrl,
    '-nostdin',
    '-loglevel', 'warning',
    '-an',
    '-f', 'mjpeg',
    '-vf', `scale=${width}:${height}`,
    '-qscale:v', '2',
    '-r', String(fps),
    '-threads', '1',
    'pipe:1'
  ];

  console.log('Starting ffmpeg with args:', ffmpegArgs.join(' '));
  const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  
  console.log('FFmpeg process started with PID:', ffmpeg.pid);
  
  let frameBuffer = Buffer.alloc(0);
  let frameCount = 0;
  const startTime = Date.now();

  ffmpeg.stdout.on('data', (chunk) => {
    hasReceivedData = true; // Mark that we've received data
    frameBuffer = Buffer.concat([frameBuffer, chunk]);

    let start = 0;
    while (true) {
      const soi = frameBuffer.indexOf(Buffer.from([0xff, 0xd8]), start);
      if (soi === -1) break;
      const eoi = frameBuffer.indexOf(Buffer.from([0xff, 0xd9]), soi + 2);
      if (eoi === -1) break;

      const jpg = frameBuffer.slice(soi, eoi + 2);
      frameCount++;
      if (frameCount % 30 === 0) { // Log every 30 frames
        const elapsed = (Date.now() - startTime) / 1000;
        console.log(`Streaming stats: ${frameCount} frames in ${elapsed.toFixed(1)}s (${(frameCount/elapsed).toFixed(1)} fps)`);
      }

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(jpg);
          } catch (err) {
            console.error('Error sending frame to client:', err.message);
          }
        }
      });

      start = eoi + 2;
    }

    frameBuffer = frameBuffer.slice(start);
  });

  // Track if we've received any data
  let hasReceivedData = false;
  let connectionTimeout;
  let lastSuccessTime = Date.now();

  // Set a timeout to restart FFmpeg if we don't receive any data
  connectionTimeout = setTimeout(() => {
    if (!hasReceivedData) {
      console.error('No data received from camera within timeout period. Restarting FFmpeg...');
      ffmpeg.kill();
    }
  }, 15000); // 15 second timeout for initial connection

  ffmpeg.stderr.on('data', (d) => {
    const output = d.toString();
    // Always log FFmpeg output in production
    if (process.env.NODE_ENV === 'production' || process.env.DEBUG) {
      console.error('FFmpeg stderr:', output);
    }
    
    // Check for common RTSP errors
    if (output.includes('Connection refused') || 
        output.includes('Connection timed out') ||
        output.includes('Error opening input')) {
      console.error('RTSP Connection Error:', output);
      ffmpeg.kill();
    }
  });

  ffmpeg.on('exit', (code, sig) => {
    clearTimeout(connectionTimeout);
    console.error('FFmpeg process exited with code:', code, 'signal:', sig);
    
    if (process.env.NODE_ENV === 'production') {
      console.error('FFmpeg process exit details:', {
        code,
        signal: sig,
        timestamp: new Date().toISOString(),
        hasReceivedData,
        retryCount
      });
    }

    // Implement exponential backoff
    retryCount++;
    if (retryCount > MAX_RETRIES) {
      console.error('Max retries reached. Waiting for 1 minute before trying again...');
      retryCount = 0;
      setTimeout(startFFmpeg, 60000);
      return;
    }

    const retryDelay = Math.min(INITIAL_RETRY_DELAY * Math.pow(2, retryCount - 1), 30000);
    console.log(`Retry ${retryCount}/${MAX_RETRIES} in ${retryDelay/1000} seconds...`);
    setTimeout(startFFmpeg, retryDelay);
  });

  ffmpeg.on('error', (err) => {
    console.error('FFmpeg spawn error:', {
      error: err.message,
      code: err.code,
      path: err.path,
      spawnargs: err.spawnargs,
      timestamp: new Date().toISOString()
    });
    setTimeout(startFFmpeg, 2000);
  });
}

startFFmpeg();