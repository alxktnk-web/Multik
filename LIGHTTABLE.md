# Multik Lighttable

Isolated worktree: `/workspace/sites/multik-lighttable`, branch `lighttable-v2`.
Classic baseline: `5c45ea7c73361b875e6fbabd0bb64098adbd4dee`.
Plan/progress: `docs/lighttable/`; mirrored in `/workspace/review/multik-v2-handoff/`.

Local development: `npm run dev`, open `/lighttable/` on that local server.
Build only v2: `npm run build:lighttable` → `dist-lighttable/lighttable/`.
Classic build and service worker are unchanged. No v2 service worker exists yet. M3 uses only the new `multik-lighttable` database;
legacy `multik-app` is read-only during explicitly selected roll adoption. No remote synchronization or deployment is part of this slice.

Checks: `npm test`, `npm run test:lighttable:browser`,
`npm run test:lighttable:build`. Browser checks require a local listen capability
and the already installed Chromium. Screenshots/evidence: `lab-out/lighttable/`.

M2 includes real photo selection, independent 2D layer gestures, pinch/pan,
rotation, gesture undo, source-anchored halation and a minimal parameter tool.
M3/M4 adds durable roll import/adoption, independent pairs, CAS metadata saves at
navigation, and two collapsible film rails. Lifts remain RAM-only; reload returns
committed parameters. The initial demo is synthetic.
Device target: iPhone 16 Pro, user-reported iOS “27.01”; hardware performance unverified.
Additional checks: `test:lighttable:data`, `test:lighttable:workspace`, `test:lighttable:cache`.

Do not publish staging as the entire site: dual artifact assembly and PWA scopes
belong to M9. Preserve baseline `production.tar.gz` byte-for-byte for that step.
