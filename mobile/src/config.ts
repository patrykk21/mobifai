// Load environment variables from .env file
// In production, these would be set at build time
const getEnvVar = (key: string, defaultValue: string): string => {
  // For React Native, we can't read .env files at runtime
  // So we'll use a config file that should match .env
  // In a real app, you'd use expo-constants or a build-time replacement
  
  // Default values matching .env file
  // For physical devices, use your Mac's local IP address
  // For iOS Simulator, use 'localhost' (it shares host network)
  const envVars: Record<string, string> = {
    MAC_IP: '192.168.1.102',
    RELAY_SERVER_URL: 'http://192.168.1.102:3000',
    DEBUG_MODE: 'true',
  };
  
  return envVars[key] || defaultValue;
};

export const MAC_IP = getEnvVar('MAC_IP', '192.168.1.102');
export const RELAY_SERVER_URL = getEnvVar('RELAY_SERVER_URL', 'http://192.168.1.102:3000');
export const DEBUG_MODE = getEnvVar('DEBUG_MODE', 'true') === 'true';
