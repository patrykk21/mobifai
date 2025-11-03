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

  socket.on('paired', ({ message, mobileId }) => {
    console.log(chalk.green(`\n✅ ${message}`));
    console.log(chalk.gray(`Mobile ID: ${mobileId}\n`));

    // Create terminal session
    startTerminal();
  });

  socket.on('paired_device_disconnected', ({ message }) => {
    console.log(chalk.red(`\n❌ ${message}`));

    // Close terminal session
    if (terminal) {
      terminal.kill();
      terminal = null;
      console.log(chalk.gray('Terminal session closed.\n'));
    }
  });

  socket.on('terminal:input', (data: string) => {
    if (terminal) {
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

function startTerminal() {
  if (terminal) {
    console.log(chalk.yellow('⚠️  Terminal already running'));
    return;
  }

  const shell = os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash';

  console.log(chalk.cyan(`\n🖥️  Starting terminal session (${shell})...`));

  terminal = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 30,
    cwd: process.env.HOME || process.cwd(),
    env: process.env as { [key: string]: string }
  });

  // Send terminal output to mobile device via relay
  // Strip ANSI escape codes for better display on mobile
  terminal.onData((data) => {
    if (socket.connected) {
      // Strip ANSI escape codes (colors, formatting, etc.) for cleaner output
      const cleanData = stripAnsi(data);
      socket.emit('terminal:output', cleanData);
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
