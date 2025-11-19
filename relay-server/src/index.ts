import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import passport from 'passport';
import session from 'express-session';
import './auth.js'; // Import auth configuration
import { generateToken, verifyToken } from './auth.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(
  session({
    secret: process.env.COOKIE_KEY || 'mobifai-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      secure: false // Set to true if using HTTPS
    }
  })
);
app.use(passport.initialize());
app.use(passport.session());

// Store connected devices
interface Device {
  socket: Socket;
  deviceId: string; // Persistent ID from client
  type: 'mac' | 'mobile';
  userId?: string; // Authenticated User ID (email)
  userProfile?: any;
  pairedWith?: string; // DeviceID of paired device
}

// Maps to lookup devices
const devicesBySocket = new Map<string, Device>();
const devicesById = new Map<string, Device>();

// Helper to match devices by User ID
function findAndPairDevice(currentDevice: Device) {
  const targetType = currentDevice.type === 'mac' ? 'mobile' : 'mac';
  const userId = currentDevice.userId;

  if (!userId) return;
  
  // Find a device of the target type with the SAME userId
  const peerEntry = Array.from(devicesById.values()).find(d => 
    d.type === targetType && 
    d.userId === userId && 
    !d.pairedWith // Must be available
  );

  if (peerEntry) {
    const peerDevice = peerEntry;
    
    // Pair them
    currentDevice.pairedWith = peerDevice.deviceId;
    peerDevice.pairedWith = currentDevice.deviceId;

    // Notify both
    console.log(`🔗 Paired ${currentDevice.type} (${currentDevice.deviceId}) <-> ${targetType} (${peerDevice.deviceId}) for user ${userId}`);
    
    currentDevice.socket.emit('paired', {
      message: `Connected to ${targetType}`,
      peerId: peerDevice.deviceId
    });
    
    peerDevice.socket.emit('paired', {
      message: `Connected to ${currentDevice.type}`,
      peerId: currentDevice.deviceId
    });

    // Send dimensions request
    if (currentDevice.type === 'mac' && peerDevice.type === 'mobile') {
      peerDevice.socket.emit('request_dimensions');
    } else if (currentDevice.type === 'mobile' && peerDevice.type === 'mac') {
      currentDevice.socket.emit('request_dimensions');
    }
  } else {
    console.log(`⏳ Waiting for ${targetType} device for user ${userId}...`);
    currentDevice.socket.emit('waiting_for_peer', { 
      message: `Waiting for ${targetType} device to connect...` 
    });
  }
}

// --- Auth Routes ---

// Initiate Google Login
// Client should open: http://server/auth/google?deviceId=...&type=...
app.get('/auth/google', (req, res, next) => {
  const { deviceId, type } = req.query;
  if (!deviceId || typeof deviceId !== 'string') {
    return res.status(400).send('Missing deviceId');
  }
  
  // Store state to retrieve deviceId after callback
  const state = JSON.stringify({ deviceId, type: type || 'unknown' });
  
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state
  })(req, res, next);
});

// Google Auth Callback
app.get(
  '/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/auth/failure' }),
  (req: any, res) => {
    // Authentication successful
    const stateStr = req.query.state as string;
    let deviceId = '';
    
    try {
      const state = JSON.parse(stateStr);
      deviceId = state.deviceId;
    } catch (e) {
      console.error('Failed to parse state', e);
      return res.redirect('/auth/failure');
    }

    const user = req.user;
    const token = generateToken(user);

    console.log(`✅ User authenticated: ${user.email} for device ${deviceId}`);

    // Find the device and emit the token
    const device = devicesById.get(deviceId);
    if (device) {
      device.socket.emit('authenticated', {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          photo: user.photo
        }
      });
      
      // Update device with user info immediately
      device.userId = user.email;
      device.userProfile = user;
      
      // Try to pair
      findAndPairDevice(device);

      res.send(`
        <html>
          <body style="background: #111; color: #0f0; font-family: monospace; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh;">
            <h1>✅ Authentication Successful</h1>
            <p>You can close this window and return to your application.</p>
            <script>
              setTimeout(() => window.close(), 2000);
            </script>
          </body>
        </html>
      `);
    } else {
      // Device might have disconnected, store pending token? 
      // For now just show success and hope client reconnects and asks for status (not implemented)
      // Or reliance on persistent socket for Mac, and short disconnect for mobile.
      res.send('Authentication successful. Please return to the app.');
    }
  }
);

