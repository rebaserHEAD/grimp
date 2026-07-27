// Dev launcher: start Vite on a pinned port, wait for it to answer, then
// launch Electron pointed at it. Avoids adding concurrently/wait-on deps.
//
// Both children are spawned WITHOUT a shell, on resolved binaries: with
// shell:true on Windows, kill() only kills the cmd.exe wrapper and the real
// vite process keeps holding the port after Electron closes (#55). Node also
// refuses to spawn .cmd shims shell-lessly (CVE-2024-27980), so we resolve
// the actual entrypoints instead of going through npx.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';

const require = createRequire(import.meta.url);

const PORT = 5180;
const URL = `http://localhost:${PORT}`;

// The vite package's bin script, run with the current Node. Resolved via
// package.json because vite's exports map doesn't expose ./bin/vite.js.
const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
// The electron package's main export is the path to the executable.
const electronBin = require('electron');

function checkPortFree(port) {
  return new Promise((resolve) => {
    const sock = net.connect(port, '127.0.0.1');
    sock.on('connect', () => {
      sock.end();
      resolve(false);
    });
    sock.on('error', () => resolve(true));
  });
}

const free = await checkPortFree(PORT);
if (!free) {
  console.error(
    `Port ${PORT} is already in use. A previous dev session's Vite server is` +
      ` probably still running; kill the node process holding the port and retry.`,
  );
  process.exit(1);
}

const vite = spawn(process.execPath, [viteBin, '--port', String(PORT), '--strictPort'], {
  stdio: 'inherit',
});

let electronLaunched = false;
vite.on('exit', (code) => {
  // Vite dying before Electron ever launched (port race, config error) would
  // otherwise leave waitForPort() retrying forever.
  if (!electronLaunched) {
    console.error(`Vite exited (code ${code}) before the app launched.`);
    process.exit(code ?? 1);
  }
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
  electronLaunched = true;
  // ELECTRON_RUN_AS_NODE forces the Electron binary to behave as plain Node,
  // which nulls out the `app` module. Strip it for the GUI launch.
  const env = { ...process.env, ELECTRON_START_URL: URL };
  delete env.ELECTRON_RUN_AS_NODE;
  const electron = spawn(electronBin, ['.'], {
    stdio: 'inherit',
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
