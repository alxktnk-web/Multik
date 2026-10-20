# Multik — source transfer

Snapshot: `a0881c035929a4523fc1c7706d418f000a94f90c`. Published application source: `d22a3ca1ec4ba3d6885e803b746eb787c6bc6688`, Sites version 8. The difference is publication documentation only.

The owner explicitly requested transferring this source to GitHub. This supersedes historical no-GitHub instructions for this transfer. No runtime code or functionality was changed for packaging.

## Run

Use Node.js 22 and npm.

```sh
npm ci --include=dev
npm run dev
```

Open the Vite address with `/lighttable/` for the current application. `/` is the preserved Classic UI.

```sh
npm test
npm run build
npm run preview
```

`npm run build` creates `dist/`: immutable Classic at root and the current PWA at `/lighttable/`. `deployment/classic-baseline.tar.gz` is a required build input, not a temporary artifact. Build dependencies and package-lock.json are included; installed node_modules is not. Browser suites require Chromium; several scripts use `/usr/bin/chromium`.

## Included and excluded

All tracked source, assets, scripts, tests and project documentation are included. .gitignore has additional secret-file exclusions; this README notice and TRANSFER.md are packaging-only documentation. `.openai/hosting.json` retains the existing Sites project ID, which is configuration rather than a credential. Do not use it to deploy to a different Sites project.

No Git history, node_modules, dist output, logs, temporary files, local environment files or user photos are included. The app stores photos and edits in the browser's IndexedDB; this source export does not transfer that library. Existing deployment was not changed.

Pattern-based secret scanning covered tracked files and the contents of the required baseline tar. No matches were found; this is not a guarantee against every possible secret format. CHECKSUMS.sha256 covers all other packaged files.

For current architecture and limitations read docs/lighttable/PROGRESS.md and DEPLOYMENT.md. iPhone hardware acceptance remains pending.