app.get('/auth/failure', (req, res) => {
  res.send('Authentication failed. Please try again.');
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    devices: {
      total: devicesById.size,
      mac: Array.from(devicesById.values()).filter(d => d.type === 'mac').length,
      mobile: Array.from(devicesById.values()).filter(d => d.type === 'mobile').length,
    }
  });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Device connected:', socket.id);

  // Register device with optional token
  socket.on('register', ({ type, token, deviceId }: { type: 'mac' | 'mobile'; token?: string; deviceId: string }) => {
    if (!deviceId) {
       socket.emit('error', { message: 'deviceId required' });
       return;
    }

    console.log(`Registering ${type} device: ${deviceId} (${socket.id})`);
    
    let userId: string | undefined;
    let userProfile: any;

    // Verify token if provided
    if (token) {
      const decoded: any = verifyToken(token);
      if (decoded) {
        userId = decoded.email;
        userProfile = decoded;
        console.log(`🔓 Authenticated as ${userId}`);
      } else {
        console.log('❌ Invalid token provided');
        socket.emit('auth_error', { message: 'Invalid or expired token' });
        return;
      }
    }

    const device: Device = {
      socket,
      deviceId,
      type,
      userId,
      userProfile,
      pairedWith: undefined
    };

    // Store device info
    devicesBySocket.set(socket.id, device);
    devicesById.set(deviceId, device);

    // If authenticated, try to find a peer
    if (userId) {
      findAndPairDevice(device);
    } else {
      // Not authenticated - prompt for login
      socket.emit('login_required', {
        message: 'Authentication required',
        loginUrl: `/auth/google?deviceId=${deviceId}&type=${type}`
      });
    }
  });

  // --- Helper to route messages ---
  const routeMessage = (eventName: string, data: any) => {
    const device = devicesBySocket.get(socket.id);
    if (device?.pairedWith) {
      const peer = devicesById.get(device.pairedWith);
      if (peer) {
        peer.socket.emit(eventName, data);
      } else {
        // Peer lost?
        device.pairedWith = undefined;
      }
    }
  };

  // --- WebRTC Signaling ---
  socket.on('webrtc:offer', (data) => routeMessage('webrtc:offer', data));
  socket.on('webrtc:answer', (data) => routeMessage('webrtc:answer', data));
  socket.on('webrtc:ice-candidate', (data) => routeMessage('webrtc:ice-candidate', data));

  // --- Terminal IO ---
  socket.on('terminal:input', (data) => routeMessage('terminal:input', data));
  socket.on('terminal:output', (data) => routeMessage('terminal:output', data));
  socket.on('terminal:resize', (data) => routeMessage('terminal:resize', data));
  socket.on('terminal:dimensions', (data) => routeMessage('terminal:dimensions', data));
  socket.on('system:message', (data) => routeMessage('system:message', data));

  // Handle disconnect
  socket.on('disconnect', () => {
    const device = devicesBySocket.get(socket.id);
    if (device) {
      console.log(`❌ ${device.type} device disconnected:`, socket.id);
      
      if (device.pairedWith) {
        const peer = devicesById.get(device.pairedWith);
        if (peer) {
          peer.socket.emit('paired_device_disconnected', {
            message: `${device.type} disconnected`
          });
          peer.pairedWith = undefined;
          // Re-enter waiting state
          if (peer.userId) {
            findAndPairDevice(peer);
          }
        }
      }
      
      devicesBySocket.delete(socket.id);
      // Don't delete from devicesById immediately to allow reconnect? 
      // Actually for this simple implementation, let's delete it to avoid stale sockets
      // But if we want re-auth persistence we might want to keep it.
      // For now, let's assume reconnect creates a NEW socket but uses SAME deviceId.
      // We update the socket reference in `register`.
    }
  });
});

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';

httpServer.listen(PORT, HOST, () => {
  console.log('🌐 MobiFai Relay Server (Google Auth Enabled)');
  console.log(`📡 Running on port ${PORT}`);
  console.log(`🔗 Auth Callback URL: http://192.168.178.72:${PORT}/auth/google/callback`);
  console.log('');
});
