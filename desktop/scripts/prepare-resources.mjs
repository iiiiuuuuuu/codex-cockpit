import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(desktopDir, '..');
const destinationDir = path.join(desktopDir, 'src-tauri', 'resources', 'airouter');

const entries = [
  'run.js',
  'openai.js',
  'package.json',
  'package-lock.json',
  'openai.json.example',
  'openai-api-key.json.example',
  'app',
  'public',
  'node_modules'
];

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyEntry(entry) {
  const source = path.join(rootDir, entry);
  const destination = path.join(destinationDir, entry);

  if (!(await exists(source))) {
    throw new Error(`Missing required airouter resource: ${source}`);
  }

  await fs.rm(destination, { recursive: true, force: true });
  await fs.cp(source, destination, {
    recursive: true,
    dereference: true,
    filter(sourcePath) {
      return path.basename(sourcePath) !== '.DS_Store';
    }
  });
}

await fs.rm(destinationDir, { recursive: true, force: true });
await fs.mkdir(destinationDir, { recursive: true });

for (const entry of entries) {
  await copyEntry(entry);
}

console.log(`Prepared airouter resources at ${destinationDir}`);
