import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
  Linking,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { RELAY_SERVER_URL as DEFAULT_RELAY_SERVER_URL } from '../config';
import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Simple UUID-like generator for device ID
const generateDeviceId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

type ConnectScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Connect'>;
};

const TOKEN_KEY = 'mobifai_auth_token';
const DEVICE_ID_KEY = 'mobifai_device_id';

export default function ConnectScreen({ navigation }: ConnectScreenProps) {
  const [relayServerUrl, setRelayServerUrl] = useState(DEFAULT_RELAY_SERVER_URL);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const socketRef = React.useRef<Socket | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup socket on unmount
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const getDeviceId = async () => {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = generateDeviceId();
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  };

  const handleConnect = async () => {
    setLoading(true);
    setStatusMessage('Connecting to relay server...');

    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      const deviceId = await getDeviceId();

      const socket = io(relayServerUrl, {
        reconnection: false, // Don't auto-reconnect on this screen
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        setStatusMessage('Connected. Checking authentication...');
        socket.emit('register', { type: 'mobile', token, deviceId });
      });

      socket.on('login_required', ({ loginUrl }) => {
        setStatusMessage('Authentication required');
        Alert.alert(
          'Login Required',
          'You need to sign in with Google to continue.',
          [
            {
              text: 'Sign In',
              onPress: () => {
                const fullUrl = `${relayServerUrl}${loginUrl}`;
                Linking.openURL(fullUrl);
                setStatusMessage('Waiting for authentication...\nComplete login in browser and return here.');
              }
            },
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => {
                socket.disconnect();
                setLoading(false);
                setStatusMessage('');
              }
            }
          ]
        );
      });

      socket.on('authenticated', async ({ token, user }) => {
        console.log(`✅ Authenticated as ${user.email}`);
        await AsyncStorage.setItem(TOKEN_KEY, token);
        setStatusMessage(`Authenticated as ${user.email}`);
        
        // Re-register with token
        socket.emit('register', { type: 'mobile', token, deviceId });
      });

      socket.on('waiting_for_peer', ({ message }) => {
        setStatusMessage(message);
      });

      socket.on('paired', ({ message }) => {
        setStatusMessage('Connected! Opening terminal...');
        // Disconnect this socket (TerminalScreen will create its own)
        socket.disconnect();
        
        // Navigate to terminal
        setTimeout(() => {
          navigation.navigate('Terminal', { relayServerUrl });
        }, 500);
      });

      socket.on('auth_error', async ({ message }) => {
        await AsyncStorage.removeItem(TOKEN_KEY);
        Alert.alert('Authentication Error', message);
        socket.emit('register', { type: 'mobile', deviceId });
      });

      socket.on('connect_error', (error) => {
        setStatusMessage('');
        setLoading(false);
        Alert.alert('Connection Error', `Failed to connect:\n${error.message}`);
      });

      socket.on('error', ({ message }) => {
        Alert.alert('Error', message);
      });

    } catch (error: any) {
      setLoading(false);
      setStatusMessage('');
      Alert.alert('Error', error.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>MobiFai</Text>
      <Text style={styles.subtitle}>Mobile Terminal Access</Text>

      <View style={styles.form}>
        <Text style={styles.label}>Relay Server URL</Text>
        <TextInput
          style={styles.input}
          value={relayServerUrl}
          onChangeText={setRelayServerUrl}
          placeholder="http://your-relay-server.com:3000"
          placeholderTextColor="#666"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleConnect}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.buttonText}>Connect with Google</Text>
          )}
        </TouchableOpacity>

        {statusMessage ? (
          <Text style={styles.status}>{statusMessage}</Text>
        ) : (
          <Text style={styles.hint}>
            Sign in with the same Google account on both Mac and mobile to connect securely.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#0f0',
    textAlign: 'center',
    marginBottom: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  subtitle: {
    fontSize: 16,
    color: '#0f0',
    textAlign: 'center',
    marginBottom: 40,
    opacity: 0.7,
  },
  form: {
    width: '100%',
  },
  label: {
    fontSize: 14,
    color: '#0f0',
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  input: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#0f0',
    borderRadius: 8,
    padding: 15,
    color: '#0f0',
    fontSize: 16,
    marginBottom: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  button: {
    backgroundColor: '#0f0',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  status: {
    marginTop: 20,
    fontSize: 13,
    color: '#0f0',
    textAlign: 'center',
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  hint: {
    marginTop: 30,
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
