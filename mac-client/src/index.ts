import { io, Socket } from 'socket.io-client';
import * as pty from 'node-pty';
import os from 'os';
import dotenv from 'dotenv';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import wrtc from '@roamhq/wrtc';
const { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } = wrtc;
type RTCDataChannel = any; // Use native type

dotenv.config();

const RELAY_SERVER = process.env.RELAY_SERVER_URL || 'http://localhost:3000';

console.log(chalk.bold.cyan('\n🖥️  MobiFai Mac Client'));
console.log(chalk.gray('================================\n'));

let socket: Socket;
let terminal: pty.IPty | null = null;
let peerConnection: RTCPeerConnection | null = null;
let dataChannel: RTCDataChannel | null = null;
let isWebRTCConnected = false;
let pendingIceCandidates: Array<{ candidate: string; sdpMid?: string; sdpMLineIndex?: number }> = [];

async function setupWebRTC() {
  console.log(chalk.cyan('\n🔗 Setting up WebRTC P2P connection...'));

  try {
    // Create peer connection - no STUN for local development (Mac + Simulator on same host)
    peerConnection = new RTCPeerConnection({
      iceServers: [], // Empty for local connections
      iceTransportPolicy: 'all', // Allow both relay and host candidates
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });

    console.log(chalk.gray('✅ Peer connection created'));

    // Handle ICE candidates
    peerConnection.onicecandidate = ({ candidate }) => {
      if (candidate) {
        console.log(chalk.gray('🧊 Generated ICE candidate, sending to mobile'));
        console.log(chalk.gray(`   Type: ${candidate.candidate?.split(' ')[7] || 'unknown'}`));
        socket.emit('webrtc:ice-candidate', {
          candidate: {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex
          }
        });
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection?.connectionState;
      console.log(chalk.yellow(`WebRTC Connection State: ${state}`));
      
      if (state === 'connected') {
        isWebRTCConnected = true;
        console.log(chalk.bold.green('\n🎉 WebRTC P2P connection established!'));
        console.log(chalk.gray('You can now terminate the relay server - clients will stay connected.\n'));
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        isWebRTCConnected = false;
        console.log(chalk.red('❌ WebRTC connection lost, falling back to relay server'));
      }
    };

    // Handle ICE connection state changes (more detailed)
    peerConnection.onicecandidateerror = (event: any) => {
      console.log(chalk.red(`❌ ICE candidate error: ${event.errorText || 'unknown'}`));
    };

    peerConnection.oniceconnectionstatechange = () => {
      const iceState = peerConnection?.iceConnectionState;
      console.log(chalk.cyan(`ICE Connection State: ${iceState}`));
      
      if (iceState === 'failed') {
        console.log(chalk.red('❌ ICE connection failed - check firewall/network settings'));
      }
    };

    const originalGatheringHandler = () => {
      const gatheringState = peerConnection?.iceGatheringState;
      console.log(chalk.gray(`ICE Gathering State: ${gatheringState}`));
    };
    peerConnection.onicegatheringstatechange = originalGatheringHandler;

    // Create data channel for terminal communication
    dataChannel = peerConnection.createDataChannel('terminal');
    console.log(chalk.gray('✅ Data channel created'));

    dataChannel.onopen = () => {
      console.log(chalk.green('✅ WebRTC data channel opened'));
      isWebRTCConnected = true;
    };

    dataChannel.onclose = () => {
      console.log(chalk.yellow('⚠️  WebRTC data channel closed'));
      isWebRTCConnected = false;
    };

    // Handle incoming terminal input from mobile via WebRTC
    dataChannel.onmessage = ({ data }) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'terminal:input' && terminal) {
          terminal.write(message.payload);
        } else if (message.type === 'terminal:resize' && terminal) {
          terminal.resize(message.payload.cols, message.payload.rows);
          console.log(chalk.gray(`Terminal resized to ${message.payload.cols}x${message.payload.rows}`));
        }
      } catch (error) {
        console.log(chalk.red('❌ Error parsing WebRTC message:', error));
      }
    };

    // Create and send offer
    console.log(chalk.gray('Creating WebRTC offer...'));
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    // Wait for ICE gathering to complete before sending offer (with timeout)
    await Promise.race([
      new Promise<void>((resolve) => {
        if (peerConnection!.iceGatheringState === 'complete') {
          resolve();
        } else {
          const waitHandler = () => {
            originalGatheringHandler(); // Call original handler
            if (peerConnection!.iceGatheringState === 'complete') {
              resolve();
            }
          };
          peerConnection!.onicegatheringstatechange = waitHandler;
        }
      }),
      new Promise<void>((resolve) => setTimeout(() => {
        console.log(chalk.yellow('⏱️  ICE gathering timeout - proceeding with available candidates'));
        resolve();
      }, 3000))
    ]);
    
    console.log(chalk.cyan('📡 Sending offer to mobile via relay server (with all ICE candidates)'));
    socket.emit('webrtc:offer', {
      offer: {
        sdp: peerConnection.localDescription!.sdp,
        type: peerConnection.localDescription!.type
      }
    });

    console.log(chalk.gray('Waiting for mobile to accept WebRTC connection...'));
  } catch (error) {
    console.log(chalk.red('❌ Failed to setup WebRTC:', error));
    console.log(chalk.yellow('Falling back to relay server mode'));
  }
}

