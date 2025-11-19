// Configuration for mobile app
// Note: React Native doesn't support .env files without additional libraries
//
// ⚠️ REQUIRED: SET THESE VALUES TO MATCH YOUR NETWORK
// 1. Find your Mac's local IP: System Settings → Network → Wi-Fi → Details
// 2. Update MAC_IP and RELAY_SERVER_URL below
// 3. For iOS Simulator, use 'localhost' (simulator shares host network)
// 4. For Physical Device, use your Mac's IP address on local network

// ⚠️ CONFIGURATION - UPDATE THESE VALUES
const MAC_IP = "192.168.178.72" as string; // Your Mac's local IP address
const RELAY_SERVER_URL = "http://192.168.178.7:3000" as string; // Relay server URL
const DEBUG_MODE = "true";

// Validate configuration
if (!MAC_IP || MAC_IP === "YOUR_MAC_IP_HERE") {
  throw new Error(
    "❌ Configuration Error: MAC_IP is not set!\n" +
      "Update mobile/src/config.ts with your Mac's IP address.\n" +
      "Find it at: System Settings → Network → Wi-Fi → Details"
  );
}

if (!RELAY_SERVER_URL || RELAY_SERVER_URL === "http://YOUR_MAC_IP_HERE:3000") {
  throw new Error(
    "❌ Configuration Error: RELAY_SERVER_URL is not set!\n" +
      "Update mobile/src/config.ts with your relay server URL.\n" +
      "Example: http://192.168.1.100:3000"
  );
}

// Validate URL format
try {
  new URL(RELAY_SERVER_URL);
} catch (error) {
  throw new Error(
    `❌ Configuration Error: Invalid RELAY_SERVER_URL format!\n` +
      `Current value: ${RELAY_SERVER_URL}\n` +
      `Expected format: http://YOUR_IP:3000`
  );
}

export { MAC_IP, RELAY_SERVER_URL };
export const DEBUG = DEBUG_MODE === "true";
