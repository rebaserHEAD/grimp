// Dev launcher: start Vite on a pinned port, wait for it to answer, then
// launch Electron pointed at it. Avoids adding concurrently/wait-on deps.
import { spawn } from 'node:child_process';
import net from 'node:net';

const PORT = 5180;
const URL = `http://localhost:${PORT}`;

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: 'inherit',
  shell: true,
});

function waitForPort(port) {
  // Vite may bind IPv4 (127.0.0.1) or IPv6 (::1) depending on the Node/OS
  // stack, so probe both; first to answer wins.
  let launched = false;
  const attempt = (host) => {
    const sock = net.connect(port, host);
    sock.on('connect', () => {
      sock.end();
      if (!launched) {
        launched = true;
        launchElectron();
      }
    });
    sock.on('error', () => setTimeout(() => attempt(host), 300));
  };
  attempt('127.0.0.1');
  attempt('::1');
}

function launchElectron() {
  // ELECTRON_RUN_AS_NODE forces the Electron binary to behave as plain Node,
  // which nulls out the `app` module. Strip it for the GUI launch.
  const env = { ...process.env, ELECTRON_START_URL: URL };
  delete env.ELECTRON_RUN_AS_NODE;
  const electron = spawn('npx', ['electron', '.'], {
    stdio: 'inherit',
    shell: true,
    env,
  });
  electron.on('close', () => {
    vite.kill();
    process.exit(0);
  });
}

process.on('SIGINT', () => {
  vite.kill();
  process.exit(0);
});

waitForPort(PORT);
