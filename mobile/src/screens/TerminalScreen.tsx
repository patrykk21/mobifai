import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  TextInput,
  ScrollView,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { io, Socket } from 'socket.io-client';

type TerminalScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Terminal'>;
  route: RouteProp<RootStackParamList, 'Terminal'>;
};

export default function TerminalScreen({ navigation, route }: TerminalScreenProps) {
  const { relayServerUrl, pairingCode } = route.params;
  const [output, setOutput] = useState('');
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [paired, setPaired] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const socketRef = useRef<Socket | null>(null);
  const previousInputRef = useRef<string>('');
  const outputBufferRef = useRef<string[]>([]); // Line-based buffer for terminal output

  // Function to calculate and send terminal dimensions
  const calculateAndSendDimensions = () => {
    const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
    const isLandscape = screenWidth > screenHeight;
    
    const terminalWidth = screenWidth - 40;
    const terminalHeight = screenHeight - 200;
    
    const charWidth = 9;
    const charHeight = 18;
    
    const cols = Math.floor(terminalWidth / charWidth);
    const rows = Math.floor(terminalHeight / charHeight);
    
    console.log(`Terminal dimensions: ${cols}x${rows} (screen: ${screenWidth}x${screenHeight}, ${isLandscape ? 'landscape' : 'portrait'})`);
    
    // Send dimensions if socket is connected and paired
    if (socketRef.current && paired) {
      socketRef.current.emit('terminal:dimensions', { cols, rows });
    }
    
    return { cols, rows };
  };

  useEffect(() => {
    connectToRelay();
    
    // Listen for orientation/dimension changes
    const subscription = Dimensions.addEventListener('change', () => {
      console.log('Orientation/dimensions changed');
      // Wait a bit for dimensions to update
      setTimeout(() => {
        calculateAndSendDimensions();
      }, 100);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      subscription?.remove();
    };
  }, []);
  
  // Separate effect to handle paired state changes
  useEffect(() => {
    if (paired) {
      // Calculate and send dimensions when paired
      calculateAndSendDimensions();
    }
  }, [paired]);

  const connectToRelay = () => {
    outputBufferRef.current = ['📡 Connecting to relay server...'];
    setOutput('📡 Connecting to relay server...');

    const socket = io(relayServerUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      outputBufferRef.current.push('✅ Connected to relay server');
      setOutput(outputBufferRef.current.join('\n'));

      // Register as mobile device
      socket.emit('register', { type: 'mobile' });
    });

    socket.on('registered', ({ message }) => {
      outputBufferRef.current.push(`✅ ${message}`);
      outputBufferRef.current.push(`🔗 Pairing with code: ${pairingCode}...`);
      setOutput(outputBufferRef.current.join('\n'));

      // Calculate and send terminal dimensions
      const { cols, rows } = calculateAndSendDimensions();

      // Send pairing code with terminal dimensions
      socket.emit('pair', { pairingCode, cols, rows });
    });

    socket.on('paired', ({ message }) => {
      setPaired(true);
      outputBufferRef.current.push(`✅ ${message}`);
      outputBufferRef.current.push('');
      outputBufferRef.current.push('='.repeat(40));
      outputBufferRef.current.push('Terminal ready. Start typing commands!');
      outputBufferRef.current.push('='.repeat(40));
      outputBufferRef.current.push('');
      setOutput(outputBufferRef.current.join('\n'));
    });

    socket.on('terminal:output', (data: string) => {
      // Log raw data for debugging (especially \r sequences)
      const hasCarriageReturn = data.includes('\r');
      const hasNewline = data.includes('\n');
      const hasBoxDrawing = /[┌┐└┘│─┬┴├┤]/.test(data);
      
      if (hasCarriageReturn || hasBoxDrawing) {
        // Log control characters and their positions
        const crCount = (data.match(/\r/g) || []).length;
        const nlCount = (data.match(/\n/g) || []).length;
        const crPositions = [];
        for (let i = 0; i < data.length; i++) {
          if (data[i] === '\r') crPositions.push(i);
        }
        
        console.log(`[TERMINAL] Raw data chunk:`, {
          length: data.length,
          crCount,
          nlCount,
          crPositions: crPositions.slice(0, 10), // First 10 positions
          hasBoxDrawing,
          preview: data.substring(0, 100).replace(/[\r\n]/g, m => m === '\r' ? '\\r' : '\\n')
        });
        
        // Show context around \r sequences
        if (crCount > 0) {
          const sampleIndices = crPositions.slice(0, 3);
          sampleIndices.forEach(idx => {
            const start = Math.max(0, idx - 20);
            const end = Math.min(data.length, idx + 20);
            const context = data.substring(start, end)
              .replace(/\r/g, '\\r')
              .replace(/\n/g, '\\n')
              .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '[ANSI]');
            console.log(`[TERMINAL] Context around \\r at ${idx}: "${context}"`);
          });
        }
      }
      
      // Handle clear screen - clear everything
      if (data.includes('\x1b[2J')) {
        outputBufferRef.current = [];
        setInput('');
        previousInputRef.current = '';
        // Keep content after clear if any
        const parts = data.split('\x1b[2J');
        if (parts.length > 1 && parts[1].trim()) {
          data = parts[1].split('\x1b[H').pop() || parts[1];
          data = data.trimStart();
        } else {
          data = '';
        }
      }
      
      if (!data) return;
      
      // Get current buffer
      let buffer = [...outputBufferRef.current];
      
      // Count how many "move up" sequences we have - this tells us how many lines to replace
      const moveUpMatches = data.match(/\x1b\[1A/g) || [];
      const moveUpCount = moveUpMatches.length;
      
      // Process ANSI sequences: extract cursor movements before stripping
      // \x1b[2K = clear line, \x1b[1A = move up, \x1b[G = move to column 0
      const hasClearLine = data.includes('\x1b[2K');
      const hasMoveUp = moveUpCount > 0;
      const hasMoveToColumn0 = data.includes('\x1b[G');
      
      // Remove ANSI escape sequences (colors, formatting, cursor positioning)
      // But we've already extracted the cursor movement info above
      let processedData = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
      
      // If we have move up sequences, we're replacing lines from the end
      // Calculate how many lines back we should start replacing
      let startReplaceIndex = buffer.length;
      if (hasMoveUp && buffer.length > 0) {
        // Move up means we're going back to overwrite previous lines
        startReplaceIndex = Math.max(0, buffer.length - moveUpCount);
      }
      
      // Split by newlines
      const lines = processedData.split('\n');
      
      // If we detected move up + clear line, we're replacing lines
      if (hasMoveUp && hasClearLine && startReplaceIndex < buffer.length) {
        // Remove lines from startReplaceIndex onwards
        buffer = buffer.slice(0, startReplaceIndex);
      }
      
      // Now append the new lines
      if (buffer.length > 0 && lines.length > 0 && !hasMoveUp) {
        // Normal append: append first line to last buffer line
        buffer[buffer.length - 1] += lines[0];
        // Add remaining lines
        for (let i = 1; i < lines.length; i++) {
          buffer.push(lines[i]);
        }
      } else {
        // Either no buffer, or we're replacing (hasMoveUp), so add all lines fresh
        for (const line of lines) {
          if (line || buffer.length === 0) {
            buffer.push(line);
          }
        }
      }
      
      // Ensure buffer has at least one line
      if (buffer.length === 0) {
        buffer.push('');
      }
      
      // Update output state
      outputBufferRef.current = buffer;
      setOutput(buffer.join('\n'));
      
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });

    socket.on('paired_device_disconnected', ({ message }) => {
      setPaired(false);
      outputBufferRef.current.push('');
      outputBufferRef.current.push(`❌ ${message}`);
      setOutput(outputBufferRef.current.join('\n'));
      Alert.alert('Disconnected', message, [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    });

    socket.on('disconnect', (reason) => {
      setConnected(false);
      setPaired(false);
      outputBufferRef.current.push('');
      outputBufferRef.current.push(`❌ Disconnected: ${reason}`);
      setOutput(outputBufferRef.current.join('\n'));
    });

    socket.on('connect_error', (error) => {
      outputBufferRef.current.push(`❌ Connection error: ${error.message}`);
      setOutput(outputBufferRef.current.join('\n'));
    });

    socket.on('error', ({ message }) => {
      outputBufferRef.current.push(`❌ Error: ${message}`);
      setOutput(outputBufferRef.current.join('\n'));
      Alert.alert('Error', message);
    });
  };

  // Send input changes in real-time for interactive applications (vim, etc.)
  const handleInputChange = (text: string) => {
    if (!socketRef.current || !paired) {
      setInput(text);
      return;
    }

    const previous = previousInputRef.current;
    
    // Check if Enter/newline was added to the text (shouldn't happen with multiline=false, but handle it)
    if (text.includes('\n') || text.includes('\r')) {
      // Enter was typed - send it and remove from text
      const enterIndex = text.indexOf('\n') >= 0 ? text.indexOf('\n') : text.indexOf('\r');
      const beforeEnter = text.substring(0, enterIndex);
      const afterEnter = text.substring(enterIndex + 1);
      
      // Send characters before Enter
      if (beforeEnter.length > previous.length) {
        const newChars = beforeEnter.slice(previous.length);
        socketRef.current.emit('terminal:input', newChars);
      }
      
      // Send Enter (as \r only for interactive apps)
      console.log('Enter detected in text input, sending \\r');
      console.log('[DEBUG] Emitting terminal:input with:', JSON.stringify('\r'));
      // Send just \r (carriage return) - some interactive apps expect this for submission
      socketRef.current.emit('terminal:input', '\r');
      
      // Update state - keep text without the newline
      previousInputRef.current = afterEnter;
      setInput(afterEnter);
      return;
    }
    
    // Detect if text was added or removed
    if (text.length > previous.length) {
      // New character(s) added - send only the new characters
      const newChars = text.slice(previous.length);
      socketRef.current.emit('terminal:input', newChars);
    } else if (text.length < previous.length) {
      // Character(s) removed (backspace) - send backspace
      const backspaces = previous.length - text.length;
      for (let i = 0; i < backspaces; i++) {
        socketRef.current.emit('terminal:input', '\b');
      }
    }
    // If length is same but content changed, it might be autocorrect - send the change
    else if (text !== previous && text.length === previous.length) {
      // Autocorrect or similar - send backspace and new text
      socketRef.current.emit('terminal:input', '\b' + text.slice(previous.length - 1));
    }
    
    previousInputRef.current = text;
    setInput(text);
  };

  // Send Enter/newline to terminal
  const sendEnter = () => {
    if (socketRef.current && paired) {
      const currentInput = input || '';
      const alreadySent = previousInputRef.current || '';
      
      // Send any characters that haven't been sent yet (should be rare since we send in real-time)
      if (currentInput.length > alreadySent.length) {
        const unsent = currentInput.slice(alreadySent.length);
        console.log('Sending unsent chars before Enter:', unsent);
        socketRef.current.emit('terminal:input', unsent);
        previousInputRef.current = currentInput;
        
        // Small delay to ensure characters are processed before Enter
        setTimeout(() => {
          console.log('Sending Enter to terminal (\\r only)');
          console.log('[DEBUG] Emitting terminal:input with:', JSON.stringify('\r'));
          if (socketRef.current && paired) {
            // Send just \r (carriage return) - some interactive apps expect this for submission
            socketRef.current.emit('terminal:input', '\r');
          }
          setInput('');
          previousInputRef.current = '';
        }, 50);
      } else {
        // No unsent chars, send Enter immediately
        console.log('Sending Enter to terminal (\\r only)');
        console.log('[DEBUG] Emitting terminal:input with:', JSON.stringify('\r'));
        // Send just \r (carriage return) - some interactive apps expect this for submission
        socketRef.current.emit('terminal:input', '\r');
        setInput('');
        previousInputRef.current = '';
      }
    }
  };

  // Handle Enter key - send newline
  const handleKeyPress = (e: any) => {
    const key = e.nativeEvent?.key || e.nativeEvent?.code || e.nativeEvent?.keyCode;
    console.log('Key pressed:', key, e.nativeEvent);
    
    // Check for Enter key (various representations)
    if (
      key === 'Enter' || 
      key === '\n' || 
      key === '\r' ||
      key === 'NumpadEnter' ||
      key === 13 || // Enter key code
      e.nativeEvent?.keyCode === 13
    ) {
      if (socketRef.current && paired) {
        console.log('Enter key detected in handleKeyPress');
        e.preventDefault?.();
        sendEnter();
      }
    }
  };

  // Also handle Enter via onSubmitEditing for iOS compatibility
  const handleSubmit = () => {
    console.log('onSubmitEditing fired, input:', input);
    sendEnter();
  };

  // Copy all terminal output to clipboard
  const copyAllOutput = () => {
    if (output) {
      Clipboard.setString(output);
      Alert.alert('Copied', 'Terminal output copied to clipboard');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={100}
    >
      <View style={styles.statusBar}>
        <View style={[styles.indicator, connected && styles.indicatorConnected]} />
        <Text style={styles.statusText}>
          {paired ? 'Paired & Connected' : connected ? 'Connected' : 'Disconnected'}
        </Text>
        {output ? (
          <TouchableOpacity style={styles.copyButton} onPress={copyAllOutput}>
            <Text style={styles.copyButtonText}>Copy All</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.outputContainer}
        contentContainerStyle={styles.outputContent}
      >
        <Text 
          style={styles.output}
          selectable={true}
          selectionColor="#0f0"
        >
          {output || 'Connecting...'}
        </Text>
      </ScrollView>

      <View style={styles.inputContainer}>
        <Text style={styles.prompt}>$</Text>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={handleInputChange}
          onKeyPress={handleKeyPress}
          onSubmitEditing={handleSubmit}
          placeholder="Enter command..."
          placeholderTextColor="#666"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="send"
          editable={paired}
          multiline={false}
          blurOnSubmit={false}
          enablesReturnKeyAutomatically={true}
          textContentType="none"
        />
        {paired && input.length > 0 && (
          <TouchableOpacity style={styles.sendButton} onPress={handleSubmit}>
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#0f0',
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f00',
    marginRight: 8,
  },
  indicatorConnected: {
    backgroundColor: '#0f0',
  },
  statusText: {
    color: '#0f0',
    fontSize: 12,
    fontFamily: 'monospace',
    flex: 1,
  },
  copyButton: {
    backgroundColor: '#0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    marginLeft: 10,
  },
  copyButtonText: {
    color: '#000',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  outputContainer: {
    flex: 1,
  },
  outputContent: {
    padding: 10,
  },
  output: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#0f0',
    fontSize: 14,
    lineHeight: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#0f0',
    padding: 10,
  },
  sendButton: {
    backgroundColor: '#0f0',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    marginLeft: 8,
  },
  sendButtonText: {
    color: '#000',
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  prompt: {
    color: '#0f0',
    fontSize: 16,
    fontFamily: 'monospace',
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: '#0f0',
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    padding: 0,
  },
});
