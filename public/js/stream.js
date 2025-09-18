// DOM elements
const localVideo = document.getElementById('localVideo');
const startButton = document.getElementById('startButton');

// Variables
let canvas, ctx;

startButton.addEventListener('click', startStream);

async function startStream() {
    try {
        startButton.disabled = true;
        console.log('Starting stream...');

        // Create canvas
        canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        ctx = canvas.getContext('2d');

        // Create MediaStream from canvas
        const captureStream = canvas.captureStream(30);
        localVideo.srcObject = captureStream;

        // Connect to WebSocket
        console.log('Connecting to WebSocket...');
        const ws = new WebSocket(`ws://${window.location.hostname}:9999`);
        ws.binaryType = 'arraybuffer';

        ws.onopen = () => {
            console.log('WebSocket connected');
        };

        ws.onmessage = (event) => {
            // Create blob from received data
            const blob = new Blob([event.data], { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);
            const img = new Image();

            img.onload = () => {
                // Clear canvas and draw new frame
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
            };

            img.onerror = (error) => {
                console.error('Error loading image:', error);
                URL.revokeObjectURL(url);
            };

            img.src = url;
        };

        ws.onclose = () => {
            console.log('WebSocket connection closed');
            startButton.disabled = false;
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            startButton.disabled = false;
        };

    } catch (error) {
        console.error('Error starting stream:', error);
        startButton.disabled = false;
    }
}