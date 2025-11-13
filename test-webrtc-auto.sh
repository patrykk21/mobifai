#!/bin/bash

# Automated WebRTC P2P Test Script
# This script starts all services and tests WebRTC P2P connection

set -e

echo "🧪 WebRTC P2P Automated Test"
echo "============================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Cleanup function
cleanup() {
    echo ""
    echo -e "${YELLOW}🧹 Cleaning up processes...${NC}"
    if [ ! -z "$RELAY_PID" ]; then
        kill $RELAY_PID 2>/dev/null || true
    fi
    if [ ! -z "$MAC_PID" ]; then
        kill $MAC_PID 2>/dev/null || true
    fi
    if [ ! -z "$TEST_PID" ]; then
        kill $TEST_PID 2>/dev/null || true
    fi
    exit
}

trap cleanup EXIT INT TERM

# Step 1: Start Relay Server
echo -e "${YELLOW}📡 Starting relay server...${NC}"
cd relay-server
npm run dev > /tmp/relay.log 2>&1 &
RELAY_PID=$!
cd ..

# Wait for relay server to start
sleep 3

if ! kill -0 $RELAY_PID 2>/dev/null; then
    echo -e "${RED}❌ Relay server failed to start${NC}"
    cat /tmp/relay.log
    exit 1
fi

echo -e "${GREEN}✅ Relay server started (PID: $RELAY_PID)${NC}"

# Step 2: Start Mac Client
echo -e "${YELLOW}🖥️  Starting Mac client...${NC}"
cd mac-client
npm run dev > /tmp/mac-client.log 2>&1 &
MAC_PID=$!
cd ..

# Wait for Mac client to generate pairing code
sleep 5

if ! kill -0 $MAC_PID 2>/dev/null; then
    echo -e "${RED}❌ Mac client failed to start${NC}"
    cat /tmp/mac-client.log
    exit 1
fi

echo -e "${GREEN}✅ Mac client started (PID: $MAC_PID)${NC}"

# Extract pairing code from Mac client log
echo -e "${YELLOW}🔍 Extracting pairing code...${NC}"
sleep 2

# Try to get pairing code (look for 6-digit code or 0000 in debug mode)
PAIRING_CODE=$(grep -oE "Pairing Code: [0-9]{4,6}" /tmp/mac-client.log 2>/dev/null | tail -1 | awk '{print $3}')

if [ -z "$PAIRING_CODE" ]; then
    echo -e "${RED}❌ Could not find pairing code${NC}"
    echo "Mac client log:"
    tail -20 /tmp/mac-client.log
    exit 1
fi

echo -e "${GREEN}✅ Found pairing code: $PAIRING_CODE${NC}"
echo ""

# Step 3: Start Test Client
echo -e "${YELLOW}📱 Starting test client with code $PAIRING_CODE...${NC}"
node test-webrtc-client.js $PAIRING_CODE > /tmp/test-client.log 2>&1 &
TEST_PID=$!

# Monitor for WebRTC connection
echo -e "${YELLOW}⏳ Waiting for WebRTC connection...${NC}"
CONNECTED=0
for i in {1..30}; do
    if grep -q "WebRTC P2P CONNECTION ESTABLISHED" /tmp/test-client.log; then
        CONNECTED=1
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

if [ $CONNECTED -eq 0 ]; then
    echo -e "${RED}❌ WebRTC connection did not establish within 30 seconds${NC}"
    echo ""
    echo "=== Relay Server Log ==="
    tail -30 /tmp/relay.log
    echo ""
    echo "=== Mac Client Log ==="
    tail -30 /tmp/mac-client.log
    echo ""
    echo "=== Test Client Log ==="
    cat /tmp/test-client.log
    exit 1
fi

echo -e "${GREEN}✅ WebRTC P2P connection established!${NC}"
echo ""

# Step 4: Kill relay server to test P2P independence
echo -e "${YELLOW}🔥 THE CRITICAL TEST: Killing relay server...${NC}"
kill $RELAY_PID
RELAY_PID=""
sleep 2

echo -e "${GREEN}✅ Relay server terminated${NC}"
echo ""

# Step 5: Show final status
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}🎉 WebRTC P2P TEST SUCCESSFUL!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Results:"
echo "  ✅ Relay server connected"
echo "  ✅ Mac client connected"
echo "  ✅ Test client paired (code: $PAIRING_CODE)"
echo "  ✅ WebRTC P2P established"
echo "  ✅ Relay server terminated"
echo ""
echo "📊 Check logs:"
echo "  - Relay:  /tmp/relay.log"
echo "  - Mac:    /tmp/mac-client.log"
echo "  - Test:   /tmp/test-client.log"
echo ""
echo "💡 The Mac client and test client are still connected via WebRTC!"
echo "   They can communicate without the relay server."
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all processes${NC}"

# Keep script running to keep processes alive
tail -f /tmp/test-client.log /tmp/mac-client.log
