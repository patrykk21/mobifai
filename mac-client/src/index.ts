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
    startTerminal(terminalCols, terminalRows);
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

function startTerminal(cols: number = 80, rows: number = 30) {
  if (terminal) {
    console.log(chalk.yellow('⚠️  Terminal already running'));
    return;
  }

  const shell = os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash';

  console.log(chalk.cyan(`\n🖥️  Starting terminal session (${shell})...`));
  console.log(chalk.gray(`Terminal dimensions: ${cols}x${rows}`));

  terminal = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.env.HOME || process.cwd(),
    env: process.env as { [key: string]: string }
  });

  // Send terminal output to mobile device via relay
  // Process ANSI escape codes: keep control sequences, strip colors
  terminal.onData((data) => {
    if (socket.connected) {
      // Process ANSI codes: keep colors and control sequences
      let processedData = data;
      
      // Keep ALL color/formatting ANSI codes (SGR codes ending in 'm') - we want colors!
      // Keep cursor positioning (\x1b[H, \x1b[A, \x1b[B, etc.), screen clearing (\x1b[2J), etc.
      // Only remove cursor visibility and other non-essential formatting codes
      processedData = processedData.replace(/\x1b\[[?0-9]*[hl]/g, '');
      
      socket.emit('terminal:output', processedData);
    }
  });

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
