// Load environment variables from .env file
// In production, these would be set at build time
const getEnvVar = (key: string, defaultValue: string): string => {
  // For React Native, we can't read .env files at runtime
  // So we'll use a config file that should match .env
  // In a real app, you'd use expo-constants or a build-time replacement
  
  // Default values matching .env file
  const envVars: Record<string, string> = {
    MAC_IP: '192.168.1.174',
    RELAY_SERVER_URL: 'http://192.168.1.174:3000',
  };
  
  return envVars[key] || defaultValue;
};

export const MAC_IP = getEnvVar('MAC_IP', '192.168.1.174');
export const RELAY_SERVER_URL = getEnvVar('RELAY_SERVER_URL', 'http://192.168.1.174:3000');
