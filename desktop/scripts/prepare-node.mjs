import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, '..');
const binariesDir = path.join(desktopDir, 'src-tauri', 'binaries');
const nodeVersion = process.env.AIROUTER_DESKTOP_NODE_VERSION || 'v22.15.1';
const platform = os.platform();
const arch = os.arch();

const targets = {
  arm64: {
    archiveArch: 'arm64',
    tauriName: 'node-aarch64-apple-darwin'
  },
  x64: {
    archiveArch: 'x64',
    tauriName: 'node-x86_64-apple-darwin'
  }
};

if (platform !== 'darwin') {
  throw new Error(`Airouter Desktop currently prepares bundled Node only on macOS, got ${platform}`);
}

if (!targets[arch]) {
  throw new Error(`Unsupported macOS architecture for bundled Node: ${arch}`);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destination, bytes);
}

const target = targets[arch];
const archiveName = `node-${nodeVersion}-darwin-${target.archiveArch}.tar.gz`;
const cacheDir = path.join(os.homedir(), '.cache', 'airouter-desktop');
const archivePath = path.join(cacheDir, archiveName);
const extractedDir = path.join(cacheDir, archiveName.replace(/\.tar\.gz$/, ''));
const sourceNode = path.join(extractedDir, 'bin', 'node');
const destinationNode = path.join(binariesDir, target.tauriName);
const devNodeAlias = path.join(binariesDir, 'node');
const url = `https://nodejs.org/dist/${nodeVersion}/${archiveName}`;

await fs.mkdir(cacheDir, { recursive: true });
await fs.mkdir(binariesDir, { recursive: true });

if (!(await exists(sourceNode))) {
  if (!(await exists(archivePath))) {
    console.log(`Downloading ${url}`);
    await download(url, archivePath);
  }

  const result = spawnSync('tar', ['-xzf', archivePath, '-C', cacheDir], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`Failed to extract ${archivePath}`);
  }
}

await fs.copyFile(sourceNode, destinationNode);
await fs.copyFile(sourceNode, devNodeAlias);
await fs.chmod(destinationNode, 0o755);
await fs.chmod(devNodeAlias, 0o755);

console.log(`Prepared bundled Node sidecar at ${destinationNode}`);