function connectToRelay() {
  console.log(chalk.yellow(`📡 Connecting to relay server: ${RELAY_SERVER}...`));

  socket = io(RELAY_SERVER, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity
  });

  socket.on('connect', () => {
    console.log(chalk.green('✅ Connected to relay server'));

    // Register as Mac device
    socket.emit('register', { type: 'mac' });
  });

  socket.on('registered', ({ pairingCode, message }) => {
    console.log(chalk.green(`\n✅ ${message}`));
    console.log(chalk.bold.yellow(`\n🔑 Pairing Code: ${pairingCode}`));
    console.log(chalk.gray('\nShare this code with your mobile device to connect.'));
    console.log(chalk.gray('Code expires in 5 minutes.\n'));
  });

  // Store terminal dimensions from mobile
  let terminalCols = 80;
  let terminalRows = 30;
  
  socket.on('terminal:dimensions', ({ cols, rows }) => {
    console.log(chalk.cyan(`📐 Received terminal dimensions: ${cols}x${rows}`));
    terminalCols = cols;
    terminalRows = rows;
    
    // If terminal is already running, resize it
    if (terminal) {
      terminal.resize(cols, rows);
      console.log(chalk.gray(`Terminal resized to ${cols}x${rows}`));
    }
  });

  socket.on('paired', ({ message, mobileId }) => {
    console.log(chalk.green(`\n✅ ${message}`));
    console.log(chalk.gray(`Mobile ID: ${mobileId}\n`));

    // Create terminal session with dimensions from mobile
    startTerminal(terminalCols, terminalRows, socket);

    // Initiate WebRTC connection (Mac is the offerer)
    setupWebRTC();
  });

  socket.on('paired_device_disconnected', ({ message }) => {
    console.log(chalk.red(`\n❌ ${message}`));

    // Close terminal session
    if (terminal) {
      terminal.kill();
      terminal = null;
      console.log(chalk.gray('Terminal session closed.\n'));
    }

    // Request a new pairing code from the relay server
    console.log(chalk.yellow('🔄 Generating new pairing code...'));
    socket.emit('register', { type: 'mac' });
  });

  // WebRTC Signaling handlers
  socket.on('webrtc:answer', async ({ answer }) => {
    console.log(chalk.cyan('📡 Received WebRTC answer from mobile'));
    if (peerConnection) {
      try {
        await peerConnection.setRemoteDescription(answer);
        console.log(chalk.green('✅ WebRTC remote description set'));
        
        // Add any pending ICE candidates
        if (pendingIceCandidates.length > 0) {
          console.log(chalk.gray(`Adding ${pendingIceCandidates.length} pending ICE candidates...`));
          for (const candidate of pendingIceCandidates) {
            try {
              await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
              console.log(chalk.gray('✅ Pending ICE candidate added'));
            } catch (error) {
              console.log(chalk.red('❌ Failed to add pending ICE candidate:', error));
            }
          }
          pendingIceCandidates = [];
        }
      } catch (error) {
        console.log(chalk.red('❌ Failed to set remote description:', error));
      }
    }
  });

  socket.on('webrtc:ice-candidate', async ({ candidate }) => {
    console.log(chalk.cyan('🧊 Received ICE candidate from mobile'));
    if (peerConnection && candidate.candidate) {
      // Queue candidates if remote description isn't set yet
      if (!peerConnection.remoteDescription) {
        console.log(chalk.gray('⏳ Queueing ICE candidate (remote description not set yet)'));
        pendingIceCandidates.push({
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex
        });
        return;
      }
      
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate({
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex
        }));
        console.log(chalk.gray('✅ ICE candidate added'));
      } catch (error) {
        console.log(chalk.red('❌ Failed to add ICE candidate:', error));
      }
    }
  });

  // Fallback: WebSocket-based terminal communication (used if WebRTC fails)
  socket.on('terminal:input', (data: string) => {
    if (!isWebRTCConnected && terminal) {
      // Write directly to terminal - node-pty will handle it correctly
      terminal.write(data);
    }
  });

  socket.on('terminal:resize', ({ cols, rows }) => {
    if (terminal) {
      terminal.resize(cols, rows);
      console.log(chalk.gray(`Terminal resized to ${cols}x${rows}`));
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(chalk.red(`\n❌ Disconnected from relay server: ${reason}`));

    if (terminal) {
      terminal.kill();
      terminal = null;
    }
  });

  socket.on('connect_error', (error) => {
    console.log(chalk.red('❌ Connection error:', error.message));
  });

  socket.on('error', ({ message }) => {
    console.log(chalk.red(`❌ Error: ${message}`));
  });
}

