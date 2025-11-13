import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { RELAY_SERVER_URL as DEFAULT_RELAY_SERVER_URL, DEBUG } from '../config';

type ConnectScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Connect'>;
};

export default function ConnectScreen({ navigation }: ConnectScreenProps) {
  // Always start with the default from config (not cached value)
  const [relayServerUrl, setRelayServerUrl] = useState(DEFAULT_RELAY_SERVER_URL);
  const [pairingCode, setPairingCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (DEBUG) {
      console.log('🔥 DEBUG mode enabled: Auto-connecting with pairing code 0000');
      setPairingCode('0000');
      setTimeout(() => {
        navigation.replace('Terminal', {
          relayServerUrl: DEFAULT_RELAY_SERVER_URL,
          pairingCode: '0000',
        });
      }, 300);
    }
  }, []);

  const handleConnect = async () => {
    if (!relayServerUrl || !pairingCode) {
      Alert.alert('Error', 'Please enter both relay server URL and pairing code');
      return;
    }

    setLoading(true);

    try {
      // Navigate to terminal with pairing code
      navigation.replace('Terminal', {
        relayServerUrl,
        pairingCode,
      });
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
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
        />

        <Text style={styles.label}>Pairing Code (from Mac)</Text>
        <TextInput
          style={styles.input}
          value={pairingCode}
          onChangeText={setPairingCode}
          placeholder="Enter 6-digit code"
          placeholderTextColor="#666"
          keyboardType="number-pad"
          maxLength={6}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleConnect}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.buttonText}>Connect</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.hint}>
          How to connect:{'\n\n'}
          1. Start the Mac client on your Mac{'\n'}
          2. Copy the 6-digit pairing code{'\n'}
          3. Enter relay server URL and code above{'\n'}
          4. Tap Connect
        </Text>
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
  hint: {
    marginTop: 30,
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
