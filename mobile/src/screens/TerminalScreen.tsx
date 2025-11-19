import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
  Linking,
} from "react-native";
import { WebView } from "react-native-webview";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../../App";
import { io, Socket } from "socket.io-client";
import { WebRTCService } from "../services/WebRTCService";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Simple UUID-like generator for device ID
const generateDeviceId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

type TerminalScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, "Terminal">;
  route: RouteProp<RootStackParamList, "Terminal">;
};

const TOKEN_KEY = 'mobifai_auth_token';
const DEVICE_ID_KEY = 'mobifai_device_id';

export default function TerminalScreen({
  navigation,
  route,
}: TerminalScreenProps) {
  const { relayServerUrl } = route.params;
  const [connected, setConnected] = useState(false);
  const [paired, setPaired] = useState(false);
  const [terminalReady, setTerminalReady] = useState(false);
  const [webrtcConnected, setWebrtcConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("Connecting...");
  const webViewRef = useRef<WebView>(null);
  const socketRef = useRef<Socket | null>(null);
  const webrtcRef = useRef<WebRTCService | null>(null);
  const terminalDimensionsRef = useRef<{ cols: number; rows: number } | null>(
    null
  );

  useEffect(() => {
    connectToRelay();

    return () => {
      if (webrtcRef.current) {
        webrtcRef.current.cleanup();
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const sendToTerminal = (type: string, data: any) => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({ type, data }));
    }
  };

  const handleRefreshDimensions = () => {
    sendToTerminal("fit", {});
    
    if (terminalDimensionsRef.current && paired && socketRef.current) {
      console.log(
        "📐 Manually refreshing dimensions:",
        terminalDimensionsRef.current
      );
      socketRef.current.emit(
        "terminal:dimensions",
        terminalDimensionsRef.current
      );
      socketRef.current.emit("terminal:resize", terminalDimensionsRef.current);
    }
  };

  const getDeviceId = async () => {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = generateDeviceId();
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  };

  const connectToRelay = async () => {
    setConnectionStatus("📡 Connecting to relay server...");

    const token = await AsyncStorage.getItem(TOKEN_KEY);
    const deviceId = await getDeviceId();

    console.log(`Device ID: ${deviceId}`);

    const socket = io(relayServerUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setConnectionStatus("✅ Connected to relay server");
      // Register as mobile device with token and deviceId
      socket.emit("register", { type: "mobile", token, deviceId });
    });

    socket.on("login_required", ({ loginUrl }) => {
      setConnectionStatus("🔒 Authentication Required\nPlease log in via browser");
      Alert.alert(
        "Authentication Required",
        "You need to log in with Google to connect.",
        [
          {
            text: "Log In",
            onPress: () => {
               const fullUrl = `${relayServerUrl}${loginUrl}`;
               Linking.openURL(fullUrl);
            }
          },
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => navigation.goBack()
          }
        ]
      );
    });

    socket.on("authenticated", async ({ token, user }) => {
      console.log(`✅ Authenticated as ${user.email}`);
      await AsyncStorage.setItem(TOKEN_KEY, token);
      setConnectionStatus(`✅ Logged in as ${user.email}`);
      
      // Re-register with new token
      socket.emit("register", { type: "mobile", token, deviceId });
    });

    socket.on("auth_error", async ({ message }) => {
      console.log(`❌ Auth Error: ${message}`);
      await AsyncStorage.removeItem(TOKEN_KEY);
      // Will trigger login_required on next attempt
      socket.emit("register", { type: "mobile", deviceId });
    });

    socket.on("waiting_for_peer", ({ message }) => {
      setConnectionStatus(`⏳ ${message}`);
    });

    socket.on("paired", ({ message }) => {
      setPaired(true);
      console.log(`✅ ${message}`);
      setConnectionStatus("Connected!\n");

      // Initialize WebRTC P2P connection
      console.log("🔗 Initializing WebRTC P2P connection...");
      webrtcRef.current = new WebRTCService(socket);

      // Handle WebRTC messages
      webrtcRef.current.onMessage((data) => {
        if (data.type === "terminal:output") {
          sendToTerminal("output", data.payload);
        }
      });

      // Handle WebRTC connection state
      webrtcRef.current.onStateChange((state) => {
        if (state === "connected") {
          setWebrtcConnected(true);
          console.log("🎉 WebRTC P2P connected!");
        } else if (
          state === "disconnected" ||
          state === "failed" ||
          state === "closed"
        ) {
          setWebrtcConnected(false);
          console.log("⚠️  WebRTC disconnected, using relay server fallback");
        }
      });
    });

    socket.on("system:message", (data: { type: string; payload?: unknown }) => {
      if (data.type === "terminal_ready") {
        console.log("✅ Terminal ready on Mac side");
        setTerminalReady(true);
        setConnectionStatus(""); 
      }
    });

    // Listen for terminal output via WebSocket (fallback)
    socket.on("terminal:output", (data: string) => {
      if (!webrtcRef.current?.isWebRTCConnected()) {
        sendToTerminal("output", data);
      }
    });

    socket.on("paired_device_disconnected", ({ message }) => {
      if (webrtcRef.current?.isWebRTCConnected()) {
        console.log(
          "⚠️  Relay server disconnected, but P2P connection is still active"
        );
        sendToTerminal(
          "output",
          "\r\n\x1b[33m⚠️  Relay server disconnected (P2P still active)\x1b[0m\r\n"
        );
        return;
      }

      setPaired(false);
      sendToTerminal("output", `\r\n\x1b[31m❌ ${message}\x1b[0m\r\n`);
      Alert.alert("Disconnected", message, [
        {
          text: "OK",
          onPress: () => navigation.goBack(),
        },
      ]);
    });

    socket.on("disconnect", (reason) => {
      if (webrtcRef.current?.isWebRTCConnected()) {
        console.log(
          "⚠️  Relay server disconnected, but P2P connection is still active"
        );
        setConnected(false);
        sendToTerminal(
          "output",
          "\r\n\x1b[33m⚠️  Relay server disconnected (P2P still active)\x1b[0m\r\n"
        );
        return;
      }

      setConnected(false);
      setPaired(false);
      sendToTerminal(
        "output",
        `\r\n\x1b[31m❌ Disconnected: ${reason}\x1b[0m\r\n`
      );
    });

    socket.on("connect_error", (error) => {
      setConnectionStatus(
        `❌ Connection error: ${error.message}\nURL: ${relayServerUrl}`
      );
      Alert.alert(
        "Connection Error",
        `Failed to connect to relay server:\n${error.message}\n\nURL: ${relayServerUrl}`,
        [
          {
            text: "OK",
            onPress: () => navigation.goBack(),
          },
        ]
      );
    });

    socket.on("error", ({ message }) => {
      sendToTerminal("output", `\r\n\x1b[31m❌ Error: ${message}\x1b[0m\r\n`);
      Alert.alert("Error", message);
    });
  };

  const handleWebViewMessage = (event: any) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);

      if (message.type === "ready") {
        console.log("📱 Terminal WebView ready:", message.data);
        terminalDimensionsRef.current = message.data;

        if (paired && socketRef.current) {
          console.log("📤 Sending terminal dimensions:", message.data);
          socketRef.current.emit("terminal:dimensions", message.data);
        }

        if (!terminalReady) {
          sendToTerminal("output", connectionStatus + "\r\n");
        }
      } else if (message.type === "input") {
        if (paired) {
          const input = message.data;
          if (webrtcRef.current?.isWebRTCConnected()) {
            const success = webrtcRef.current.sendMessage(
              "terminal:input",
              input
            );
            if (!success && socketRef.current) {
              socketRef.current.emit("terminal:input", input);
            }
          } else if (socketRef.current) {
            socketRef.current.emit("terminal:input", input);
          }
        }
      } else if (message.type === "dimensions") {
        terminalDimensionsRef.current = message.data;
        if (paired && socketRef.current) {
          socketRef.current.emit("terminal:dimensions", message.data);
        }
      } else if (message.type === "resize") {
        if (paired && socketRef.current) {
          socketRef.current.emit("terminal:resize", message.data);
        }
      }
    } catch (error) {
      console.error("Error handling WebView message:", error);
    }
  };

  useEffect(() => {
    if (!terminalReady && connectionStatus) {
      sendToTerminal("output", connectionStatus + "\r\n");
    }
  }, [connectionStatus, terminalReady]);

  // ... (keep existing terminalHtml) ...
  const terminalHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Terminal</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.min.css" />
    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: #000;
            overflow: hidden;
            -webkit-user-select: none;
            user-select: none;
            -webkit-touch-callout: none;
        }
        #terminal {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            padding: 8px;
        }
        .xterm {
            height: 100%;
            width: 100%;
        }
        .xterm-viewport {
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch;
        }
    </style>
