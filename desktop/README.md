# Airouter Desktop

macOS-only Tauri wrapper for the existing airouter Node.js service.

The desktop app keeps runtime state in:

```text
~/Library/Application Support/Airouter/airouter/
```

It does not modify the root service files. Build preparation copies the service into `desktop/src-tauri/resources/airouter/` and places macOS Node.js sidecars in `desktop/src-tauri/binaries/`.

## Development

```bash
cd desktop
npm install
npm run prepare
npm run dev
```

If `npm` is unavailable in the shell, install or use a Node.js distribution that includes npm for Tauri CLI dependency installation. The packaged app itself does not rely on system Node.js.

The preparation scripts can be run with plain Node.js:

```bash
node scripts/prepare-resources.mjs
node scripts/prepare-node.mjs
```

## Build

```bash
cd desktop
npm run build
```
