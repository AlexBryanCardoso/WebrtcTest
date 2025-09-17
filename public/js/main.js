// // WebRTC configuration
// const configuration = {
//     iceServers: [
//         { urls: 'stun:stun.l.google.com:19302' }
//     ]
// };

// // Variables
// let localStream;
// let remoteStream;
// let peerConnection;
// let socket;
// let wsStream;

// // DOM elements
// const localVideo = document.getElementById('localVideo');
// const remoteVideo = document.getElementById('remoteVideo');
// const startButton = document.getElementById('startButton');
// const callButton = document.getElementById('callButton');
// const hangupButton = document.getElementById('hangupButton');

// // Initialize Socket.IO connection
// socket = io();

// // Button event listeners
// startButton.addEventListener('click', startCall);
// callButton.addEventListener('click', call);
// hangupButton.addEventListener('click', hangup);

// // Socket event listeners
// socket.on('offer', handleOffer);
// socket.on('answer', handleAnswer);
// socket.on('ice-candidate', handleIceCandidate);

// async function startCall() {
//     try {
//         // Connect to IP camera WebSocket stream
//         wsStream = new WebSocket('ws://localhost:9999');
        
//         // Create MediaStream from WebSocket video feed
//         const videoElement = document.createElement('video');
//         videoElement.autoplay = true;
//         videoElement.muted = true;
        
//         wsStream.onmessage = (event) => {
//             const blob = new Blob([event.data], { type: 'image/jpeg' });
//             videoElement.src = URL.createObjectURL(blob);
//         };
        
//         // Wait for video to start playing
//         await new Promise((resolve) => {
//             videoElement.onplaying = resolve;
//         });
        
//         // Create MediaStream from the video element
//         localStream = videoElement.captureStream();
//         localVideo.srcObject = localStream;
        
//         startButton.disabled = true;
//         callButton.disabled = false;
//     } catch (error) {
//         console.error('Error connecting to IP camera:', error);
//     }
// }

// async function call() {
//     callButton.disabled = true;
//     hangupButton.disabled = false;

//     // Create peer connection
//     peerConnection = new RTCPeerConnection(configuration);

//     // Add local stream
//     localStream.getTracks().forEach(track => {
//         peerConnection.addTrack(track, localStream);
//     });

//     // Handle remote stream
//     peerConnection.ontrack = event => {
//         remoteVideo.srcObject = event.streams[0];
//     };

//     // Handle ICE candidates
//     peerConnection.onicecandidate = event => {
//         if (event.candidate) {
//             socket.emit('ice-candidate', event.candidate);
//         }
//     };

//     try {
//         // Create and send offer
//         const offer = await peerConnection.createOffer();
//         await peerConnection.setLocalDescription(offer);
//         socket.emit('offer', offer);
//     } catch (error) {
//         console.error('Error creating offer:', error);
//     }
// }

// async function handleOffer(offer) {
//     if (!peerConnection) {
//         peerConnection = new RTCPeerConnection(configuration);

//         // Add local stream
//         localStream.getTracks().forEach(track => {
//             peerConnection.addTrack(track, localStream);
//         });

//         // Handle remote stream
//         peerConnection.ontrack = event => {
//             remoteVideo.srcObject = event.streams[0];
//         };

//         // Handle ICE candidates
//         peerConnection.onicecandidate = event => {
//             if (event.candidate) {
//                 socket.emit('ice-candidate', event.candidate);
//             }
//         };
//     }

//     try {
//         await peerConnection.setRemoteDescription(offer);
//         const answer = await peerConnection.createAnswer();
//         await peerConnection.setLocalDescription(answer);
//         socket.emit('answer', answer);
//     } catch (error) {
//         console.error('Error handling offer:', error);
//     }
// }

// async function handleAnswer(answer) {
//     try {
//         await peerConnection.setRemoteDescription(answer);
//     } catch (error) {
//         console.error('Error handling answer:', error);
//     }
// }

// async function handleIceCandidate(candidate) {
//     try {
//         if (peerConnection) {
//             await peerConnection.addIceCandidate(candidate);
//         }
//     } catch (error) {
//         console.error('Error handling ICE candidate:', error);
//     }
// }