function startTerminal(cols: number = 80, rows: number = 30, socketConnection: Socket) {
  if (terminal) {
    console.log(chalk.yellow('⚠️  Terminal already running'));
    return;
  }

  const shell = os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash';

  console.log(chalk.cyan(`\n🖥️  Starting terminal session (${shell})...`));
  console.log(chalk.gray(`Terminal dimensions: ${cols}x${rows}`));

  // Create environment with color support enabled
  const env = {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    FORCE_COLOR: '1',
    // Enable git colors
    GIT_PAGER: 'cat',
    // Ensure git uses colors
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'color.ui',
    GIT_CONFIG_VALUE_0: 'always',
    GIT_CONFIG_KEY_1: 'color.branch',
    GIT_CONFIG_VALUE_1: 'always',
  } as { [key: string]: string };

  // For zsh, we need to make it an interactive login shell to load .zshrc
  // This ensures zsh themes (oh-my-zsh, powerlevel10k, etc.) and git branch info are loaded
  const shellArgs: string[] = [];
  if (shell.includes('zsh')) {
    // Make zsh run as an interactive login shell to load .zshrc
    shellArgs.push('-l'); // login shell
    shellArgs.push('-i'); // interactive
  } else if (shell.includes('bash')) {
    // For bash, use --login to load .bashrc
    shellArgs.push('--login');
  }

  terminal = pty.spawn(shell, shellArgs, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.env.HOME || process.cwd(),
    env
  });

  console.log(chalk.gray('⏳ Configuring zsh prompt...'));

  // Buffer to collect output during initialization
  let initOutputBuffer = '';
  let dataListener: ((data: string) => void) | null = null;

  // Temporary listener to capture all output during init
  const tempListener = (data: string) => {
    initOutputBuffer += data;
  };
  terminal.onData(tempListener);

  // Configure zsh first, before connecting to mobile
  setTimeout(() => {
    if (terminal) {
      // Add git branch info to prompt using a precmd hook
      // Use zsh's native %F{color} syntax instead of raw ANSI codes
      terminal.write(`autoload -Uz vcs_info\nprecmd() { vcs_info }\nzstyle ':vcs_info:git:*' formats ' %F{green}%b%f'\nsetopt PROMPT_SUBST\nPROMPT='%F{blue}%~%f\$vcs_info_msg_0_ %F{green}%#%f '\nclear\n`);
      
      console.log(chalk.green('✅ Zsh configured'));
      
      // Wait a bit for prompt to appear, then start sending to mobile
      setTimeout(() => {
        console.log(chalk.cyan('📤 Sending terminal_ready message to mobile...'));
        console.log(chalk.gray(`Buffered output length: ${initOutputBuffer.length} chars`));
        console.log(chalk.gray(`Buffered output preview: ${stripAnsi(initOutputBuffer).substring(0, 100)}`));
        
        // Send terminal_ready FIRST so mobile will accept the output
        socketConnection.emit('system:message', { type: 'terminal_ready' });
        
        // Then send the buffered output (including the final prompt) to mobile
        if (initOutputBuffer) {
          const processedData = initOutputBuffer.replace(/\x1b\[[?0-9]*[hl]/g, '');
          console.log(chalk.gray(`Sending buffered output to mobile...`));
          socketConnection.emit('terminal:output', processedData);
        } else {
          console.log(chalk.yellow('⚠️  No buffered output to send!'));
        }
        
        console.log(chalk.green('✅ Terminal ready - now streaming to mobile\n'));
        
        // Now replace with the real listener for ongoing output
        dataListener = (data: string) => {
          // Process ANSI codes: keep colors and control sequences
          let processedData = data;
          
          // Keep ALL color/formatting ANSI codes (SGR codes ending in 'm') - we want colors!
          // Keep cursor positioning (\x1b[H, \x1b[A, \x1b[B, etc.), screen clearing (\x1b[2J), etc.
          // Only remove cursor visibility and other non-essential formatting codes
          processedData = processedData.replace(/\x1b\[[?0-9]*[hl]/g, '');
          
          // Send via WebRTC if connected, otherwise fall back to WebSocket
          if (isWebRTCConnected && dataChannel && dataChannel.readyState === 'open') {
            try {
              dataChannel.send(JSON.stringify({
                type: 'terminal:output',
                payload: processedData
              }));
            } catch (error) {
              console.log(chalk.yellow('⚠️  Failed to send via WebRTC, falling back to WebSocket'));
              if (socketConnection.connected) {
                socketConnection.emit('terminal:output', processedData);
              }
            }
          } else if (socketConnection.connected) {
            socketConnection.emit('terminal:output', processedData);
          }
        };
        terminal!.onData(dataListener);
      }, 500);
    }
  }, 500);

  terminal.onExit(() => {
    console.log(chalk.gray('\nTerminal session ended.'));
    terminal = null;
  });

  console.log(chalk.green('✅ Terminal session started\n'));
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n👋 Shutting down Mac client...'));

  if (terminal) {
    terminal.kill();
  }

  if (dataChannel) {
    dataChannel.close();
  }

  if (peerConnection) {
    peerConnection.close();
  }

  if (socket) {
    socket.disconnect();
  }

  process.exit(0);
});

// Start
connectToRelay();
