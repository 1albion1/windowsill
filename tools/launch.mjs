#!/usr/bin/env node
/**
 * Starts Electron with a clean environment.
 *
 * VS Code is itself an Electron app and exports ELECTRON_RUN_AS_NODE=1 to its
 * child processes. Inherited by our Electron binary, that flag makes it boot as
 * plain Node: no app, no BrowserWindow, and a confusing "Cannot read properties
 * of undefined" on the first line that touches the API. Clearing it here means
 * `npm start` behaves the same in the integrated terminal as anywhere else.
 */

import { spawn } from 'node:child_process';
import electron from 'electron';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, ['.', ...process.argv.slice(2)], { stdio: 'inherit', env });

child.on('close', (code, signal) => process.exit(signal ? 1 : code ?? 0));
child.on('error', (error) => {
  console.error('Could not start Electron:', error.message);
  process.exit(1);
});
