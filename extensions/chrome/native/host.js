#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ALLOWED_ACTIONS = new Set(['start', 'restart', 'stop']);
const ACTION_TO_NPM_ARGS = {
  start: ['start'],
  restart: ['run', 'restart'],
  stop: ['run', 'stop'],
};

function send(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]), () => {
    process.exit(0);
  });
}

function fail(error, extra = {}) {
  send({
    ok: false,
    error: error && error.message ? error.message : String(error),
    ...extra,
  });
}

function readMessage() {
  return new Promise((resolve, reject) => {
    let input = Buffer.alloc(0);
    let resolved = false;

    function tryResolve() {
      if (resolved || input.length < 4) {
        return;
      }

      const length = input.readUInt32LE(0);
      if (input.length < 4 + length) {
        return;
      }

      resolved = true;
      const body = input.subarray(4, 4 + length).toString('utf8');
      resolve(JSON.parse(body));
    }

    process.stdin.on('data', chunk => {
      input = Buffer.concat([input, chunk]);
      tryResolve();
    });
    process.stdin.on('error', reject);
    process.stdin.on('end', () => {
      if (!resolved && input.length < 4) {
        reject(new Error('Native message is missing length header'));
      }
    });
  });
}

function normalizeRepoPath(value) {
  const repoPath = path.resolve(String(value || '').trim());
  if (!repoPath || repoPath === path.parse(repoPath).root) {
    throw new Error('repoPath is required');
  }

  const packagePath = path.join(repoPath, 'package.json');
  const runPath = path.join(repoPath, 'run.js');
  if (!fs.existsSync(packagePath) || !fs.existsSync(runPath)) {
    throw new Error(`repoPath 不是 ai-cockpit 仓库: ${repoPath}`);
  }

  return repoPath;
}

function resolveNpm() {
  const candidates = [
    process.env.AI_COCKPIT_NPM,
    '/opt/homebrew/bin/npm',
    '/usr/local/bin/npm',
    '/usr/bin/npm',
    'npm',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === 'npm' || fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return 'npm';
}

function runCommand(command, args, cwd, options = {}) {
  const timeoutMs = options.timeoutMs || 120000;

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      env: {
        ...process.env,
        PATH: [
          '/opt/homebrew/bin',
          '/usr/local/bin',
          '/usr/bin',
          '/bin',
          '/usr/sbin',
          '/sbin',
          process.env.PATH || '',
        ].join(':'),
      },
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      child.kill('SIGTERM');
      settled = true;
      resolve({
        ok: false,
        stdout,
        stderr: `${stderr}\nCommand timed out after ${timeoutMs}ms`.trim(),
        status: null,
      });
    }, timeoutMs);

    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', error => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolve({
          ok: false,
          stdout,
          stderr: `${stderr}\n${error.message}`.trim(),
          status: null,
        });
      }
    });
    child.on('close', status => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolve({
          ok: status === 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          status,
        });
      }
    });
  });
}

async function ensureDependencies(repoPath, npm) {
  if (fs.existsSync(path.join(repoPath, 'node_modules'))) {
    return { ok: true, stdout: '', stderr: '', status: 0 };
  }

  return runCommand(npm, ['install'], repoPath, { timeoutMs: 300000 });
}

async function handle(message) {
  const action = String(message && message.action || '').trim();
  if (!ALLOWED_ACTIONS.has(action)) {
    throw new Error(`Unsupported action: ${action}`);
  }

  const repoPath = normalizeRepoPath(message.repoPath);
  const npm = resolveNpm();

  if (action === 'start' || action === 'restart') {
    const installResult = await ensureDependencies(repoPath, npm);
    if (!installResult.ok) {
      return {
        ...installResult,
        action,
      };
    }
  }

  const result = await runCommand(npm, ACTION_TO_NPM_ARGS[action], repoPath);
  return {
    ...result,
    action,
  };
}

(async () => {
  try {
    const message = await readMessage();
    send(await handle(message));
  } catch (error) {
    fail(error);
  }
})();
