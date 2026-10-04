#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const venvPyWin = path.join(root, '.venv', 'Scripts', 'python.exe');
const venvPyNix = path.join(root, '.venv', 'bin', 'python');

let pythonCmd = 'python3';
if (existsSync(venvPyWin)) {
  pythonCmd = venvPyWin;
} else if (existsSync(venvPyNix)) {
  pythonCmd = venvPyNix;
} else if (process.platform === 'win32') {
  pythonCmd = 'python';
}

const args = process.argv.slice(2);

const child = spawn(pythonCmd, args, {
  stdio: 'inherit',
  cwd: root,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
