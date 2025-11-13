/**
 * Test WebRTC Client - Simulates mobile client to test P2P connection
 * 
 * This Node.js script acts as a mobile client to test WebRTC P2P connection
 * with the Mac client without needing to build the iOS app.
 * 
 * Usage:
 *   node test-webrtc-client.js <pairing-code>
 */

const io = require('socket.io-client');
const { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } = require('werift');

const RELAY_SERVER = process.env.RELAY_SERVER_URL || 'http://localhost:3000';
const pairingCode = process.argv[2];

if (!pairingCode) {
  console.error('❌ Usage: node test-webrtc-client.js <pairing-code>');
  console.error('   Get the pairing code from the Mac client output');
  process.exit(1);
}

console.log('🧪 WebRTC Test Client');
console.log('========================\n');
console.log(`📡 Connecting to relay server: ${RELAY_SERVER}`);
console.log(`🔑 Using pairing code: ${pairingCode}\n`);

let socket;
let peerConnection;
let dataChannel;
let isWebRTCConnected = false;

// Connect to relay server
socket = io(RELAY_SERVER, {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
});

socket.on('connect', () => {
  console.log('✅ Connected to relay server');
  
  // Register as mobile device
  socket.emit('register', { type: 'mobile' });
});

socket.on('registered', ({ message }) => {
  console.log(`✅ ${message}`);
  console.log(`🔗 Pairing with code: ${pairingCode}...`);
  
  // Send pairing code
  socket.emit('pair', { pairingCode, cols: 80, rows: 30 });
});

socket.on('paired', ({ message }) => {
  console.log(`✅ ${message}`);
  console.log('⏳ Waiting for WebRTC offer from Mac...\n');
});

// WebRTC Signaling handlers
socket.on('webrtc:offer', async (data) => {
  console.log('📡 Received WebRTC offer from Mac');
  console.log('Offer data keys:', Object.keys(data));
  console.log('Has offer?', !!data.offer);
  if (data.offer) {
    console.log('Offer keys:', Object.keys(data.offer));
    console.log('Offer type:', data.offer.type);
    console.log('Offer has sdp?', !!data.offer.sdp);
    console.log('SDP length:', data.offer.sdp ? data.offer.sdp.length : 0);
  }
  await handleOffer(data.offer);
});

socket.on('webrtc:ice-candidate', async ({ candidate }) => {
  console.log('🧊 Received ICE candidate from Mac');
  await handleIceCandidate(candidate);
});

async function handleOffer(offer) {
  try {
    console.log('🔗 Creating WebRTC peer connection...');
    
    // Create peer connection with STUN server
    peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    // Handle ICE candidates
    peerConnection.onicecandidate = ({ candidate }) => {
      if (candidate) {
        console.log('🧊 Generated ICE candidate, sending to Mac');
        socket.emit('webrtc:ice-candidate', {
          candidate: {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid
          }
        });
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      console.log(`\n📊 WebRTC Connection State: ${state}`);
      
      if (state === 'connected') {
        isWebRTCConnected = true;
        console.log('\n🎉 WebRTC P2P CONNECTION ESTABLISHED!');
        console.log('✅ Direct peer-to-peer connection is now active');
        console.log('\n🧪 TEST: You can now kill the relay server (Ctrl+C in relay server terminal)');
        console.log('        The connection should stay alive!\n');
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        isWebRTCConnected = false;
        console.log('❌ WebRTC connection lost');
      }
    };

    // Handle data channel from Mac
    peerConnection.ondatachannel = ({ channel }) => {
      console.log('📬 Received data channel from Mac');
      dataChannel = channel;
      setupDataChannel();
    };

    // Set remote description (the offer from Mac)
    console.log('Setting remote description with type:', offer.type);
    await peerConnection.setRemoteDescription(offer);
    console.log('✅ Remote description set');

    // Create answer
    console.log('📡 Creating WebRTC answer...');
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    console.log('📡 Sending WebRTC answer to Mac');
    socket.emit('webrtc:answer', {
      answer: {
        sdp: peerConnection.localDescription.sdp,
        type: peerConnection.localDescription.type
      }
    });
  } catch (error) {
    console.error('❌ Failed to handle offer:', error);
  }
}

async function handleIceCandidate(candidate) {
  try {
    if (peerConnection && candidate.candidate) {
      await peerConnection.addIceCandidate(candidate);
      console.log('✅ ICE candidate added');
    }
  } catch (error) {
    console.error('❌ Failed to add ICE candidate:', error);
  }
}

function setupDataChannel() {
  if (!dataChannel) return;

  dataChannel.onopen = () => {
    console.log('✅ WebRTC data channel opened');
    isWebRTCConnected = true;
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 SUCCESS! WebRTC P2P is fully connected!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('📝 Test Instructions:');
    console.log('   1. Go to the relay server terminal');
    console.log('   2. Press Ctrl+C to terminate it');
    console.log('   3. Come back here and type a command');
    console.log('   4. If you see terminal output, P2P is working! ✅\n');
    
    // Enable interactive mode
    startInteractiveMode();
  };

  dataChannel.onclose = () => {
    console.log('⚠️  WebRTC data channel closed');
    isWebRTCConnected = false;
  };

  dataChannel.onerror = (error) => {
    console.error('❌ WebRTC data channel error:', error);
    isWebRTCConnected = false;
  };

  dataChannel.onmessage = ({ data }) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'terminal:output') {
        // Display terminal output
        process.stdout.write(message.payload);
      }
    } catch (error) {
      console.error('❌ Error parsing WebRTC message:', error);
    }
  };
}

function startInteractiveMode() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '$ '
  });

  console.log('💬 Interactive mode started. Type commands and press Enter.');
  console.log('   Type "exit" or press Ctrl+C to quit.\n');
  
  rl.prompt();

  rl.on('line', (line) => {
    const command = line.trim();
    
    if (command === 'exit') {
      console.log('\n👋 Exiting...');
      cleanup();
      process.exit(0);
    }
    
    if (command && isWebRTCConnected && dataChannel && dataChannel.readyState === 'open') {
      // Send command via WebRTC
      dataChannel.send(JSON.stringify({
        type: 'terminal:input',
        payload: command + '\r'
      }));
    } else if (!isWebRTCConnected) {
      console.log('⚠️  WebRTC not connected, command not sent');
      rl.prompt();
    } else {
      rl.prompt();
    }
  });

  rl.on('close', () => {
    console.log('\n👋 Exiting...');
    cleanup();
    process.exit(0);
  });
}

// Fallback: WebSocket-based terminal communication
socket.on('terminal:output', (data) => {
  if (!isWebRTCConnected) {
    // Only process via WebSocket if WebRTC is not connected
    process.stdout.write(data);
  }
});

socket.on('paired_device_disconnected', ({ message }) => {
  console.log(`\n❌ ${message}`);
  cleanup();
  process.exit(0);
});

socket.on('disconnect', (reason) => {
  console.log(`\n❌ Disconnected from relay server: ${reason}`);
  
  if (isWebRTCConnected) {
    console.log('✅ BUT WebRTC P2P is still connected!');
    console.log('   You can continue using the terminal via P2P');
  } else {
    cleanup();
    process.exit(1);
  }
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
  cleanup();
  process.exit(1);
});

socket.on('error', ({ message }) => {
  console.error(`❌ Error: ${message}`);
});

function cleanup() {
  if (dataChannel) {
    dataChannel.close();
  }
  if (peerConnection) {
    peerConnection.close();
  }
  if (socket) {
    socket.disconnect();
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down test client...');
  cleanup();
  process.exit(0);
});

console.log('⏳ Waiting for connection...\n');
