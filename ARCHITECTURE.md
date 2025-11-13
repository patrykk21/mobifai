# MobiFai Architecture

## Overview

MobiFai uses a **WebRTC peer-to-peer architecture** with a relay server for initial signaling. After devices pair, they communicate **directly** via WebRTC, allowing the relay server to be terminated without breaking the connection.

## Architecture Diagram

### Phase 1: Initial Pairing & Signaling (via Relay Server)

```
                    ┌─────────────────────┐
                    │   Relay Server      │
                    │   (WebRTC Signaling)│
                    │                     │
                    │   - Pairing codes   │
                    │   - WebRTC signaling│
                    │   - ICE candidates  │
                    └─────────┬───────────┘
                              │
                 ┌────────────┴────────────┐
                 │ WebSocket        WebSocket │
          (Signaling Only)        (Signaling Only)
                 │                         │
        ┌────────▼────────┐       ┌───────▼────────┐
        │   Mac Client    │       │   iOS App      │
        │   (Your Mac)    │       │   (Your Phone) │
        │                 │       │                │
        │ - Gets code     │       │ - Enters code  │
        │ - Creates offer │       │ - Creates answer│
        │ - ICE gathering │       │ - ICE gathering│
        └─────────────────┘       └────────────────┘
```

### Phase 2: Direct P2P Connection (Relay Server Optional!)

```
        ┌─────────────────┐       ┌────────────────┐
        │   Mac Client    │◄─────►│   iOS App      │
        │   (Your Mac)    │ WebRTC│   (Your Phone) │
        │                 │ P2P   │                │
        │ - Runs terminal │ Data  │ - Sends cmds   │
        │ - Sends output  │Channel│ - Shows output │
        └─────────────────┘       └────────────────┘
        
        🎉 Relay server can now be terminated!
        Terminal continues working via WebRTC P2P.
```

## Components

### 1. Relay Server (Signaling Server)

**Purpose:** WebRTC signaling and initial pairing only

**Location:** Deploy anywhere (Heroku, Railway, AWS, VPS, local network)

**Responsibilities:**
- Accept WebSocket connections from Mac and iOS clients
- Generate and manage pairing codes  
- Pair devices together
- **WebRTC Signaling:**
  - Relay SDP offers/answers between peers
  - Relay ICE candidates between peers
- **Fallback:** Route terminal messages if WebRTC fails
- Handle disconnections and cleanup

**Key Difference:** After WebRTC connection established, relay server is **no longer needed** for terminal communication!

**Technology:** Node.js + Express + Socket.IO

### 2. Mac Client

**Purpose:** Runs on your Mac, executes terminal commands

**Location:** Your Mac (local machine)

**Responsibilities:**
- Connect to relay server for pairing
- Receive pairing code
- **WebRTC (Mac is Offerer):**
  - Create WebRTC peer connection
  - Generate SDP offer
  - Create data channel for terminal
  - Send ICE candidates
- Spawn terminal process (`node-pty`)
- Send terminal output via **WebRTC data channel** (or WebSocket fallback)
- Receive terminal input via **WebRTC data channel** (or WebSocket fallback)
- Execute commands locally

**Technology:** Node.js + Socket.IO Client + **werift (Pure JS WebRTC)** + node-pty + Chalk

### 3. Mobile App (iOS/Android)

**Purpose:** Mobile interface to control the terminal

**Location:** Your phone (iOS or Android)

**Responsibilities:**
- Connect to relay server for pairing
- Send pairing code to connect with Mac
- **WebRTC (Mobile is Answerer):**
  - Receive SDP offer from Mac
  - Generate SDP answer
  - Receive data channel from Mac
  - Send ICE candidates
- Send terminal commands via **WebRTC data channel** (or WebSocket fallback)
- Display terminal output from **WebRTC data channel** (or WebSocket fallback)
- Handle user input (keyboard)
- Show connection status (P2P vs Relay)

**Technology:** React Native + Expo + Socket.IO Client + **react-native-webrtc**

## Message Flow

### 1. Pairing Flow (WebSocket via Relay Server)

```
Mac Client                 Relay Server              Mobile App
    |                            |                        |
    |─── connect ────────────────>|                        |
    |<── registered + code ───────|                        |
    |                            |                        |
    |                            |<─── connect ───────────|
    |                            |─── registered ─────────>|
    |                            |                        |
    |                            |<─── pair(code) ────────|
    |<── paired ─────────────────|                        |
    |                            |─── paired ─────────────>|
```

