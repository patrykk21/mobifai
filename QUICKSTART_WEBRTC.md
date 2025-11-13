# Quick Start - WebRTC P2P Mode

## 🚀 Get Started in 5 Minutes

### Step 1: Install Dependencies

```bash
# Relay Server
cd relay-server
npm install

# Mac Client  
cd ../mac-client
npm install

# Mobile App
cd ../mobile
npm install
# For iOS only:
npx pod-install
```

### Step 2: Start Services

Open **3 terminal windows**:

**Terminal 1 - Relay Server:**
```bash
cd relay-server
npm run dev
```
Wait for: `📡 Running on port 3000`

**Terminal 2 - Mac Client:**
```bash
cd mac-client
npm run dev
```
Wait for: `🔑 Pairing Code: XXXXXX`

**Terminal 3 - Mobile App:**
```bash
cd mobile
npm start
# Then press 'i' for iOS or 'a' for Android
```

### Step 3: Pair Devices

1. On mobile app, enter the 6-digit pairing code from Mac client
2. Wait for connection (2-5 seconds)
3. Look for these indicators:

**Mac Console:**
```
🔗 Setting up WebRTC P2P connection...
📡 Generated local description, sending offer to mobile
✅ WebRTC remote description set
🎉 WebRTC P2P connection established!
✅ WebRTC data channel opened
```

**Mobile App:**
- Status bar changes to: `P2P Connected ⚡`

### Step 4: Test Terminal

Try some commands on mobile:
```bash
ls
pwd
echo "Hello from P2P!"
git status
```

### Step 5: The Magic Moment! 🎉

**Kill the relay server:**
- Go to relay server terminal (Terminal 1)
- Press `Ctrl+C` to stop the server

**Terminal should still work!**
```bash
# Try more commands:
ls -la
whoami
date
```

If commands still work after killing the server, **WebRTC P2P is working!** 🚀

## ✅ What Success Looks Like

### Before Killing Server
- Mobile status: `P2P Connected ⚡`
- Mac console: Shows WebRTC connection logs
- Terminal commands execute normally

### After Killing Server
- Mobile status: Still `P2P Connected ⚡` (or shows disconnected relay, but terminal works)
- Mac console: No errors related to relay server
- **Terminal commands still execute!** ✅

## ❌ Troubleshooting

### Mobile Status Stays "Paired (Relay)"
- WebRTC connection didn't establish
- Try different network (mobile hotspot)
- Check console for WebRTC errors
- **Relay mode still works** (fallback is active)

### Terminal Stops After Killing Server
- WebRTC didn't actually connect
- Check both Mac and mobile console logs
- Look for "WebRTC data channel opened" message
- Try restarting and pairing again

### WebRTC Connection Drops Quickly
- Network/firewall may be blocking WebRTC
- Check if STUN server is accessible: `stun:stun.l.google.com:19302`
- Try on different network

## 📖 More Information

- **Full Testing Guide:** `WEBRTC_TESTING.md`
- **Architecture Details:** `ARCHITECTURE.md`
- **Implementation Summary:** `WEBRTC_IMPLEMENTATION_SUMMARY.md`

## 🎯 Key Benefits

✅ **True P2P** - Direct connection between Mac and mobile
✅ **Server Independent** - Works even if server is killed
✅ **Encrypted** - End-to-end encryption via WebRTC DTLS
✅ **Low Latency** - Direct peer-to-peer communication
✅ **Private** - Server cannot see your terminal commands
✅ **Fallback** - Automatically uses relay if WebRTC fails

## 🔧 Debug Mode

For detailed WebRTC logs:

**Mac Client:**
- Already shows detailed WebRTC logs in color

**Mobile App:**
- Open React Native debugger
- Check console for WebRTC messages

**Relay Server:**
- Set `DEBUG_MODE=true` in `.env` for fixed pairing code `0000`

## 🎉 That's It!

You now have a true peer-to-peer terminal connection that doesn't rely on the relay server after pairing. Enjoy your secure, private, and independent terminal access!

---

**Questions?** See `WEBRTC_TESTING.md` for comprehensive troubleshooting.
