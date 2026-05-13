import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, '..');
const distDir = path.join(desktopDir, 'dist');

const entries = ['index.html', 'src'];

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(distDir, { recursive: true });

for (const entry of entries) {
  await fs.cp(path.join(desktopDir, entry), path.join(distDir, entry), {
    recursive: true,
    dereference: true,
    filter(sourcePath) {
      return path.basename(sourcePath) !== '.DS_Store';
    }
  });
}

console.log(`Prepared desktop frontend at ${distDir}`);
