# 🚀 RUN THE WebRTC P2P TEST

## ✅ Everything is Ready!

All files are in place:
- ✅ `test-webrtc-auto.sh` - Automated test script
- ✅ `test-webrtc-client.js` - Test client
- ✅ All dependencies installed

## 🎯 ONE COMMAND TO TEST EVERYTHING

Open your terminal and copy-paste this:

```bash
cd /Users/pietrogiucastro/Projects/personal/mobifai && ./test-webrtc-auto.sh
```

That's it! The script will:
1. Start relay server
2. Start Mac client
3. Extract pairing code automatically
4. Start test client
5. Wait for WebRTC P2P to connect
6. Kill the relay server
7. Show success if terminal still works!

## 📺 What You'll See

```
🧪 WebRTC P2P Automated Test
=============================

📡 Starting relay server...
✅ Relay server started
🖥️  Starting Mac client...
✅ Mac client started
🔍 Extracting pairing code...
✅ Found pairing code: 123456

📱 Starting test client...
⏳ Waiting for WebRTC connection...
......
✅ WebRTC P2P connection established!

🔥 THE CRITICAL TEST: Killing relay server...
✅ Relay server terminated

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 WebRTC P2P TEST SUCCESSFUL!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Relay server connected
✅ Mac client connected
✅ Test client paired
✅ WebRTC P2P established
✅ Relay server terminated

The Mac and test client are still connected via P2P!
```

## 🛑 To Stop

Press `Ctrl+C` in the terminal

## 🐛 If Something Goes Wrong

Check the logs:
```bash
cat /tmp/relay.log
cat /tmp/mac-client.log
cat /tmp/test-client.log
```

## 📋 Or Run Manually (3 Terminals)

If you prefer to see each component:

**Terminal 1:**
```bash
cd /Users/pietrogiucastro/Projects/personal/mobifai/relay-server
npm run dev
```

**Terminal 2:**
```bash
cd /Users/pietrogiucastro/Projects/personal/mobifai/mac-client
npm run dev
# COPY THE 6-DIGIT CODE
```

**Terminal 3:**
```bash
cd /Users/pietrogiucastro/Projects/personal/mobifai
node test-webrtc-client.js <PASTE_CODE_HERE>
```

Then kill Terminal 1 after seeing "WebRTC P2P CONNECTION ESTABLISHED"

---

## 🎊 READY TO TEST!

Run this command NOW:

```bash
cd /Users/pietrogiucastro/Projects/personal/mobifai && ./test-webrtc-auto.sh
```

This proves your WebRTC P2P implementation works! 🚀
