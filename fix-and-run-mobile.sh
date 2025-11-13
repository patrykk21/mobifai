#!/bin/bash

echo "🔧 MobiFai Mobile App - Fix and Run"
echo "===================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Check if watchman is installed
echo -e "${YELLOW}Step 1: Checking for watchman...${NC}"
if ! command -v watchman &> /dev/null; then
    echo "❌ Watchman not found. Installing..."
    echo "   (This fixes the 'too many open files' error)"
    brew install watchman
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Watchman installed${NC}"
    else
        echo "⚠️  Watchman install failed. Trying without it..."
    fi
else
    echo -e "${GREEN}✅ Watchman already installed${NC}"
fi
echo ""

# Step 2: Clean up any running processes
echo -e "${YELLOW}Step 2: Cleaning up old processes...${NC}"
pkill -f "expo start" 2>/dev/null
pkill -f "metro" 2>/dev/null
sleep 2
echo -e "${GREEN}✅ Cleanup done${NC}"
echo ""

# Step 3: Clear caches
echo -e "${YELLOW}Step 3: Clearing Metro cache...${NC}"
cd mobile
rm -rf .expo
rm -rf node_modules/.cache
echo -e "${GREEN}✅ Cache cleared${NC}"
echo ""

# Step 4: Start Expo
echo -e "${YELLOW}Step 4: Starting Expo bundler...${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}Next Steps:${NC}"
echo "  1. Wait for Metro bundler to start"
echo "  2. Press 'i' to open iOS Simulator"
echo "  3. OR scan QR code with Expo Go app on your iPhone"
echo ""
echo "  After app loads:"
echo "  4. Enter pairing code from Mac Client"
echo "  5. Test the terminal!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start Expo
npx expo start --clear