### 2. WebRTC Signaling Flow (via Relay Server)

```
Mac Client                 Relay Server              Mobile App
    |                            |                        |
    |─ setupWebRTC() ────────────|                        |
    |─ create offer ─────────────|                        |
    |                            |                        |
    |─── webrtc:offer ──────────>|                        |
    |    {sdp, type}             |                        |
    |                            |─── webrtc:offer ──────>|
    |                            |    {sdp, type}         |
    |                            |                        |
    |                            |<─── webrtc:answer ─────|
    |<── webrtc:answer ──────────|    {sdp, type}         |
    |    {sdp, type}             |                        |
    |                            |                        |
    |─── webrtc:ice-candidate ──>|                        |
    |<── webrtc:ice-candidate ───|                        |
    |                            |─── webrtc:ice-candidate>|
    |                            |<── webrtc:ice-candidate|
    |                            |                        |
    | ✅ WebRTC P2P Connection Established ✅            |
```

### 3. Terminal Communication Flow (Direct P2P via WebRTC!)

```
Mobile App                                         Mac Client
    |                                                   |
    |═══════ WebRTC Data Channel (Direct P2P) ═══════════>|
    |   {type: 'terminal:input', payload: 'ls -la\n'}  |
    |                                                   |
    |                                                   |
    |                  [Relay Server NOT INVOLVED]      |
    |                                                   |
    |                                                   |
    |<══════ WebRTC Data Channel (Direct P2P) ═══════════|
    |   {type: 'terminal:output', payload: 'file1.txt\n...'}
    |                                                   |
```

### 4. Fallback Communication (if WebRTC Fails)

If WebRTC connection fails or hasn't established yet, fallback to WebSocket:

```
Mobile App                 Relay Server              Mac Client
    |                            |                        |
    |─── terminal:input ────────>|                        |
    |                            |─── terminal:input ────>|
    |                            |                        |
    |                            |<── terminal:output ────|
    |<── terminal:output ────────|                        |
```

## WebSocket Events

### Registration Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `register` | Client → Server | `{ type: 'mac' \| 'mobile' }` | Register device with server |
| `registered` | Server → Client | `{ type, pairingCode?, message }` | Confirm registration |

### Pairing Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `pair` | Mobile → Server | `{ pairingCode: string, cols, rows }` | Pair with Mac using code |
| `paired` | Server → Client | `{ message, macId/mobileId }` | Pairing successful |
| `paired_device_disconnected` | Server → Client | `{ message }` | Paired device disconnected |

### WebRTC Signaling Events (NEW!)

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `webrtc:offer` | Mac → Server → Mobile | `{ offer: {sdp, type} }` | WebRTC SDP offer |
| `webrtc:answer` | Mobile → Server → Mac | `{ answer: {sdp, type} }` | WebRTC SDP answer |
| `webrtc:ice-candidate` | Client ↔ Server ↔ Client | `{ candidate: {candidate, sdpMid} }` | ICE candidate for NAT traversal |

### Terminal Events (Fallback Only)

**Note:** These are only used if WebRTC connection fails. When WebRTC is connected, terminal data flows directly via WebRTC data channel!

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `terminal:input` | Mobile → Server → Mac | `string` | Command input (fallback) |
| `terminal:output` | Mac → Server → Mobile | `string` | Terminal output (fallback) |
| `terminal:resize` | Mobile → Server → Mac | `{ cols, rows }` | Resize terminal |
| `terminal:dimensions` | Mobile → Server → Mac | `{ cols, rows }` | Initial terminal dimensions |
| `system:message` | Client ↔ Server ↔ Client | `{ type, payload? }` | System messages (e.g. terminal_ready) |

### WebRTC Data Channel Messages (NEW!)

**These messages flow directly between clients via WebRTC P2P data channel:**

| Message Type | Direction | Payload | Description |
|-------------|-----------|---------|-------------|
| `terminal:input` | Mobile → Mac (P2P) | `string` | Command input via WebRTC |
| `terminal:output` | Mac → Mobile (P2P) | `string` | Terminal output via WebRTC |
| `terminal:resize` | Mobile → Mac (P2P) | `{ cols, rows }` | Resize terminal via WebRTC |

### Error Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `error` | Server → Client | `{ message: string }` | Error occurred |

## Security Model

### Current Implementation

1. **Pairing Codes**
   - 6-digit random codes
   - Expire after 5 minutes
   - Single-use only
   - Generated by relay server