// function hangup() {
//     if (peerConnection) {
//         peerConnection.close();
//         peerConnection = null;
//     }
    
//     if (localStream) {
//         localStream.getTracks().forEach(track => track.stop());
//     }
    
//     localVideo.srcObject = null;
//     remoteVideo.srcObject = null;
    
//     startButton.disabled = false;
//     callButton.disabled = true;
//     hangupButton.disabled = true;
// }


  const localVideo = document.getElementById('localVideo');
  const remoteVideo = document.getElementById('remoteVideo');
  const startButton = document.getElementById('startButton');
  const callButton = document.getElementById('callButton');
  const hangupButton = document.getElementById('hangupButton');

  let canvas, ctx, captureStream;
  let peerConnection;
  const socket = io(); // connect to signaling server (same origin)

  // Signaling
  socket.on('offer', handleOffer);
  socket.on('answer', handleAnswer);
  socket.on('ice-candidate', handleIceCandidate);

  startButton.addEventListener('click', startStream);
  callButton.addEventListener('click', startCall);
  hangupButton.addEventListener('click', hangup);

  async function startStream() {
    startButton.disabled = true;
    // Create canvas at target resolution
    const width = 1280;
    const height = 720;
    const fps = 15;

    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d');

    // Show a scaled preview in the visible <video> element by piping a MediaStream
    captureStream = canvas.captureStream(fps);
    localVideo.srcObject = captureStream;

    // Connect to MJPEG WebSocket
    const ws = new WebSocket('ws://'+location.hostname+':9999');
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log('Connected to MJPEG WebSocket');
      callButton.disabled = false;
    };

    ws.onmessage = (msg) => {
      // msg.data is a complete JPEG binary (server ensures that)
      const blob = new Blob([msg.data], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        // draw into canvas; you can change drawImage scaling/position as required
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
      };
      img.src = url;
    };

    ws.onclose = () => {
      console.log('MJPEG WebSocket closed');
      startButton.disabled = false;
      callButton.disabled = true;
    };

    ws.onerror = (e) => console.error('MJPEG WS error', e);
  }

  async function startCall() {
    callButton.disabled = true;
    hangupButton.disabled = false;

    peerConnection = new RTCPeerConnection(STUN_TURN_CONFIG);

    // Add local tracks from canvas capture stream
    captureStream.getTracks().forEach(track => peerConnection.addTrack(track, captureStream));

    // Remote track handling
    peerConnection.ontrack = (event) => {
      console.log('ontrack', event);
      remoteVideo.srcObject = event.streams[0];
    };

    // ICE candidate handling
    peerConnection.onicecandidate = (ev) => {
      if (ev.candidate) socket.emit('ice-candidate', ev.candidate);
    };

    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit('offer', offer);
    } catch (err) {
      console.error('Error creating offer', err);
    }
  }

  async function handleOffer(offer) {
    if (!peerConnection) {
      peerConnection = new RTCPeerConnection(STUN_TURN_CONFIG);

      captureStream.getTracks().forEach(track => peerConnection.addTrack(track, captureStream));

      peerConnection.ontrack = (event) => remoteVideo.srcObject = event.streams[0];
      peerConnection.onicecandidate = (ev) => {
        if (ev.candidate) socket.emit('ice-candidate', ev.candidate);
      };
    }

    try {
      await peerConnection.setRemoteDescription(offer);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit('answer', answer);
    } catch (err) {
      console.error('Error handling offer', err);
    }
  }

  async function handleAnswer(answer) {
    try {
      if (peerConnection) await peerConnection.setRemoteDescription(answer);
    } catch (err) {
      console.error('Error handling answer', err);
    }
  }

  async function handleIceCandidate(candidate) {
    try {
      if (peerConnection) await peerConnection.addIceCandidate(candidate);
    } catch (err) {
      console.error('Error adding ICE candidate', err);
    }
  }

  function hangup() {
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    if (captureStream) {
      captureStream.getTracks().forEach(t => t.stop());
    }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;

    startButton.disabled = false;
    callButton.disabled = true;
    hangupButton.disabled = true;
  }
