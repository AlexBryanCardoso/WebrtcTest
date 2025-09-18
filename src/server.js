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
const { Server: IOServer } = require('socket.io'); // ✅ Added
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Load config.json
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json')));

// Express app
const app = express();
const httpServer = http.createServer(app);

// Serve static files (public/index.html)
app.use(express.static(path.join(__dirname, '..', 'public')));

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
const wss = new WebSocket.Server({ 
    server: httpServer,
    path: '/stream'
});
console.log('MJPEG WebSocket server attached to HTTP server');

wss.on('connection', (ws) => {
  console.log('MJPEG client connected. Total clients:', wss.clients.size);
  ws.on('close', () =>
    console.log('MJPEG client disconnected. Total clients:', wss.clients.size)
  );
});

// Launch ffmpeg and broadcast JPEG frames
function startFFmpeg() {
  const rtspUrl = config.camera.url;
  const width = config.stream.width || 1280;
  const height = config.stream.height || 720;
  const fps = config.stream.fps || 15;

  const ffmpegArgs = [
    '-rtsp_transport', 'tcp',
    '-i', rtspUrl,
    '-an',
    '-vf', `scale=${width}:${height}`,
    '-r', String(fps),
    '-f', 'image2pipe',
    '-q:v', '5',
    '-vcodec', 'mjpeg',
    'pipe:1'
  ];

  console.log('Starting ffmpeg with args:', ffmpegArgs.join(' '));
  const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

  let frameBuffer = Buffer.alloc(0);

  ffmpeg.stdout.on('data', (chunk) => {
    frameBuffer = Buffer.concat([frameBuffer, chunk]);

    let start = 0;
    while (true) {
      const soi = frameBuffer.indexOf(Buffer.from([0xff, 0xd8]), start);
      if (soi === -1) break;
      const eoi = frameBuffer.indexOf(Buffer.from([0xff, 0xd9]), soi + 2);
      if (eoi === -1) break;

      const jpg = frameBuffer.slice(soi, eoi + 2);
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(jpg);
        }
      });

      start = eoi + 2;
    }

    frameBuffer = frameBuffer.slice(start);
  });

  ffmpeg.stderr.on('data', (d) => {
    // Uncomment if you want ffmpeg logs:
    console.error('ffmpeg stderr:', d.toString());
  });

  ffmpeg.on('exit', (code, sig) => {
    console.error('ffmpeg exited', code, sig);
    setTimeout(startFFmpeg, 2000);
  });

  ffmpeg.on('error', (err) => {
    console.error('ffmpeg spawn error', err);
    setTimeout(startFFmpeg, 2000);
  });
}

startFFmpeg();