2. **Device Pairing**
   - One mobile device per Mac at a time
   - Codes cleared after use
   - Automatic cleanup on disconnect

3. **WebRTC P2P Encryption** ✅ NEW!
   - **DTLS encryption enabled by default** (WebRTC standard)
   - Terminal data encrypted end-to-end between peers
   - **Relay server CANNOT see terminal traffic** after P2P connects
   - Industry-standard encryption (AES-128/256)

4. **Message Routing**
   - Signaling server only routes pairing and WebRTC setup messages
   - Terminal data flows **directly** between clients (P2P)
   - No persistent storage
   - No command logging

### Security Improvements with WebRTC

✅ **Major Security Upgrade:**

1. **End-to-End Encryption**
   - ✅ WebRTC uses DTLS (Datagram Transport Layer Security)
   - ✅ Terminal data encrypted between Mac and mobile
   - ✅ Relay server **cannot decrypt** terminal traffic
   - ✅ Even if relay server is compromised, terminal data is safe

2. **Reduced Attack Surface**
   - ✅ Relay server doesn't see terminal commands/output
   - ✅ Direct P2P communication after pairing
   - ✅ Server compromise doesn't expose ongoing sessions

3. **Privacy**
   - ✅ Your terminal commands/output are NOT visible to server
   - ✅ Server only sees encrypted signaling messages

### Remaining Security Considerations

⚠️ **Current Limitations:**

**Still Missing (but less critical now):**
- ⚠️ No authentication beyond pairing code
- ⚠️ No rate limiting on pairing attempts
- ⚠️ No audit logging
- ⚠️ Pairing codes could be brute-forced (6 digits = 1M combinations)

**Recommendations for Production:**
- Use TLS/WSS for signaling (relay server)
- Implement stronger authentication (OAuth, JWT)
- Add rate limiting for pairing attempts
- Use longer pairing codes or add additional auth factors


## Deployment Scenarios

### Scenario 1: Local Network Only

```
Mac Client ──→ Relay Server (Mac) ──→ Mobile App
              http://192.168.1.x:3000
```

- Run relay server on your Mac
- Connect mobile to same WiFi
- No internet required

### Scenario 2: Cloud Relay (Recommended)

```
Mac Client ──→ Relay Server (Heroku) ──→ Mobile App
              https://my-relay.herokuapp.com
```

- Deploy relay server to cloud
- Both devices connect to cloud
- Works from anywhere with internet

### Scenario 3: VPS Relay

```
Mac Client ──→ Relay Server (VPS) ──→ Mobile App
              https://relay.yourdomain.com
```

- Self-hosted on VPS
- Full control
- Custom domain + SSL

## Performance Considerations

### Latency

**Typical Latency:**
- Local network: 10-50ms
- Cloud relay (same region): 50-200ms
- Cloud relay (different region): 200-500ms

**Optimization:**
- Deploy relay server close to Mac
- Use WebSocket compression
- Minimize message frequency

### Bandwidth

**Typical Usage:**
- Idle: ~1KB/s (heartbeats)
- Light terminal use: ~5KB/s
- Heavy output: ~50KB/s

**Optimization:**
- Buffer small messages
- Compress terminal output
- Limit output rate

### Scalability

**Current Limits:**
- 1 Mac : 1 Mobile pairing
- Unlimited Mac clients per relay
- Unlimited mobile apps per relay

**Scaling Relay Server:**
- Use Redis for session storage
- Load balance with multiple instances
- Use sticky sessions for WebSocket

## Why This Architecture?

### Alternatives Considered

#### 1. Pure Relay Server (Old Approach)
```
Mac ←─ WebSocket ─→ Server ←─ WebSocket ─→ Mobile
```

**Pros:** Simple, works everywhere
**Cons:**
- ❌ All traffic goes through server
- ❌ Server can see all commands/output
- ❌ Higher latency
- ❌ Server downtime breaks connection
- ❌ Privacy concerns

#### 2. Mac as Direct Server
```
Mac (Server) ←─ Direct ─→ Mobile
```

**Pros:** No external server needed
**Cons:**
- ❌ Can't reach Mac behind NAT/firewall
- ❌ Dynamic IP issues
- ❌ Port forwarding required
- ❌ Complex firewall configuration

#### 3. VPN Tunnel
```
Mac ←─ VPN ─→ Mobile
```

