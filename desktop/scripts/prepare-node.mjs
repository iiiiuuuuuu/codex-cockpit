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
  darwin: {
    archiveExt: 'tar.gz',
    executablePath: ['bin', 'node'],
    arches: {
      arm64: {
        archiveArch: 'arm64',
        tauriName: 'node-aarch64-apple-darwin',
        aliasName: 'node'
      },
      x64: {
        archiveArch: 'x64',
        tauriName: 'node-x86_64-apple-darwin',
        aliasName: 'node'
      }
    }
  },
  win32: {
    archiveExt: 'zip',
    executablePath: ['node.exe'],
    arches: {
      x64: {
        archiveArch: 'x64',
        tauriName: 'node-x86_64-pc-windows-msvc.exe',
        aliasName: 'node.exe'
      },
      arm64: {
        archiveArch: 'arm64',
        tauriName: 'node-aarch64-pc-windows-msvc.exe',
        aliasName: 'node.exe'
      }
    }
  }
};

const platformTarget = targets[platform];
if (!platformTarget) {
  throw new Error(`Airouter Desktop currently prepares bundled Node only on macOS and Windows, got ${platform}`);
}

const target = platformTarget.arches[arch];
if (!target) {
  throw new Error(`Unsupported ${platform} architecture for bundled Node: ${arch}`);
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

function extractArchive(archive, destination) {
  if (platform === 'win32' && platformTarget.archiveExt === 'zip') {
    return spawnSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      '& { param($Archive, $Destination) Expand-Archive -LiteralPath $Archive -DestinationPath $Destination -Force }',
      archive,
      destination
    ], { stdio: 'inherit' });
  }

  const tarArgs = platformTarget.archiveExt === 'zip'
    ? ['-xf', archive, '-C', destination]
    : ['-xzf', archive, '-C', destination];
  return spawnSync('tar', tarArgs, { stdio: 'inherit' });
}

const nodePlatformName = platform === 'win32' ? 'win' : platform;
const archiveName = `node-${nodeVersion}-${nodePlatformName}-${target.archiveArch}.${platformTarget.archiveExt}`;
const cacheDir = path.join(os.homedir(), '.cache', 'airouter-desktop');
const archivePath = path.join(cacheDir, archiveName);
const extractedDir = path.join(cacheDir, archiveName.replace(/\.(tar\.gz|zip)$/, ''));
const sourceNode = path.join(extractedDir, ...platformTarget.executablePath);
const destinationNode = path.join(binariesDir, target.tauriName);
const devNodeAlias = path.join(binariesDir, target.aliasName);
const url = `https://nodejs.org/dist/${nodeVersion}/${archiveName}`;

await fs.mkdir(cacheDir, { recursive: true });
await fs.mkdir(binariesDir, { recursive: true });

if (!(await exists(sourceNode))) {
  if (!(await exists(archivePath))) {
    console.log(`Downloading ${url}`);
    await download(url, archivePath);
  }

  const result = extractArchive(archivePath, cacheDir);
  if (result.status !== 0) {
    throw new Error(`Failed to extract ${archivePath}`);
  }
}

await fs.copyFile(sourceNode, destinationNode);
await fs.copyFile(sourceNode, devNodeAlias);
if (platform !== 'win32') {
  await fs.chmod(destinationNode, 0o755);
  await fs.chmod(devNodeAlias, 0o755);
}

console.log(`Prepared bundled Node sidecar at ${destinationNode}`);
