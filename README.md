# MobiFai

**Connect your mobile phone to your Mac terminal through an external relay server.** Control your Mac terminal from anywhere in the world!

📦 **GitHub Repository:** https://github.com/patrykk21/mobifai
📖 **Quick Start:** See [QUICKSTART.md](QUICKSTART.md)
🏗️ **Architecture:** See [ARCHITECTURE.md](ARCHITECTURE.md)

## 🏗️ Architecture

```
┌──────────────┐         ┌──────────────────┐         ┌──────────────┐
│              │         │                  │         │              │
│  Mac Client  │←────────│  Relay Server    │────────→│  iOS App     │
│  (Terminal)  │  WebSocket  (Cloud/VPS)   │  WebSocket  (Controls)   │
│              │         │                  │         │              │
└──────────────┘         └──────────────────┘         └──────────────┘
      ↓                         │                           ↓
  Runs zsh/bash           Routes messages              Sends commands
```

**Key Features:**
- 🌐 **External Relay Server** - Deploy anywhere (Heroku, AWS, VPS)
- 💻 **Mac Client** - Runs on your Mac, executes terminal commands
- 📱 **Mobile App** - Bare React Native app for iOS & Android
- ⚡ **WebRTC P2P** - Direct peer-to-peer connection with automatic relay fallback
- 🔒 **Simple Pairing** - 4-digit codes that expire after 5 minutes
- 🚀 **Real-time** - Full terminal emulation with `node-pty`

## 📦 Project Structure

```
mobifai/
├── relay-server/        # External server (deploy to cloud)
│   └── src/
│       └── index.ts     # Relay/signaling server
│
├── mac-client/          # Mac terminal client
│   └── src/
│       └── index.ts     # Connects to relay + runs terminal
│
└── mobile/              # React Native app (iOS & Android)
    ├── src/
    │   ├── screens/
    │   │   ├── ConnectScreen.tsx
    │   │   └── TerminalScreen.tsx
    │   └── App.tsx
```

## 🚀 Quick Start

### 1. Deploy Relay Server (One Time)

The relay server can be deployed anywhere. Here are some options:

#### Option A: Run Locally for Testing

```bash
cd relay-server
npm install
npm run dev
```

Server runs on `http://localhost:3000`

#### Option B: Deploy to Heroku (Free Tier)

```bash
cd relay-server
heroku create mobifai-relay
git push heroku master
```

Your server URL: `https://mobifai-relay.herokuapp.com`

#### Option C: Deploy to Any VPS

```bash
# On your VPS (Ubuntu/Debian)
cd relay-server
npm install
npm run build
npm start

# Keep running with PM2
npm install -g pm2
pm2 start dist/index.js --name mobifai-relay
pm2 save
pm2 startup
```

### 2. Start Mac Client

```bash
cd mac-client
npm install

# Configure relay server URL
echo "RELAY_SERVER_URL=http://your-relay-server.com:3000" > .env

# Start the client
npm run dev
```

You'll see:
```
🖥️  MobiFai Mac Client
================================

📡 Connecting to relay server...
✅ Connected to relay server
✅ Mac registered. Share this code with your mobile device.

🔑 Pairing Code: 123456

Share this code with your mobile device to connect.
Code expires in 5 minutes.
```

**Copy the 6-digit code!**

### 3. Setup Mobile App

```bash
cd mobile
npm install
npm start
```

Scan QR code with:
- **iOS**: Camera app → Open in Expo Go
- **Android**: Expo Go app

### 4. Connect from Mobile

1. Open the app
2. Enter relay server URL: `http://your-relay-server.com:3000`
3. Enter the 6-digit pairing code from Mac
4. Tap "Connect"

🎉 **You're connected!** Start typing commands!

## 🖥️ Running on MacBook

### Complete Setup Flow

**Terminal 1: Start Relay Server**
```bash
cd relay-server
npm install  # First time only
npm run dev
```

Expected output:
```
🌐 MobiFai Relay Server
📡 Running on port 3000
```

**Terminal 2: Start Mac Client**
```bash
cd mac-client
npm install  # First time only
npm run dev
```

Expected output:
```
🖥️  MobiFai Mac Client
================================

📡 Connecting to relay server: http://localhost:3000...
✅ Connected to relay server

✅ Mac registered. Share this code with your mobile device.

🔑 Pairing Code: 863021

Share this code with your mobile device to connect.
Code expires in 5 minutes.
```

**📝 Copy the 6-digit pairing code** - you'll need it on your mobile device!

### Mac Client Configuration

Edit [mac-client/.env](mac-client/.env):

```bash
# Local testing
RELAY_SERVER_URL=http://localhost:3000

# Cloud deployment (Railway/Heroku)
RELAY_SERVER_URL=https://your-relay.railway.app
```

### Quick Commands

```bash
# Check relay server health
curl http://localhost:3000/health

# Stop Mac client (in terminal)
Ctrl+C

# Restart Mac client
cd mac-client && npm run dev
```

## 🔄 How It Works

### Pairing & Connection
1. **Mac Client** connects to relay server, gets 4-digit pairing code
2. **Mobile App** connects to relay server with pairing code
3. **Relay Server** pairs the two devices together
4. **WebRTC P2P** - Clients attempt to establish direct peer-to-peer connection
5. **Automatic Fallback** - If P2P fails, uses relay server for communication

### Communication Flow
- **P2P Mode** (preferred): Mobile ↔ Mac (direct WebRTC data channel)
- **Relay Mode** (fallback): Mobile ↔ Relay Server ↔ Mac (Socket.IO)

