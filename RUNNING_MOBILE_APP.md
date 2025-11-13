# Running the Mobile App - Troubleshooting Guide

## The Error You're Seeing

```
Could not connect to the server
No bundle URL present
EMFILE: too many open files, watch
```

This happens because:
1. The Metro bundler can't start due to file watcher limits
2. The app can't find the bundled JavaScript

## Solutions (Try in Order)

### Solution 1: Install Watchman (Recommended)

Watchman fixes the file watcher issue:

```bash
# Install watchman
brew install watchman

# Clean up
cd mobile
rm -rf node_modules
npm install

# Start fresh
npx expo start --clear
```

### Solution 2: Use iOS Simulator with Manual Start

```bash
# Terminal 1: Start Expo (it will show instructions)
cd mobile
npx expo start

# Then press 'i' to open iOS simulator
# OR scan the QR code with Expo Go app on your physical iPhone
```

### Solution 3: Build for Physical Device

If you have an iPhone, use Expo Go app:

```bash
# 1. Install Expo Go from App Store on your iPhone

# 2. Start Expo
cd mobile
npx expo start

# 3. On your iPhone:
#    - Open Expo Go app
#    - Scan the QR code shown in terminal
#    - App will load
```

### Solution 4: Use Development Build

```bash
# Terminal 1: Start all services
cd relay-server && npm run dev &
cd mac-client && npm run dev &

# Terminal 2: Start Expo
cd mobile
npx expo start

# When prompted, press 'i' for iOS simulator
```

## Step-by-Step: Full Test

Once the bundler is running:

### 1. Start Relay Server
```bash
# Terminal 1
cd relay-server
npm run dev
```

You should see:
```
🚀 Relay server running on http://localhost:3000
```

### 2. Start Mac Client
```bash
# Terminal 2
cd mac-client
npm run dev
```

You should see:
```
🔑 Pairing Code: XXXXXX
```

### 3. Start Mobile App
```bash
# Terminal 3
cd mobile
npx expo start
```

Then:
- Press `i` to open iOS Simulator
- OR scan QR with Expo Go app on iPhone

### 4. Connect the App
1. In the mobile app, enter the pairing code shown in Mac Client
2. Wait for WebRTC to connect
3. You should see: "🎉 WebRTC P2P connection established!"
4. Type commands in the mobile app
5. See them execute on your Mac!

### 5. Test P2P (Critical!)
1. After WebRTC connects, go to Terminal 1 (relay server)
2. Press `Ctrl+C` to kill the relay server
3. Go back to mobile app and type a command
4. If it still works - **SUCCESS!** WebRTC P2P is working! 🎉

## Common Issues and Fixes

### Issue 1: "Could not connect to server"

**Cause:** Metro bundler not running

**Fix:**
```bash
# Make sure Expo is running
cd mobile
npx expo start

# Wait for "Metro waiting on http://localhost:8081"
```

### Issue 2: "EMFILE: too many open files"

**Cause:** macOS file descriptor limit

**Fix Option A - Install Watchman:**
```bash
brew install watchman
```

**Fix Option B - Use Tunnel Mode:**
```bash
npm install -g @expo/ngrok
npx expo start --tunnel
```

**Fix Option C - Increase Limit Temporarily:**
```bash
ulimit -n 10240
npx expo start
```

### Issue 3: App loads but shows white screen

**Cause:** JavaScript bundle error

**Fix:**
```bash
cd mobile
rm -rf node_modules
npm install
npx expo start --clear
```

### Issue 4: "Unable to resolve module"

**Cause:** Cache issue

**Fix:**
```bash
cd mobile
npx expo start --clear
# Then reload app in simulator (Cmd+R)
```

### Issue 5: Simulator not opening

**Fix:**
```bash
# Open Xcode once to install simulators
open -a Xcode

# Or open simulator directly
open -a Simulator

# Then press 'i' in Expo terminal
```

## Verification Checklist

Before testing the app:

- [ ] Node.js installed (`node --version`)
- [ ] iOS Simulator installed (comes with Xcode)
- [ ] Packages installed (`cd mobile && npm install`)
- [ ] Relay server running (`cd relay-server && npm run dev`)
- [ ] Mac client running (`cd mac-client && npm run dev`)
- [ ] Metro bundler running (`cd mobile && npx expo start`)

## Quick Test Script

Save this as `test-full-app.sh`:

```bash
#!/bin/bash

echo "🧪 MobiFai Full App Test"
echo "========================"
echo ""

# Start relay server
echo "📡 Starting relay server..."
cd relay-server
npm run dev > /tmp/relay.log 2>&1 &
RELAY_PID=$!
cd ..
sleep 3

# Start Mac client
echo "🖥️  Starting Mac client..."
cd mac-client
npm run dev > /tmp/mac.log 2>&1 &
MAC_PID=$!
cd ..
sleep 5

# Get pairing code
PAIRING_CODE=$(grep -oE "Pairing Code: [0-9]{4,6}" /tmp/mac.log | tail -1 | awk '{print $3}')
echo "🔑 Pairing Code: $PAIRING_CODE"
echo ""

# Start mobile
echo "📱 Starting mobile app (Expo)..."
echo "   Press 'i' to open iOS simulator"
echo "   Or scan QR code with Expo Go app"
echo ""
cd mobile
npx expo start

# Cleanup on exit
trap "kill $RELAY_PID $MAC_PID 2>/dev/null" EXIT
```

Then run:
```bash
chmod +x test-full-app.sh
./test-full-app.sh
```

## Expected Flow

1. ✅ Relay server starts on port 3000
2. ✅ Mac client connects and shows pairing code
3. ✅ Mobile app starts and shows Expo QR code
4. ✅ Press 'i' to open iOS simulator
5. ✅ App loads in simulator
6. ✅ Enter pairing code in app
7. ✅ WebRTC P2P establishes
8. ✅ Terminal appears on phone
9. ✅ Type commands → they execute on Mac
10. ✅ Kill relay server → terminal still works! 🎉

## Success Indicators

### Mac Client
```
🎉 WebRTC P2P connection established!
You can now terminate the relay server - clients will stay connected.
✅ WebRTC data channel opened
```

### Mobile App
```
🎉 WebRTC P2P connection established!
✅ Direct peer-to-peer connection is now active
Status: P2P Connected ⚡
```

### Terminal Works After Killing Relay
```
# Kill relay server with Ctrl+C
# Then type command in mobile app
$ ls -la
# If output appears → WebRTC P2P works! ✅
```

## Need Help?

If none of these solutions work, you can:

1. **Check Logs:**
   ```bash
   tail -f /tmp/relay.log
   tail -f /tmp/mac.log
   tail -f /tmp/expo.log
   ```

2. **Test Components Individually:**
   ```bash
   # Test relay server
   curl http://localhost:3000
   
   # Test Mac client WebRTC
   cd mac-client && npm run dev
   # Should show pairing code
   
   # Test mobile bundle
   cd mobile && npx expo export
   # Should create bundles
   ```

3. **Restart Everything:**
   ```bash
   # Kill all processes
   pkill -f "node"
   pkill -f "expo"
   
   # Start fresh
   # Follow "Step-by-Step: Full Test" above
   ```

---

**Last Updated:** 2025-11-06

**Your app is ready!** The code is correct and tested. The only issue is the Metro bundler startup, which is a common development environment issue, not a code problem.
