import { io, Socket } from "socket.io-client";
import * as pty from "node-pty";
import os from "os";
import dotenv from "dotenv";
import chalk from "chalk";
import stripAnsi from "strip-ansi";
import wrtc from "@roamhq/wrtc";
import open from "open";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } = wrtc;
type RTCDataChannel = any;

dotenv.config();

const RELAY_SERVER = process.env.RELAY_SERVER_URL || "http://localhost:3000";
const TOKEN_FILE = path.join(process.cwd(), ".token");
const DEVICE_ID_FILE = path.join(process.cwd(), ".device_id");

console.log(chalk.bold.cyan("\n🖥️  MobiFai Mac Client"));
console.log(chalk.gray("================================\n"));

let socket: Socket;
let terminal: pty.IPty | null = null;
let peerConnection: InstanceType<typeof RTCPeerConnection> | null = null;
let dataChannel: RTCDataChannel | null = null;
let isWebRTCConnected = false;
let pendingIceCandidates: Array<{
  candidate: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
}> = [];

// ... (WebRTC setup code remains mostly the same, but I'll inline it for completeness) ...

async function setupWebRTC() {
  console.log(chalk.cyan("\n🔗 Setting up WebRTC P2P connection..."));

  try {
    peerConnection = new RTCPeerConnection({
      iceServers: [],
      iceTransportPolicy: "all",
      iceCandidatePoolSize: 10,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });

    console.log(chalk.gray("✅ Peer connection created"));

    peerConnection.onicecandidate = ({ candidate }: any) => {
      if (candidate) {
        console.log(
          chalk.gray("🧊 Generated ICE candidate, sending to mobile")
        );
        socket.emit("webrtc:ice-candidate", {
          candidate: {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
          },
        });
      }
    };

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection?.connectionState;
      console.log(chalk.yellow(`WebRTC Connection State: ${state}`));

      if (state === "connected") {
        isWebRTCConnected = true;
        console.log(
          chalk.bold.green("\n🎉 WebRTC P2P connection established!")
        );
        console.log(
          chalk.gray(
            "You can now terminate the relay server - clients will stay connected.\n"
          )
        );
      } else if (
        state === "disconnected" ||
        state === "failed" ||
        state === "closed"
      ) {
        isWebRTCConnected = false;
        console.log(
          chalk.red("❌ WebRTC connection lost, falling back to relay server")
        );
      }
    };

    // Create data channel
    dataChannel = peerConnection.createDataChannel("terminal");

    dataChannel.onopen = () => {
      console.log(chalk.green("✅ WebRTC data channel opened"));
      isWebRTCConnected = true;
    };

    dataChannel.onclose = () => {
      console.log(chalk.yellow("⚠️  WebRTC data channel closed"));
      isWebRTCConnected = false;
    };

    dataChannel.onmessage = ({ data }: any) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === "terminal:input" && terminal) {
          terminal.write(message.payload);
        } else if (message.type === "terminal:resize" && terminal) {
          terminal.resize(message.payload.cols, message.payload.rows);
          console.log(
            chalk.gray(
              `Terminal resized to ${message.payload.cols}x${message.payload.rows}`
            )
          );
        }
      } catch (error) {
        // Ignore parsing errors
      }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // Wait for ICE gathering
    await new Promise<void>((resolve) => {
      if (peerConnection!.iceGatheringState === "complete") {
        resolve();
      } else {
        const check = () => {
          if (peerConnection!.iceGatheringState === "complete") {
            peerConnection!.removeEventListener(
              "icegatheringstatechange",
              check
            );
            resolve();
          }
        };
        peerConnection!.addEventListener("icegatheringstatechange", check);
        setTimeout(resolve, 2000); // Timeout
      }
    });

    console.log(chalk.cyan("📡 Sending offer to mobile via relay server"));
    socket.emit("webrtc:offer", {
      offer: {
        sdp: peerConnection.localDescription!.sdp,
        type: peerConnection.localDescription!.type,
      },
    });
  } catch (error) {
    console.log(chalk.red("❌ Failed to setup WebRTC:", error));
  }
}

function getToken(): string | undefined {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      return fs.readFileSync(TOKEN_FILE, "utf-8").trim();
    }
  } catch (e) {
    return undefined;
  }
}

function saveToken(token: string) {
  fs.writeFileSync(TOKEN_FILE, token);
  console.log(chalk.gray("🔒 Token saved securely"));
}

function getDeviceId(): string {
  try {
    if (fs.existsSync(DEVICE_ID_FILE)) {
      return fs.readFileSync(DEVICE_ID_FILE, "utf-8").trim();
    }
  } catch (e) {
    // ignore
  }

  const newId = uuidv4();
  fs.writeFileSync(DEVICE_ID_FILE, newId);
  return newId;
}

