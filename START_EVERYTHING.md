# 🚀 Start MobiFai - Quick Guide

## ✅ Watchman Installed!

Watchman version `2025.11.03.00` is now installed. This fixes the "too many open files" error.

---

## How to Start Everything

### Option 1: All-in-One (Recommended)

Open **3 separate terminal windows** and run these commands:

#### Terminal 1 - Relay Server
```bash
cd /Users/pietrogiucastro/Projects/personal/mobifai/relay-server
npm run dev
```
**Wait for:** `🚀 Relay server running on http://localhost:3000`

#### Terminal 2 - Mac Client
```bash
cd /Users/pietrogiucastro/Projects/personal/mobifai/mac-client
npm run dev
```
**Wait for:** `🔑 Pairing Code: XXXXXX` (note this code!)

#### Terminal 3 - Mobile App
```bash
cd /Users/pietrogiucastro/Projects/personal/mobifai/mobile
npx expo start --clear
```
**Wait for:** Metro bundler to show QR code

Then:
- Press **`i`** to open iOS Simulator
- OR scan QR code with **Expo Go** app on your iPhone

---

### Option 2: Use the Helper Script

```bash
cd /Users/pietrogiucastro/Projects/personal/mobifai
./fix-and-run-mobile.sh
```

But you'll still need to start relay server and Mac client separately (see Terminal 1 and 2 above).

---

## After Apps Start

### In the Mobile App:

1. **Enter the pairing code** shown in Terminal 2 (Mac Client)
2. Wait for connection status to show: **"P2P Connected ⚡"**
3. **Type commands** in the terminal input
4. **See output** appear in real-time!

### Test WebRTC P2P (The Critical Test!)

1. After you see "P2P Connected ⚡" in the mobile app
2. Go to **Terminal 1** (relay server)
3. Press **`Ctrl+C`** to kill the relay server
4. Go back to mobile app
5. **Type a command** (e.g., `ls -la`)
6. **If output appears** → WebRTC P2P is working! 🎉
   - The connection is direct peer-to-peer
   - Encrypted end-to-end
   - No server needed anymore!

---

## Quick Start Commands (Copy-Paste)

```bash
# In Terminal 1
cd ~/Projects/personal/mobifai/relay-server && npm run dev

# In Terminal 2 (new tab)
cd ~/Projects/personal/mobifai/mac-client && npm run dev

# In Terminal 3 (new tab)
cd ~/Projects/personal/mobifai/mobile && npx expo start --clear
```

---

## Troubleshooting

### If Expo won't start:
```bash
cd mobile
rm -rf .expo node_modules/.cache
npx expo start --clear
```

### If simulator won't open:
```bash
# Open it manually first
open -a Simulator
# Then press 'i' in Expo terminal
```

### If app shows white screen:
```bash
# In the simulator, press:
# Cmd + R to reload
# OR shake device (Cmd + Ctrl + Z) and tap "Reload"
```

### If connection fails:
1. Make sure all 3 services are running
2. Check pairing code is correct
3. Wait for "P2P Connected ⚡" status
4. Try entering code again

---

## What to Expect

### Relay Server Output:
```
🚀 Relay server running on http://localhost:3000
📱 Mac client connected: JjPXvxigteOMhd14AAAB
📱 Mobile client connected: Y5yjwe8qvqWeFDlzAAAD
🔗 Paired: Mac ↔ Mobile
📡 Relaying WebRTC offer
📡 Relaying WebRTC answer
🧊 Relaying ICE candidates
```

### Mac Client Output:
```
🖥️  MobiFai Mac Client
================================
✅ Connected to relay server
🔑 Pairing Code: 4567
✅ Mobile device connected
🔗 Setting up WebRTC P2P connection...
🎉 WebRTC P2P connection established!
✅ WebRTC data channel opened
```

### Mobile App:
```
Status: P2P Connected ⚡
Terminal ready
$ _
```

---

## Success! 🎉

Once everything is running:
- ✅ You can control your Mac from your phone
- ✅ Commands execute in real-time
- ✅ Direct peer-to-peer (after WebRTC connects)
- ✅ End-to-end encrypted
- ✅ Works even after killing relay server

**Enjoy your mobile terminal!** 🚀📱💻

---

**Need Help?** Check:
- `RUNNING_MOBILE_APP.md` - Detailed troubleshooting
- `MOBILE_APP_FIX_SUMMARY.md` - What was fixed
- `ARCHITECTURE.md` - How it all works