</head>
<body>
    <div id="terminal"></div>
    
    <script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/xterm-addon-web-links@0.9.0/lib/xterm-addon-web-links.min.js"></script>
    
    <script>
        const terminal = new Terminal({
            cursorBlink: true,
            cursorStyle: 'block',
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            fontSize: 14,
            lineHeight: 1.2,
            theme: {
                background: '#000000',
                foreground: '#00ff00',
                cursor: '#00ff00',
                cursorAccent: '#000000',
                selection: 'rgba(0, 255, 0, 0.3)',
                black: '#000000',
                red: '#cd3131',
                green: '#0dbc79',
                yellow: '#e5e510',
                blue: '#2472c8',
                magenta: '#bc3fbc',
                cyan: '#11a8cd',
                white: '#e5e5e5',
                brightBlack: '#666666',
                brightRed: '#f14c4c',
                brightGreen: '#23d18b',
                brightYellow: '#f5f543',
                brightBlue: '#3b8eea',
                brightMagenta: '#d670d6',
                brightCyan: '#29b8db',
                brightWhite: '#ffffff'
            },
            allowProposedApi: true,
            scrollback: 10000,
            convertEol: false,
            disableStdin: false
        });
        
        const fitAddon = new FitAddon.FitAddon();
        terminal.loadAddon(fitAddon);
        
        const webLinksAddon = new WebLinksAddon.WebLinksAddon();
        terminal.loadAddon(webLinksAddon);
        
        terminal.open(document.getElementById('terminal'));
        
        function fitTerminal() {
            try {
                fitAddon.fit();
                const dims = {
                    cols: terminal.cols,
                    rows: terminal.rows
                };
                window.ReactNativeWebView?.postMessage(JSON.stringify({
                    type: 'dimensions',
                    data: dims
                }));
            } catch (err) {
                console.error('Error fitting terminal:', err);
            }
        }
        
        setTimeout(fitTerminal, 100);
        window.addEventListener('resize', () => setTimeout(fitTerminal, 100));
        window.addEventListener('orientationchange', () => setTimeout(fitTerminal, 200));
        
        terminal.onData((data) => {
            window.ReactNativeWebView?.postMessage(JSON.stringify({
                type: 'input',
                data: data
            }));
        });
        
        terminal.onResize((size) => {
            window.ReactNativeWebView?.postMessage(JSON.stringify({
                type: 'resize',
                data: size
            }));
        });
        
        window.addEventListener('message', (event) => {
            try {
                const message = JSON.parse(event.data);
                handleMessage(message);
            } catch (err) {
                console.error('Error parsing message:', err);
            }
        });
        
        document.addEventListener('message', (event) => {
            try {
                const message = JSON.parse(event.data);
                handleMessage(message);
            } catch (err) {
                console.error('Error parsing document message:', err);
            }
        });
        
        function handleMessage(message) {
            if (message.type === 'output') {
                terminal.write(message.data);
            } else if (message.type === 'clear') {
                terminal.clear();
            } else if (message.type === 'reset') {
                terminal.reset();
            } else if (message.type === 'resize') {
                if (message.data?.cols && message.data?.rows) {
                    terminal.resize(message.data.cols, message.data.rows);
                }
            } else if (message.type === 'fit') {
                fitTerminal();
            } else if (message.type === 'focus') {
                terminal.focus();
            }
        }
        
        window.term = terminal;
        terminal.focus();
        
        setTimeout(() => {
            window.ReactNativeWebView?.postMessage(JSON.stringify({
                type: 'ready',
                data: {
                    cols: terminal.cols,
                    rows: terminal.rows
                }
            }));
        }, 200);
    </script>