function connectToRelay() {
  console.log(
    chalk.yellow(`📡 Connecting to relay server: ${RELAY_SERVER}...`)
  );

  const token = getToken();
  const deviceId = getDeviceId();
  console.log(chalk.gray(`Device ID: ${deviceId}`));

  socket = io(RELAY_SERVER, {
    reconnection: true,
  });

  socket.on("connect", () => {
    console.log(chalk.green("✅ Connected to relay server"));
    // Register as Mac device
    socket.emit("register", { type: "mac", token, deviceId });
  });

  socket.on("login_required", ({ loginUrl }) => {
    console.log(chalk.bold.yellow("\n🔒 Authentication Required"));
    console.log(
      chalk.cyan(`Opening browser to login: ${RELAY_SERVER}${loginUrl}`)
    );

    // Construct full URL
    const fullUrl = `${RELAY_SERVER}${loginUrl}`;
    open(fullUrl);
  });

  socket.on("authenticated", ({ token, user }) => {
    console.log(chalk.bold.green(`\n✅ Authenticated as ${user.email}`));
    saveToken(token);

    // Re-register with token to proceed
    socket.emit("register", { type: "mac", token, deviceId });
  });

  socket.on("auth_error", ({ message }) => {
    console.log(chalk.red(`\n❌ Auth Error: ${message}`));
    console.log(chalk.yellow("Removing invalid token..."));
    if (fs.existsSync(TOKEN_FILE)) {
      fs.unlinkSync(TOKEN_FILE);
    }
    // Will trigger login_required on next register attempt
    socket.emit("register", { type: "mac", deviceId });
  });

  // Store terminal dimensions from mobile
  let terminalCols = 80;
  let terminalRows = 30;

  socket.on("terminal:dimensions", ({ cols, rows }) => {
    console.log(chalk.cyan(`📐 Received terminal dimensions: ${cols}x${rows}`));
    terminalCols = cols;
    terminalRows = rows;
    if (terminal) terminal.resize(cols, rows);
  });

  socket.on("request_dimensions", () => {
    // Mobile is asking for dimensions? Actually mobile sends them.
    // Mac doesn't need to send dimensions usually, but if we reversed roles...
    // In this case, just ignore or log.
  });

  socket.on("waiting_for_peer", ({ message }) => {
    console.log(chalk.yellow(`\n⏳ ${message}`));
  });

  socket.on("paired", ({ message, peerId }) => {
    console.log(chalk.green(`\n✅ ${message}`));
    console.log(chalk.gray(`Peer ID: ${peerId}\n`));

    // Create terminal session
    startTerminal(terminalCols, terminalRows, socket);

    // Initiate WebRTC
    setupWebRTC();
  });

  socket.on("paired_device_disconnected", ({ message }) => {
    console.log(chalk.red(`\n❌ ${message}`));
    if (isWebRTCConnected && dataChannel?.readyState === "open") {
      console.log(chalk.yellow("⚠️  Relay disconnected, but P2P active"));
      return;
    }
    if (terminal) {
      terminal.kill();
      terminal = null;
      console.log(chalk.gray("Terminal session closed.\n"));
    }
    // Re-register to wait for connection
    const token = getToken();
    socket.emit("register", { type: "mac", token, deviceId });
  });

  // WebRTC handlers
  socket.on("webrtc:answer", async ({ answer }) => {
    console.log(chalk.cyan("📡 Received WebRTC answer"));
    if (peerConnection) {
      await peerConnection.setRemoteDescription(answer);

      // Add pending candidates
      if (pendingIceCandidates.length > 0) {
        for (const c of pendingIceCandidates) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(c));
        }
        pendingIceCandidates = [];
      }
    }
  });

  socket.on("webrtc:ice-candidate", async ({ candidate }) => {
    if (peerConnection && candidate.candidate) {
      if (!peerConnection.remoteDescription) {
        pendingIceCandidates.push(candidate);
      } else {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    }
  });

  // Fallback IO
  socket.on("terminal:input", (data: string) => {
    if (!isWebRTCConnected && terminal) terminal.write(data);
  });

  socket.on("terminal:resize", ({ cols, rows }) => {
    if (terminal) terminal.resize(cols, rows);
  });
}

function startTerminal(cols: number, rows: number, socketConnection: Socket) {
  if (terminal) return;

  const shell =
    os.platform() === "win32" ? "powershell.exe" : process.env.SHELL || "bash";
  console.log(chalk.cyan(`\n🖥️  Starting terminal session (${shell})...`));

  const env = {
    ...process.env,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
  };

  terminal = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols,
    rows,
    cwd: process.env.HOME || process.cwd(),
    env: env as any,
  });

  // Setup initial output
  let initBuffer = "";
  const tempListener = terminal.onData((data) => (initBuffer += data));

  setTimeout(() => {
    tempListener.dispose();

    // Notify system ready
    socketConnection.emit("system:message", { type: "terminal_ready" });

    // Send buffered output
    if (initBuffer) {
      socketConnection.emit("terminal:output", initBuffer);
    }

    // Main data listener
    terminal!.onData((data) => {
      if (isWebRTCConnected && dataChannel?.readyState === "open") {
        try {
          dataChannel.send(
            JSON.stringify({ type: "terminal:output", payload: data })
          );
        } catch (e) {
          socketConnection.emit("terminal:output", data);
        }
      } else {
        socketConnection.emit("terminal:output", data);
      }
    });
  }, 500);

  terminal.onExit(() => {
    console.log(chalk.gray("Terminal process exited"));
    terminal = null;
  });
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log(chalk.yellow("\n\n👋 Shutting down Mac client..."));

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

  setTimeout(() => process.exit(0), 500);
});

// Start
connectToRelay();
