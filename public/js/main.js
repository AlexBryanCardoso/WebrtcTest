// // Initialize Firebase
// const db = firebase.database();
// const auth = firebase.auth();

// // WebRTC Configuration
// const configuration = {
//     iceServers: [
//         { urls: 'stun:stun.l.google.com:19302' },
//         { urls: 'stun:stun1.l.google.com:19302' }
//     ],
//     iceCandidatePoolSize: 10
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


// Initialize Firebase and get database reference
const db = firebase.database();

// WebRTC Configuration with multiple STUN servers for better connectivity
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10
};

// DOM elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startButton = document.getElementById('startButton');
const shareButton = document.getElementById('shareButton');
const stopButton = document.getElementById('stopButton');
const roomIdDisplay = document.getElementById('roomIdDisplay');
const roomIdSpan = document.getElementById('roomId');

// Variables
let canvas, ctx, captureStream;
let ws;
let peerConnection;
let currentRoomId;

// Event Listeners
startButton.addEventListener('click', startStream);
shareButton.addEventListener('click', shareStream);
stopButton.addEventListener('click', stopStream);

// Keep track of active streams in Firebase
const streamsRef = db.ref('active-streams');
const myStreamId = Math.random().toString(36).substring(7);

// Update stream status in Firebase
function updateStreamStatus(isActive) {
    if (isActive) {
        streamsRef.child(myStreamId).set({
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            active: true
        });
    } else {
        streamsRef.child(myStreamId).remove();
    }
}

async function startStream() {
    startButton.disabled = true;
    stopButton.disabled = false;

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
    ws = new WebSocket('ws://'+location.hostname+':9999');
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
        console.log('Connected to MJPEG WebSocket');
        // Update Firebase when stream starts
        updateStreamStatus(true);
        // Enable share button
        shareButton.disabled = false;
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
        updateStreamStatus(false);
        startButton.disabled = false;
        stopButton.disabled = true;
    };

    ws.onerror = (e) => console.error('MJPEG WS error', e);
}

function stopStream() {
    if (ws) {
        ws.close();
    }
    
    if (captureStream) {
        captureStream.getTracks().forEach(track => track.stop());
    }

    // Clean up Firebase
    updateStreamStatus(false);
    
    localVideo.srcObject = null;
    canvas = null;
    ctx = null;
    captureStream = null;
    
    startButton.disabled = false;
    stopButton.disabled = true;
}

// WebRTC Functions for sharing the stream
async function shareStream() {
    currentRoomId = Math.random().toString(36).substr(2, 9);
    const roomRef = db.ref(`rooms/${currentRoomId}`);

    // Create a new RTCPeerConnection
    peerConnection = new RTCPeerConnection(configuration);

    // Add the canvas stream to peer connection
    captureStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, captureStream);
    });

    // Handle ICE candidates
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            roomRef.child('hostCandidates').push(event.candidate.toJSON());
        }
    };

    // Listen for remote ICE candidates
    roomRef.child('clientCandidates').on('child_added', async snapshot => {
        if (peerConnection) {
            const candidate = new RTCIceCandidate(snapshot.val());
            await peerConnection.addIceCandidate(candidate);
        }
    });

    // Listen for the answer
    roomRef.child('answer').on('value', async snapshot => {
        const answer = snapshot.val();
        if (answer && peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        }
    });

    // Create and set local description
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // Store the offer in the database
    await roomRef.child('offer').set(offer);

    // Display the room ID
    roomIdSpan.textContent = currentRoomId;
    roomIdDisplay.style.display = 'block';
    shareButton.disabled = true;
}

// Function to join an existing stream
async function joinStream(roomId) {
    const roomRef = db.ref(`rooms/${roomId}`);

    // Get the room's offer
    const roomSnapshot = await roomRef.child('offer').once('value');
    if (!roomSnapshot.exists()) {
        console.error('Room not found!');
        return;
    }

    const offer = roomSnapshot.val();
    
    // Create peer connection
    peerConnection = new RTCPeerConnection(configuration);

    // Handle incoming streams
    peerConnection.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            roomRef.child('clientCandidates').push(event.candidate.toJSON());
        }
    };

    // Listen for host ICE candidates
    roomRef.child('hostCandidates').on('child_added', async snapshot => {
        if (peerConnection) {
            const candidate = new RTCIceCandidate(snapshot.val());
            await peerConnection.addIceCandidate(candidate);
        }
    });

    // Set remote description (offer)
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    // Create and set local description (answer)
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    // Store the answer in the database
    await roomRef.child('answer').set(answer);
}

// Function to stop sharing
function stopSharing() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (currentRoomId) {
        const roomRef = db.ref(`rooms/${currentRoomId}`);
        roomRef.remove();
        currentRoomId = null;
    }
    roomIdDisplay.style.display = 'none';
    shareButton.disabled = false;
}

// Update stopStream to include WebRTC cleanup
function stopStream() {
    stopSharing();
    if (ws) {
        ws.close();
    }
    if (captureStream) {
        captureStream.getTracks().forEach(track => track.stop());
    }

    // Clean up Firebase
    updateStreamStatus(false);
    
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    canvas = null;
    ctx = null;
    captureStream = null;
    
    startButton.disabled = false;
    shareButton.disabled = true;
    stopButton.disabled = true;
    roomIdDisplay.style.display = 'none';
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    stopStream();
});
