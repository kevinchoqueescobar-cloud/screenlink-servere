const { io } = require('socket.io-client');
const http = require('http');

const SERVER_URL = 'http://localhost:3000';

async function runTest() {
  console.log('🧪 Starting ScreenLink Server Automated Test Flow...\n');

  // 1. Test Health endpoint
  await new Promise((resolve) => {
    http.get(`${SERVER_URL}/health`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('✅ Health Check Response:', data);
        resolve();
      });
    });
  });

  // 2. Client A (Broadcaster)
  const clientA = io(SERVER_URL);
  // 3. Client B (Viewer)
  const clientB = io(SERVER_URL);

  let sessionCode = null;

  clientA.on('connect', () => {
    console.log('🟢 Client A (Broadcaster) connected with socket id:', clientA.id);
    clientA.emit('create-session', {}, (res) => {
      if (res.success) {
        sessionCode = res.code;
        console.log(`✅ Session created successfully! Code: [${sessionCode}]`);

        // Now Client B joins
        console.log(`\n🔵 Client B (Viewer) attempting to join session [${sessionCode}]...`);
        clientB.emit('join-session', { code: sessionCode });
      }
    });
  });

  clientA.on('viewer-joined', (data) => {
    console.log(`✅ Client A received 'viewer-joined' notification from viewer socket: ${data.viewerId}`);
    console.log('  -> Client A sending simulated SDP offer...');
    clientA.emit('offer', {
      code: sessionCode,
      offer: { type: 'offer', sdp: 'v=0\r\no=- 12345 2 IN IP4 127.0.0.1...' }
    });
  });

  clientB.on('session-joined', (data) => {
    console.log('✅ Client B successfully joined session:', data.code);
  });

  clientB.on('offer', (data) => {
    console.log('✅ Client B received SDP offer from Broadcaster');
    console.log('  -> Client B sending simulated SDP answer...');
    clientB.emit('answer', {
      code: sessionCode,
      answer: { type: 'answer', sdp: 'v=0\r\no=- 67890 2 IN IP4 127.0.0.1...' }
    });
  });

  clientA.on('answer', (data) => {
    console.log('✅ Client A received SDP answer from Viewer!');
    console.log('  -> Exchanging ICE candidates...');
    clientA.emit('ice-candidate', {
      code: sessionCode,
      candidate: { candidate: 'candidate:1 1 UDP 2122237378 192.168.1.100 50000 typ host', sdpMid: '0', sdpMLineIndex: 0 }
    });
  });

  clientB.on('ice-candidate', (data) => {
    console.log('✅ Client B received ICE candidate!');
    console.log('  -> Now testing viewer disconnection (DEJAR DE VER)...');
    clientB.emit('leave-session', { code: sessionCode });
  });

  clientA.on('viewer-left', (data) => {
    console.log('✅ Client A received notification that Viewer left:', data.message);
    console.log('\n🎉 ALL SIGNALING SERVER TESTS PASSED SUCCESSFULLY!\n');
    clientA.disconnect();
    clientB.disconnect();
    process.exit(0);
  });
}

// Delay 1 sec before starting test
setTimeout(runTest, 1500);