</body>
</html>
  `;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={100}
    >
      <View style={styles.statusBar}>
        <View
          style={[styles.indicator, connected && styles.indicatorConnected]}
        />
        <Text style={styles.statusText}>
          {paired && webrtcConnected
            ? "P2P Connected ⚡"
            : paired
            ? "Paired (Relay)"
            : connected
            ? "Connected"
            : "Disconnected"}
        </Text>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={handleRefreshDimensions}
        >
          <Text style={styles.refreshButtonText}>⟳</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.fitButton}
          onPress={() => sendToTerminal("fit", {})}
        >
          <Text style={styles.fitButtonText}>⇱</Text>
        </TouchableOpacity>
      </View>

      <WebView
        ref={webViewRef}
        source={{ html: terminalHtml }}
        style={styles.webview}
        onMessage={handleWebViewMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        keyboardDisplayRequiresUserAction={false}
        originWhitelist={["*"]}
        mixedContentMode="always"
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error("WebView error:", nativeEvent);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error("WebView HTTP error:", nativeEvent);
        }}
        hideKeyboardAccessoryView={true}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(17, 17, 17, 0.9)",
  },
  indicator: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#f00",
    marginRight: 6,
  },
  indicatorConnected: {
    backgroundColor: "#0f0",
  },
  statusText: {
    color: "#0f0",
    fontSize: 9,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    flex: 1,
  },
  refreshButton: {
    backgroundColor: "#0f0",
    width: 24,
    height: 22,
    borderRadius: 2,
    marginLeft: 4,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  refreshButtonText: {
    color: "#000",
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 2,
    marginLeft: 3,
  },
  fitButton: {
    backgroundColor: "#0f0",
    width: 24,
    height: 22,
    borderRadius: 2,
    marginLeft: 4,
  },
  fitButtonText: {
    color: "#000",
    fontSize: 15,
    fontWeight: "bold",
    marginTop: 2,
    marginLeft: 6,
  },
  webview: {
    flex: 1,
    backgroundColor: "#000",
  },
});
