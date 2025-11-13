# WebRTC P2P Testing Guide

This guide will help you test the new WebRTC P2P connection feature, which allows Mac and mobile clients to communicate directly without needing the relay server after initial pairing.

## What Changed

Previously, all terminal communication went through the relay server. Now:

1. **Relay server** is only used for:
   - Initial device registration
   - Pairing code exchange
   - WebRTC signaling (exchanging connection info)

2. **After WebRTC connects**, the clients communicate **directly** via a peer-to-peer data channel:
   - Terminal input/output flows directly between Mac and mobile
   - **You can terminate the relay server** and the clients will stay connected!

## Setup

### 1. Install Dependencies

**Mac Client:**
```bash
cd mac-client
npm install
```

**Mobile App:**
```bash
cd mobile
npm install
npx pod-install  # iOS only
```

**Relay Server:**
```bash
cd relay-server
npm install
```

### 2. Start the Services

**Terminal 1 - Relay Server:**
```bash
cd relay-server
npm run dev
```

**Terminal 2 - Mac Client:**
```bash
cd mac-client
npm run dev
```

**Terminal 3 - Mobile App:**
```bash
cd mobile
npm start
# Then press 'i' for iOS or 'a' for Android
```

## Testing WebRTC P2P Connection

### Test 1: Basic P2P Connection

1. Start all three services (relay server, Mac client, mobile app)
2. On the Mac client, you'll see a pairing code (e.g., `123456`)
3. On the mobile app, enter the pairing code
4. **Wait for WebRTC connection** - you should see:
   - Mac client: `🎉 WebRTC P2P connection established!`
   - Mobile app status bar: `P2P Connected ⚡`
5. Test terminal commands:
   ```bash
   ls
   pwd
   echo "Hello from P2P!"
   ```
6. Verify commands work correctly

### Test 2: Server Independence (The Critical Test!)

This is the **key test** that proves P2P is working:

1. Follow Test 1 to establish P2P connection
2. Verify status shows `P2P Connected ⚡` on mobile
3. **Terminate the relay server** (Ctrl+C in the relay server terminal)
4. **Terminal should still work!** Try:
   ```bash
   ls -la
   git status
   echo "Still connected without server!"
   ```
5. If commands work, **WebRTC P2P is successful!** 🎉
6. If terminal stops responding, check the troubleshooting section below

### Test 3: Fallback to Relay Mode

Test that WebSocket fallback still works:

1. Start relay server and Mac client
2. On Mac client, **comment out** the `setupWebRTC()` call temporarily to disable WebRTC
3. Pair mobile app with Mac
4. Terminal should work via relay server (status shows `Paired (Relay)`)
5. Try terminating relay server - terminal should **stop working** (expected)
6. Re-enable WebRTC in Mac client

### Test 4: Reconnection After Network Issue

1. Establish P2P connection
2. Put your phone in airplane mode for 5 seconds
3. Disable airplane mode
4. WebRTC should attempt to reconnect
5. Check if connection is restored

## Expected Behavior

### When WebRTC is Connected:
- ✅ Mobile status: `P2P Connected ⚡`
- ✅ Mac client shows: `WebRTC P2P connection established!`
- ✅ Terminal commands work
- ✅ **Relay server can be terminated** without breaking the connection
- ✅ Low latency (direct peer-to-peer)

### When Using Relay Fallback:
- ⚠️  Mobile status: `Paired (Relay)`
- ⚠️  All traffic goes through relay server
- ⚠️  Terminating relay server breaks the connection
- ⚠️  Higher latency (traffic routes through server)

## Console Logs to Watch

### Mac Client:
```
🔗 Setting up WebRTC P2P connection...
📡 Generated local description, sending offer to mobile
🧊 Generated ICE candidate, sending to mobile
📡 Received WebRTC answer from mobile
✅ WebRTC remote description set
✅ ICE candidate added
WebRTC State: connected
🎉 WebRTC P2P connection established!
✅ WebRTC data channel opened
```

### Mobile App (React Native Debugger):
```
📡 Received WebRTC offer from Mac
✅ Remote description set
📡 Sending WebRTC answer to Mac
🧊 Generated ICE candidate, sending to Mac
✅ ICE candidate added
WebRTC Connection State: connected
🎉 WebRTC P2P connection established!
📬 Received data channel from Mac
✅ WebRTC data channel opened
```