**Pros:** Secure, works anywhere
**Cons:**
- ❌ Complex VPN server setup
- ❌ Requires VPN infrastructure
- ❌ Another service to maintain

### Why WebRTC P2P Wins! ✅

**Best of Both Worlds:**

✅ **Simple Initial Setup**
- Use relay server for pairing (like old approach)
- No port forwarding or firewall config needed
- Works behind NAT (STUN/ICE handles traversal)

✅ **True P2P After Connection**
- Direct communication after WebRTC establishes
- **Relay server can be terminated** without breaking connection
- Lowest possible latency (direct peer-to-peer)

✅ **Security & Privacy**
- End-to-end encryption (DTLS)
- Server cannot see terminal traffic
- Even compromised server can't decrypt data

✅ **Reliability**
- Fallback to relay if WebRTC fails
- Best of both worlds: try P2P, fallback to relay
- Graceful degradation

✅ **Scalability**
- Relay server only handles signaling (lightweight)
- Terminal data doesn't burden server
- Can handle many simultaneous pairings

✅ **Cost Effective**
- Minimal server bandwidth after P2P connects
- Reduced hosting costs
- Can run on free tier services

## Future Architecture Improvements

### 1. ~~End-to-End Encryption~~ ✅ DONE!

WebRTC P2P already provides end-to-end encryption via DTLS!

### 2. TURN Server for Difficult Networks

For networks where STUN can't establish P2P (strict corporate firewalls):

```
Add TURN server to relay traffic when direct P2P impossible
Currently using Google's free STUN server
```

### 3. Multiple Terminal Sessions

```
Mac Client ─┬─ Session 1 ─┐
            ├─ Session 2 ──┤─→ Relay ─→ Mobile App (tabs)
            └─ Session 3 ─┘
```

### 3. File Transfer

```
Mobile ─→ Upload ─→ Relay ─→ Mac ─→ Save
Mac ─→ Read ─→ Relay ─→ Download ─→ Mobile
```

### 4. Screen Sharing

```
Mac ─→ Screenshots ─→ Relay ─→ Mobile (view only)
```

### 5. Multi-User Support

```
Mac ─┬─ User 1 Mobile
     ├─ User 2 Mobile
     └─ User 3 Mobile (with permissions)
```

## Development Workflow

### Running Locally

1. **Start Relay Server**
   ```bash
   cd relay-server && npm run dev
   ```

2. **Start Mac Client**
   ```bash
   cd mac-client && npm run dev
   ```

3. **Start Mobile App**
   ```bash
   cd mobile && npm start
   ```

### Testing

- **Unit Tests:** Test each component independently
- **Integration Tests:** Test WebSocket communication
- **E2E Tests:** Test full pairing + terminal flow

### Debugging

- **Relay Server:** Check console logs for connections
- **Mac Client:** Colorful chalk logs show status
- **Mobile App:** React Native debugger shows state

## Monitoring

### Health Checks

```bash
# Check relay server
curl https://relay.yourdomain.com/health

# Response:
{
  "status": "ok",
  "timestamp": "...",
  "connectedDevices": {
    "mac": 2,
    "mobile": 3
  }
}
```

### Metrics to Track

- Connected devices (mac/mobile)
- Active pairings
- Messages per second
- Average latency
- Error rates
- Pairing success rate

---

**Last Updated:** 2025-11-06

**Architecture Version:** 2.0.0 (WebRTC P2P with Relay Fallback)

## Quick Reference

### Connection Flow

1. **Start relay server** → Get pairing code on Mac
2. **Enter code on mobile** → Devices pair via WebSocket
3. **WebRTC P2P establishes** → Direct encrypted connection
4. **Terminal works via P2P** → Low latency, secure
5. **Relay server can be killed** → Connection stays alive! 🎉

### Status Indicators

- **"P2P Connected ⚡"** → WebRTC direct connection (best)
- **"Paired (Relay)"** → Using WebSocket fallback (acceptable)
- **"Connected"** → Connected to relay, not yet paired
- **"Disconnected"** → No connection

### Testing WebRTC

```bash
# 1. Start everything
cd relay-server && npm run dev
cd mac-client && npm run dev
cd mobile && npm start

# 2. Pair devices (enter code on mobile)
# 3. Wait for "P2P Connected ⚡" status
# 4. Kill relay server (Ctrl+C)
# 5. Terminal should still work! ✅
```

See `WEBRTC_TESTING.md` for detailed testing guide.
