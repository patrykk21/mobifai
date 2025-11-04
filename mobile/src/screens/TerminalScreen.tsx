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
import { parseAnsiToText } from '../utils/ansiParser';

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
  const lastSentInputRef = useRef<string>(''); // Track what we last sent to detect terminal echo
  const backspaceSentRef = useRef<boolean>(false); // Track if we've already sent a backspace via onKeyPress

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
      
      // Remove ANSI control sequences (cursor positioning, screen clearing) but KEEP color codes
      // Color codes end in 'm' (SGR - Select Graphic Rendition)
      // Control sequences: cursor movement (H, A, B, C, D, G), screen clearing (J, K), etc.
      // We want to keep colors (ending in 'm') but remove control sequences
      let processedData = data
        // Remove cursor positioning and screen control sequences (but keep colors ending in 'm')
        .replace(/\x1b\[[0-9;]*[HJABCDG]/g, '') // Cursor positioning
        .replace(/\x1b\[[0-9;]*[JK]/g, '') // Screen clearing (J, K)
        .replace(/\x1b\[[?0-9]*[hl]/g, '') // Cursor visibility
        // Keep color codes (ending in 'm') - these will be rendered with colors
        // Color codes are already in the data, we just need to not strip them
      
      // If we have move up sequences, we're replacing lines from the end
      // Calculate how many lines back we should start replacing
      let startReplaceIndex = buffer.length;
      if (hasMoveUp && buffer.length > 0) {
        // Move up means we're going back to overwrite previous lines
        startReplaceIndex = Math.max(0, buffer.length - moveUpCount);
      }
      
      // Process backspaces - handle \b to remove characters
      // Terminal sends different \b patterns:
      // 1. \b \b (backspace, space, backspace) = real deletion from user
      // 2. \b<chars> (backspace followed by text) = terminal echo correction (e.g., \bpw when typing w after p)
      let hasBackspace = processedData.includes('\b');
      
      if (hasBackspace && buffer.length > 0) {
        // Check if this is a real deletion (\b \b pattern) or terminal echo correction (\b followed by text)
        // \x08 is the backspace character (0x08)
        const backspaceChar = '\x08';
        const hasBackspaceSpaceBackspace = processedData.includes(backspaceChar + ' ' + backspaceChar) || 
                                          processedData.match(/\x08\s+\x08/);
        const hasBackspaceFollowedByText = processedData.match(/\x08[^\s\x08]/); // \b followed by non-space, non-backspace
        
        const isRealDeletion = hasBackspaceSpaceBackspace;
        const isEchoCorrection = !isRealDeletion && hasBackspaceFollowedByText;
        
        let lastLine = buffer[buffer.length - 1];
        
        if (isRealDeletion) {
          // Real deletion: \b \b pattern - remove characters from last line
          for (let i = 0; i < processedData.length; i++) {
            const char = processedData[i];
            if (char === '\b') {
              lastLine = lastLine.slice(0, -1);
            } else if (char === ' ') {
              // Space in \b \b pattern - skip it (it's for overwriting)
              continue;
            } else if (char === '\n' || char === '\r') {
              break;
            }
          }
          buffer[buffer.length - 1] = lastLine;
          // Remove the backspace sequence from processedData (but keep spaces - they're part of the content)
          processedData = processedData.replace(/[\b]/g, '');
        } else if (isEchoCorrection) {
          // Terminal echo correction: \b<text> - replace the end of last line with the new text
          // Extract the text after \b (including spaces)
          let correctionText = '';
          for (let i = 0; i < processedData.length; i++) {
            const char = processedData[i];
            if (char === '\b') {
              // Remove one character from last line for each \b
              if (lastLine.length > 0) {
                lastLine = lastLine.slice(0, -1);
              }
            } else if (char === '\n' || char === '\r') {
              // Stop on newline/carriage return
              break;
            } else {
              // Include all other characters including spaces
              correctionText += char;
            }
          }
          // Append the correction text
          lastLine += correctionText;
          buffer[buffer.length - 1] = lastLine;
          // Clear processedData since we've applied it
          processedData = '';
        } else {
          // Unknown pattern - process normally
          let processedWithBackspace = '';
          for (let i = 0; i < processedData.length; i++) {
            if (processedData[i] === '\b') {
              processedWithBackspace = processedWithBackspace.slice(0, -1);
            } else {
              processedWithBackspace += processedData[i];
            }
          }
          processedData = processedWithBackspace;
        }
      } else {
        // No backspaces or no buffer - process normally
        let processedWithBackspace = '';
        for (let i = 0; i < processedData.length; i++) {
          if (processedData[i] === '\b') {
            processedWithBackspace = processedWithBackspace.slice(0, -1);
          } else {
            processedWithBackspace += processedData[i];
          }
        }
        processedData = processedWithBackspace;
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
      outputBufferRef.current.push(`Attempted URL: ${relayServerUrl}`);
      setOutput(outputBufferRef.current.join('\n'));
      Alert.alert('Connection Error', `Failed to connect to relay server:\n${error.message}\n\nURL: ${relayServerUrl}`, [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
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
      previousInputRef.current = text;
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
      if (newChars) {
        socketRef.current.emit('terminal:input', newChars);
        previousInputRef.current = text;
        // Track what we sent (accumulate, since we send incrementally)
        lastSentInputRef.current = text;
      }
    } else if (text.length < previous.length) {
      // Character(s) removed (backspace) - DON'T send backspace here
      // Backspace is already sent via onKeyPress, we just need to update state
      // The terminal will echo back the deletion, which we'll process in terminal:output
      const backspaces = previous.length - text.length;
      
      // Just update state - don't send backspace here
      // If onKeyPress didn't fire (rare on iOS), backspaceSentRef will be false and we can send it
      if (!backspaceSentRef.current) {
        for (let i = 0; i < backspaces; i++) {
          socketRef.current.emit('terminal:input', '\b');
        }
      } else {
        // Reset the flag for next time
        backspaceSentRef.current = false;
      }
      
      previousInputRef.current = text;
      lastSentInputRef.current = text;
    } else if (text.length === previous.length && text !== previous) {
      // If length is same but content changed, it might be autocorrect - send the change
      // Send backspace and new text
      socketRef.current.emit('terminal:input', '\b' + text.slice(previous.length - 1));
      previousInputRef.current = text;
      lastSentInputRef.current = text;
    } else {
      // Same text, no change
      previousInputRef.current = text;
    }
    
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
        if (unsent) {
          socketRef.current.emit('terminal:input', unsent);
          previousInputRef.current = currentInput;
          
          // Small delay to ensure characters are processed before Enter
          setTimeout(() => {
            if (socketRef.current && paired) {
              socketRef.current.emit('terminal:input', '\r');
            }
            setInput('');
            previousInputRef.current = '';
          }, 50);
          return;
        }
      }
      
      // No unsent chars, send Enter immediately
      socketRef.current.emit('terminal:input', '\r');
      setInput('');
      previousInputRef.current = '';
    }
  };

  // Handle Enter key - send newline
  const handleKeyPress = (e: any) => {
    const key = e.nativeEvent?.key || e.nativeEvent?.code || e.nativeEvent?.keyCode;
    const keyCode = e.nativeEvent?.keyCode;
    
    // Check for Backspace key
    if (
      key === 'Backspace' ||
      keyCode === 8 || // Backspace key code
      e.nativeEvent?.keyCode === 8
    ) {
      if (socketRef.current && paired) {
        // Send \b (backspace, 0x08) which is standard for most Unix shells
        // cursor-agent might work with \x7f, but regular shell typically expects \b
        socketRef.current.emit('terminal:input', '\b');
        // Mark that we've sent backspace so handleInputChange doesn't send it again
        backspaceSentRef.current = true;
      }
      return;
    }
    
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
        e.preventDefault?.();
        sendEnter();
      }
    }
  };

  // Also handle Enter via onSubmitEditing for iOS compatibility
  const handleSubmit = () => {
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
          {output ? parseAnsiToText(output) : 'Connecting...'}
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
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
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
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
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
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: 'bold',
  },
  prompt: {
    color: '#0f0',
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
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