### Relay Server:
```
📡 Relaying WebRTC offer from Mac xxx to Mobile yyy
📡 Relaying WebRTC answer from Mobile yyy to Mac xxx
🧊 Relaying ICE candidate from mac xxx to mobile yyy
🧊 Relaying ICE candidate from mobile yyy to mac xxx
```

After WebRTC connects, relay server should see **no more terminal traffic** (good sign!).

## Troubleshooting

### WebRTC Connection Fails

**Symptoms:**
- Status stays at `Paired (Relay)`
- Mac doesn't show "WebRTC P2P connection established"
- Terminating server breaks connection

**Solutions:**

1. **Check STUN server access:**
   - WebRTC uses Google's STUN server: `stun:stun.l.google.com:19302`
   - Ensure your network allows UDP traffic to this server
   - Try on a different network (mobile hotspot, different WiFi)

2. **Check firewall/NAT:**
   - Some corporate networks block WebRTC
   - Try on home network or mobile hotspot

3. **Check console for errors:**
   - Mac client: Look for WebRTC errors in terminal
   - Mobile: Use React Native debugger to see errors

4. **Verify package installation:**
   ```bash
   # Mac client
   cd mac-client && npm list node-datachannel
   
   # Mobile
   cd mobile && npm list react-native-webrtc
   ```

### Connection Works but Drops Quickly

**Symptoms:**
- WebRTC connects briefly
- Connection state changes to `disconnected` or `failed`

**Solutions:**

1. **Check ICE candidates:**
   - Look for "ICE candidate" logs on both sides
   - If you don't see any, STUN server might be blocked

2. **Network stability:**
   - Ensure stable WiFi/mobile connection
   - Try moving closer to router

3. **Keep-alive:**
   - WebRTC should handle keep-alive automatically
   - If connection drops, it may be a firewall timeout issue

### Terminal Commands Don't Work After Server Termination

**Symptoms:**
- Status shows `P2P Connected ⚡`
- But commands don't execute after killing relay server

**Possible Causes:**

1. **WebRTC fallback not working:**
   - Check that `isWebRTCConnected` is actually `true`
   - Look for errors in sending messages via data channel

2. **Data channel not open:**
   - Check for "WebRTC data channel opened" log
   - Data channel state should be `open`

3. **Code still using WebSocket:**
   - Verify the code checks `isWebRTCConnected()` before sending
   - Check that `sendMessage` is being called on WebRTC service

## Performance Comparison

Test latency difference:

**Via Relay Server (WebSocket):**
```bash
time echo "test"
# Should see ~50-200ms delay (depends on server location)
```

**Via WebRTC P2P:**
```bash
# After WebRTC connects, try same command:
time echo "test"
# Should see ~10-50ms delay (direct connection)
```

## Security Note

⚠️ **Current Implementation:**
- WebRTC uses DTLS (encryption is enabled by default)
- Connection is encrypted end-to-end
- Relay server **cannot see terminal traffic** after P2P connects
- This is significantly more secure than relay-only mode!

✅ **Improved Security:**
- Terminal data is encrypted between peers
- Relay server only sees signaling messages
- Lower risk of server-side data interception

## Advanced: Network Debugging

Use `tcpdump` or Wireshark to verify P2P traffic:

1. Find your network interface:
   ```bash
   ifconfig
   ```

2. Capture WebRTC traffic:
   ```bash
   sudo tcpdump -i en0 udp and port 19302
   ```

3. After WebRTC connects, you should see UDP packets

4. Terminate relay server - UDP traffic should continue!

## Next Steps

Once WebRTC P2P is confirmed working:

1. ✅ Update documentation (ARCHITECTURE.md)
2. ✅ Add connection quality indicators
3. 🔄 Implement automatic reconnection
4. 🔄 Add metrics (latency, packet loss)
5. 🔄 Consider TURN server for difficult networks

## Success Criteria

✅ **WebRTC P2P is working if:**
1. Mobile status shows `P2P Connected ⚡`
2. Mac shows "WebRTC P2P connection established!"
3. Terminal commands execute correctly
4. **Relay server can be killed without breaking connection**
5. Lower latency compared to relay mode

---

**Last Updated:** 2025-11-06

**WebRTC Implementation:** Version 1.0.0