The relay server acts as a signaling server for WebRTC and provides fallback communication. It ONLY routes messages - it doesn't store or execute anything!

### iOS Simulator Note
⚠️ **WebRTC P2P does not work in iOS Simulator** due to network isolation limitations. The app automatically falls back to relay mode. P2P works perfectly on **real iOS devices**.

## 🌍 Deployment Options

### Relay Server

| Platform | Free Tier | Setup Difficulty | Best For |
|----------|-----------|------------------|----------|
| **Heroku** | ✅ Yes | Easy | Quick prototyping |
| **Railway** | ✅ Yes | Easy | Modern deployment |
| **Fly.io** | ✅ Yes | Medium | Global edge deployment |
| **DigitalOcean** | ❌ $5/mo | Medium | Full control |
| **AWS EC2** | ⚠️ Free tier | Hard | Enterprise |
| **Cloudflare Workers** | ✅ Yes | Hard | WebSocket limits |

### Recommended: Railway (Easiest Free Option)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy
cd relay-server
railway login
railway init
railway up
```

Your server will be live at: `https://your-project.railway.app`

## 🔧 Environment Variables

### Relay Server (.env)

```bash
PORT=3000
NODE_ENV=production
```

### Mac Client (.env)

```bash
RELAY_SERVER_URL=https://your-relay-server.com
```

## 📱 Mobile App - Building for Production

### iOS

```bash
cd mobile
npx expo build:ios
```

### Android

```bash
cd mobile
npx expo build:android
```

## 🔐 Security Considerations

**Current Implementation:**
- ✅ Pairing codes expire after 5 minutes
- ✅ One mobile device per Mac at a time
- ✅ Codes are single-use
- ❌ No encryption (use HTTPS/WSS in production!)
- ❌ No persistent authentication

**For Production:**
1. **Use HTTPS/WSS** - Deploy relay server with SSL
2. **Add encryption** - Encrypt terminal output end-to-end
3. **Rate limiting** - Prevent pairing code brute force
4. **Session tokens** - Add persistent authentication
5. **Audit logging** - Log all connections and commands

## 🐛 Troubleshooting

### Mac Client Won't Connect

```bash
# Check relay server is running
curl https://your-relay-server.com/health

# Should return: {"status":"ok", ...}
```

### Mobile App Can't Pair

1. Make sure Mac client is running
2. Check pairing code hasn't expired (5 minutes)
3. Generate a new code
4. Verify relay server URL is correct

### Terminal Not Responding

- Check Mac client terminal logs
- Ensure Mac client didn't crash
- Try disconnecting and reconnecting mobile app

### WebRTC P2P Not Connecting

- **iOS Simulator**: P2P doesn't work in simulator - use a real device
- **Real Device**: Check that both devices are on the same network or have accessible IPs
- **Fallback**: App automatically uses relay server if P2P fails
- **Status**: Check mobile app status bar - shows "P2P Connected ⚡" or "Paired (Relay)"

## 🎯 Use Cases

- 📊 **Remote Server Management** - Control your Mac from anywhere
- 🏠 **Home Automation** - Run scripts on your home Mac
- 🔧 **Development** - Quick terminal access on the go
- 🎮 **Gaming** - Start game servers remotely
- 🤖 **Bot Commands** - Trigger builds, deployments, etc.

## 🚧 Future Improvements

- [ ] End-to-end encryption
- [ ] Multiple terminal sessions
- [ ] File upload/download
- [ ] Command history and autocomplete
- [ ] Terminal recording and playback
- [ ] Biometric authentication
- [ ] Desktop notifications
- [ ] Custom CLI commands
- [ ] Team/multi-user support

## 📄 API Reference

### Relay Server WebSocket Events

#### Client → Server

- `register` - Register device (mac or mobile)
  ```javascript
  socket.emit('register', { type: 'mac' | 'mobile' });
  ```

- `pair` - Pair mobile with Mac using code
  ```javascript
  socket.emit('pair', { pairingCode: '123456' });
  ```

- `terminal:input` - Send terminal input (mobile → mac)
  ```javascript
  socket.emit('terminal:input', 'ls -la\n');
  ```

- `terminal:output` - Send terminal output (mac → mobile)
  ```javascript
  socket.emit('terminal:output', 'file1.txt\nfile2.txt\n');
  ```

#### Server → Client

- `registered` - Device registered successfully
- `paired` - Devices paired successfully
- `terminal:output` - Receive terminal output
- `terminal:input` - Receive terminal input
- `paired_device_disconnected` - Paired device disconnected
- `error` - Error occurred

## 📜 License

MIT

## 🙏 Contributing

Pull requests are welcome! For major changes, please open an issue first.

## ❓ FAQ

**Q: Does the relay server see my terminal output?**
A: Yes, currently it relays everything. Add end-to-end encryption for privacy.

**Q: Can multiple people connect to my Mac?**
A: No, only one mobile device can pair with a Mac at a time.

**Q: What happens if the relay server goes down?**
A: Connection is lost. Both devices will auto-reconnect when it's back up.

**Q: Can I use this without internet?**
A: Yes! Run the relay server on your local network and connect to its local IP.

**Q: Is this secure enough for production?**
A: For personal use, yes. For production, add HTTPS, encryption, and authentication.

## 🎉 Credits

Built with:
- [Socket.IO](https://socket.io/) - Real-time communication
- [node-pty](https://github.com/microsoft/node-pty) - Terminal emulation
- [React Native](https://reactnative.dev/) - Mobile app
- [Expo](https://expo.dev/) - React Native tooling
- [TypeScript](https://www.typescriptlang.org/) - Type safety

---

**Made with ❤️ for remote terminal access**
