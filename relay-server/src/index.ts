import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Store connected devices
interface Device {
  socket: Socket;
  type: 'mac' | 'mobile';
  pairingCode?: string;
  pairedWith?: string; // Socket ID of paired device
}

const devices = new Map<string, Device>();
const pairingCodes = new Map<string, string>(); // code -> mac socket ID

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    connectedDevices: {
      mac: Array.from(devices.values()).filter(d => d.type === 'mac').length,
      mobile: Array.from(devices.values()).filter(d => d.type === 'mobile').length,
    }
  });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Device connected:', socket.id);

  // Register device
  socket.on('register', ({ type }: { type: 'mac' | 'mobile' }) => {
    console.log(`Registering ${type} device:`, socket.id);

    if (type === 'mac') {
      // If Mac already exists, clean up old pairing code and pairing
      const existingDevice = devices.get(socket.id);
      if (existingDevice && existingDevice.pairingCode) {
        pairingCodes.delete(existingDevice.pairingCode);
        console.log(`🗑️  Removed old pairing code: ${existingDevice.pairingCode}`);
      }

      // Generate new pairing code for Mac
      const pairingCode = Math.floor(100000 + Math.random() * 900000).toString();

      devices.set(socket.id, {
        socket,
        type: 'mac',
        pairingCode,
        pairedWith: undefined // Clear any existing pairing
      });

      pairingCodes.set(pairingCode, socket.id);

      // Send pairing code to Mac
      socket.emit('registered', {
        type: 'mac',
        pairingCode,
        message: 'Mac registered. Share this code with your mobile device.'
      });

      console.log(`✅ Mac registered with code: ${pairingCode}`);

      // Auto-expire pairing code after 5 minutes
      setTimeout(() => {
        pairingCodes.delete(pairingCode);
        const device = devices.get(socket.id);
        if (device && !device.pairedWith) {
          console.log(`⏰ Pairing code expired: ${pairingCode}`);
        }
      }, 5 * 60 * 1000);
    } else {
      devices.set(socket.id, {
        socket,
        type: 'mobile'
      });

      socket.emit('registered', {
        type: 'mobile',
        message: 'Mobile device registered. Enter pairing code to connect.'
      });

      console.log('✅ Mobile device registered');
    }
  });

  // Pair mobile with Mac using code
  socket.on('pair', ({ pairingCode, cols, rows }: { pairingCode: string; cols?: number; rows?: number }) => {
    const macSocketId = pairingCodes.get(pairingCode);

    if (!macSocketId) {
      socket.emit('error', { message: 'Invalid or expired pairing code' });
      return;
    }

    const macDevice = devices.get(macSocketId);
    const mobileDevice = devices.get(socket.id);

    if (!macDevice || !mobileDevice) {
      socket.emit('error', { message: 'Device not found' });
      return;
    }

    // Check if Mac is already paired
    if (macDevice.pairedWith) {
      socket.emit('error', { message: 'Mac is already paired with another device' });
      return;
    }

    // Pair devices
    macDevice.pairedWith = socket.id;
    mobileDevice.pairedWith = macSocketId;

    devices.set(macSocketId, macDevice);
    devices.set(socket.id, mobileDevice);
    
    // Send terminal dimensions to Mac if provided
    if (cols && rows) {
      console.log(`📐 Mobile terminal dimensions: ${cols}x${rows}`);
      macDevice.socket.emit('terminal:dimensions', { cols, rows });
    }

    // Notify both devices
    socket.emit('paired', {
      message: 'Successfully paired with Mac',
      macId: macSocketId
    });

    macDevice.socket.emit('paired', {
      message: 'Mobile device connected',
      mobileId: socket.id
    });

    // Remove pairing code
    pairingCodes.delete(pairingCode);

    console.log(`🔗 Paired: Mac ${macSocketId} ↔ Mobile ${socket.id}`);
  });

  // Relay terminal output from Mac to Mobile
  socket.on('terminal:output', (data: string) => {
    const device = devices.get(socket.id);
    if (!device || device.type !== 'mac' || !device.pairedWith) return;

    const pairedDevice = devices.get(device.pairedWith);
    if (pairedDevice) {
      pairedDevice.socket.emit('terminal:output', data);
    }
  });

  // Relay terminal input from Mobile to Mac
  socket.on('terminal:input', (data: string) => {
    const device = devices.get(socket.id);
    if (!device || device.type !== 'mobile' || !device.pairedWith) return;

    const pairedDevice = devices.get(device.pairedWith);
    if (pairedDevice) {
      pairedDevice.socket.emit('terminal:input', data);
    }
  });

  // Relay terminal resize from Mobile to Mac
  socket.on('terminal:resize', ({ cols, rows }: { cols: number; rows: number }) => {
    const device = devices.get(socket.id);
    if (!device || device.type !== 'mobile' || !device.pairedWith) return;

    const pairedDevice = devices.get(device.pairedWith);
    if (pairedDevice) {
      pairedDevice.socket.emit('terminal:resize', { cols, rows });
    }
  });

  // Relay terminal dimensions from Mobile to Mac
  socket.on('terminal:dimensions', ({ cols, rows }: { cols: number; rows: number }) => {
    const device = devices.get(socket.id);
    if (!device || device.type !== 'mobile' || !device.pairedWith) return;

    const pairedDevice = devices.get(device.pairedWith);
    if (pairedDevice) {
      pairedDevice.socket.emit('terminal:dimensions', { cols, rows });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const device = devices.get(socket.id);

    if (device) {
      console.log(`❌ ${device.type} device disconnected:`, socket.id);

      // Notify paired device
      if (device.pairedWith) {
        const pairedDevice = devices.get(device.pairedWith);
        if (pairedDevice) {
          pairedDevice.socket.emit('paired_device_disconnected', {
            message: `Paired ${device.type} device disconnected`
          });
          // Clear pairing
          pairedDevice.pairedWith = undefined;
          devices.set(device.pairedWith, pairedDevice);
        }
      }

      // Remove pairing code if exists
      if (device.pairingCode) {
        pairingCodes.delete(device.pairingCode);
      }

      devices.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log('🌐 MobiFai Relay Server');
  console.log(`📡 Running on port ${PORT}`);
  console.log(`🔗 Devices can connect to: http://localhost:${PORT}`);
  console.log('');
  console.log('Waiting for devices to connect...');
});
