import { io, Socket } from 'socket.io-client';
import * as pty from 'node-pty';
import os from 'os';
import dotenv from 'dotenv';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';

dotenv.config();

const RELAY_SERVER = process.env.RELAY_SERVER_URL || 'http://localhost:3000';

console.log(chalk.bold.cyan('\n🖥️  MobiFai Mac Client'));
console.log(chalk.gray('================================\n'));

let socket: Socket;
let terminal: pty.IPty | null = null;

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

  socket.on('terminal:input', (data: string) => {
    if (terminal) {
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
          if (socketConnection.connected) {
            // Process ANSI codes: keep colors and control sequences
            let processedData = data;
            
            // Keep ALL color/formatting ANSI codes (SGR codes ending in 'm') - we want colors!
            // Keep cursor positioning (\x1b[H, \x1b[A, \x1b[B, etc.), screen clearing (\x1b[2J), etc.
            // Only remove cursor visibility and other non-essential formatting codes
            processedData = processedData.replace(/\x1b\[[?0-9]*[hl]/g, '');
            
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

  if (socket) {
    socket.disconnect();
  }

  process.exit(0);
});

// Start
connectToRelay();
