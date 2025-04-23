import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:5000/ws');

ws.on('open', function open() {
  console.log('Connected to WebSocket server');
  
  // Send authentication (this would normally come after login)
  ws.send(JSON.stringify({
    type: 'auth',
    userId: 41,  // The admin user ID we just created
    isAdmin: true
  }));
  
  // Send a test message after auth
  setTimeout(() => {
    ws.send(JSON.stringify({
      type: 'message',
      content: 'This is a test message from the WebSocket client'
    }));
    console.log('Test message sent');
  }, 1000);
});

ws.on('message', function incoming(data) {
  console.log('Received:', data.toString());
});

ws.on('error', function error(err) {
  console.error('WebSocket error:', err);
});

ws.on('close', function close() {
  console.log('WebSocket connection closed');
});

// Keep the script running for a few seconds
setTimeout(() => {
  ws.close();
  console.log('Test completed');
}, 5000);
