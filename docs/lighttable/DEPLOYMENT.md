# Current release — Sites version 10, 21 October 2026

- Live URL: https://multik-photo-room.alexanderhot.chatgpt.site/lighttable/ .
- Native private deployment: `appgdep_6ad852d9099c8191bd6a8722ca6697c1`, **succeeded** at 2026-10-21 05:51:34 UTC. Owner-only access, existing origin and root Classic retained.
- Saved version: `appgprj_6ad0be6c39f48191b3dad11c00502dc4~appgver_7be94984510c81918c2b56c5a4217b1c`, confirmed version number 10.
- GitHub implementation `afc4f7f`, main merge `851a47d61428233e1e1a456beb83c0e5629bb896`; CI [39551785695](https://github.com/alxktnk-web/Multik/actions/runs/39551785695) succeeded. Backup reference `backup/main-before-levels-2026-10-21` points to `fc4f28f`.
- Sites source `bf113b812f5d789db12e7937057e998fdf4e832c` merges the GitHub release with the previous Sites history. Exact shared source tree `6146152100966df4df271a36ae7d6f5908fcd1ee`. Private Sites history was not pushed to GitHub.
- Archive `/workspace/multik-levels-editor-deploy.tar.gz`, local SHA-256 `cb17cf32785cb0f9ca9ded5b05451670ee767e7a540bfb0495ff871cd74b5abc`; backend stored tar hash `sha256:40bbd5e5d5412a1920811ef219e93d7be62b708cba414ee13d8655e08f116650`, 23 files. Independent Node 22 build matched all 22 tested static files. 13 Classic files identical to baseline.
- Features: Edit checkpoint/Done/Cancel, source Levels without a legend, Looks Original/Film/Dense/Clear, portrait/landscape controls, standardized local Lucide SVG. Clear/version 5 uses manual source Levels plus linear addition and clipping, with no automatic effects.
- Installed PWA: info → Update, then Edit → Levels / Looks. Hardware Safari/Photos/latency acceptance is still open. Validation commands and limits: VALIDATION.md.
- No separate data migration was added: the owner waived preservation of old test data. The release does not clear browser storage. Readers before this release do not implement Levels/Clear; prefer a forward fix for live issues. A Git revert is source rollback, not a browser-data rollback.
- Publication used the existing documented helper-unavailable fallback: clean isolated checkout, short-lived credential in hidden stdin/RAM only, non-force source push and remote-SHA verification, exact-source build/archive, native owner-private publication. No token persisted or printed. GitHub Pages remains disabled.
- Publication-record-only commits after the runtime merge do not require another deployment.

---

# Film / Dense integration — Sites version 9

Published 21 October 2026 after the owner requested integrating the completed research into the application.

- Live app: https://multik-photo-room.alexanderhot.chatgpt.site/lighttable/
- Project: `appgprj_6ad0be6c39f48191b3dad11c00502dc4`.
- Saved version: `appgprj_6ad0be6c39f48191b3dad11c00502dc4~appgver_aa9caf3ac1908191b17950cae7bc6722` (version 9).
- Deployment: `appgdep_6ad806c9cf988191a064d4dab77a5d9c`, native status **succeeded**, `2026-10-21T00:27:03.554870+00:00`.
- GitHub runtime merge: `c3372d9a209a68baa0f812ddb0b25ac73ac9a2ec`; integration change `962c727`, research head `319e3f8`. PR #1 is merged. [Node 22 CI succeeded](https://github.com/alxktnk-web/Multik/actions/runs/39521219112).
- Sites source: `b21533c1470f84862b9e3c22903dd42107c82d90`. Parents preserve the prior Sites `d22a3ca` history and the GitHub runtime merge. Shared source tree: `005af8c90ab536661a69dd5bb27dc55090d19fd5`. The private Sites history was not pushed to public GitHub.
- Archive: `/workspace/multik-film-profiles-deploy.tar.gz`, local SHA-256 `e95dbb18be2dbe1689d1876661467fa475891571c78534bc3fa6b864dd8a8db7`. Saved backend tar hash `sha256:3c0a3507f8f646566fd74712c0114cba46dfb5b7f8283532d9dfe9183444d186`, 23 files. Keep the archive unchanged.
- Independent publish checkout built the exact source tree; all 22 static files matched the tested build byte-for-byte. All 13 Classic files remain identical to the vendored baseline.
- `get_site` confirmed owner-only custom access before publication; private deployment preserved it. Origin, root Classic, DB schema, original blobs and existing profile-2 pairs were not migrated. Pages remains verification-only.
- The Sites source helper is absent in this environment. Used the documented RAM/hidden-stdin Git credential fallback, non-force source push with ancestry/remote SHA verification, exact-tree build and native archive-backed private publication. No credential was persisted or printed.
- Validation: 66 unit tests, frozen profile 2/3 + CPU candidate oracles, both film harnesses, density comparison, new profile UI suite, browser/gestures/Pro/workspace, profile-4 4000px export/12MP fixtures/20-export plateau, production smoke and scoped PWA — PASS. See VALIDATION.md. Safari/iPhone hardware acceptance remains open.

## Using the update and rollback limits

Installed PWA: info → **Update**. Open Pro → the two-frame **Image profile** icon. Original/Film/Dense preview the current pair; Cancel restores its previous draft, Apply adds one RAM Undo, and the normal navigation/export boundary saves metadata. New pairs remain Original. Do not clear Safari data.

GitHub backup `backup/main-before-profiles-2026-10-21` preserves `0dc89b7`. A source rollback is a normal reviewed revert of merge `c3372d9` with first parent 1; it does not deploy or restore browser data. Once a user saves profile 3/4, the old v8 reader cannot read that composition. Prefer a forward fix retaining 3/4 support. An explicit switch of a selected pair to Original in the current app is reversible and preserves its originals/geometry/effects; there is no bulk downgrade.

Version 8 remains a saved hosting artifact, not a guaranteed data-compatible downgrade. Preserve both databases and cache/update semantics. Subsequent publication-record commits on GitHub only update documentation; do not republish the same runtime for documentation alone.

---

# GitHub development base — 20 October 2026

The source repository is now `https://github.com/alxktnk-web/Multik`, with v8 as the development base of `main`. This is a source integration only. No Sites publication, Pages publication, origin change, root switch or browser-data migration is part of this operation.

- Previous main: `57ce58e6c9f68c2e81bd8156218426bc347ba695`, preserved as `backup/main-before-v8-2026-10-20`.
- Verified import: `4f139e6740641aa25178245d5ad446e6fce7225f`, retained on `multik-v8-source`. Its 104 manifest entries matched before integration (105 tracked files including `CHECKSUMS.sha256`).
- Previous main was an ancestor of the import (0 main-only / 1 v8-only commits). A normal merge preserves that history and provides a specific reversible integration boundary.
- Before merging, `.github/workflows/pages.yml` was changed to verification only in a separate first-parent commit. Push/PR to main and manual runs execute Node 22, `npm ci --include=dev`, `npm test`, `npm run build`. No Pages upload/deploy, environment or write token permissions remain. The previously published Pages artifact is not replaced by this operation.
- Reason: the imported build assembles immutable Classic at `/` and Lighttable at `/lighttable/`; manifest, navigation and recovery contain origin-root paths. Relative Vite assets alone do not make it a tested Pages `/Multik/` deployment.
- Live app: https://multik-photo-room.alexanderhot.chatgpt.site/lighttable/ . The existing Sites configuration is preserved. Photos and edits remain in browser IndexedDB at that origin; GitHub does not contain or transfer the library.

## Source rollback

Find the integration commit with `git log --first-parent --merges --oneline main` (message: `Merge Multik v8 as the main development base`). Create a branch from current main and run `git revert -m 1 <integration-commit>`, then review and merge that revert normally. The first parent already contains the no-deployment workflow, so this reverts the v8 import without restoring automatic Pages publishing. Later edits may need conflict resolution; never use force push or reset main to the backup branch.

The backup branch preserves the exact previous source, including its historical publishing workflow: it is a reference, not a branch to merge wholesale into main for rollback. Keep `multik-v8-source` available for restoration. The original transfer manifest is scoped to that import, not to subsequent main documentation changes.

Source rollback does not deploy anything, restore photos or migrate IndexedDB. Runtime rollback is a separate Sites operation; version 7 cannot be assumed to read profile-2 compositions from v8. Prefer a forward fix preserving profile-2 readers. Do not clear Safari data.

---

# Gesture / tone update — Sites version 8

- Published 2026-10-20 following owner feedback: swipe versus layer movement, selected-layer pinch, accidental Classic navigation and gray mixing tone.
- URL: https://multik-photo-room.alexanderhot.chatgpt.site/lighttable/
- Project: appgprj_6ad0be6c39f48191b3dad11c00502dc4
- Saved version: appgprj_6ad0be6c39f48191b3dad11c00502dc4~appgver_6c6d85ec054881919654135d7a6a0f5d
- Deployment: appgdep_6ad721e0db5881918e11f769d6e53663
- Source: d22a3ca1ec4ba3d6885e803b746eb787c6bc6688
- Native status: succeeded, 2026-10-20T08:10:23.837753+00:00.
- Audience: owner-private preserved; get_site confirmed owner-only custom policy before deployment. Existing Sites repository main fast-forward; no GitHub.
- Archive: /workspace/review/multik-gestures-deploy.tar.gz. Backend hash sha256:19613ae09e138f74c4ec7705f07996874e6ac855839fd2db9371e4523df70675, 23 files. Keep unchanged.
- Isolated publish checkout built exact pushed source; all 22 static files byte-identical to tested active build. 13 Classic files remain byte-identical to baseline; stable Classic checkout clean at 5c45ea7.
- Source helper remained absent; reused documented RAM-only credential fallback, non-force push and exact remote SHA verification. No token persisted or printed.
- Passed: 62 unit tests, native-touch browse/move/pinch/tone probes, workspace incl. conflict-copy revisit, Pro, GPU suite, tiled JPEG export with scaled layer, production smoke and scoped PWA/offline/update/recovery/auth redirect tests. iPhone hardware performance and subjective photographs remain device review.
- Installed PWA: circle/info → Update. Never clear Safari data for updates. A root Classic home-screen icon still launches Classic; correct new install URL ends /lighttable/.
- Version 7 remains a saved application artifact, but it rejects profile-2 composition records written by version 8. Do not promise data-compatible downgrade; prefer a forward fix preserving version-2 reader. Source originals, rolls and Classic data are not deleted or migrated. Cached shell may require explicit activation after any deployment.

---

# One-hand / glass update — Sites version 7

- Published 2026-10-19 following owner feedback requesting fixes to import limits, one-handed confirmation, naming, uniform film direction, English minimal glass UI and Save to Photos.
- URL: https://multik-photo-room.alexanderhot.chatgpt.site/lighttable/
- Project: appgprj_6ad0be6c39f48191b3dad11c00502dc4
- Saved version: appgprj_6ad0be6c39f48191b3dad11c00502dc4~appgver_57e03183aee481918211619238a3abc4
- Deployment: appgdep_6ad650d64d2c819180814eed8e36f82f
- Source: cad3a1dcb33580e1031fb7856dbead18160f39f7
- Native status: succeeded, 2026-10-19T17:18:28.674671+00:00.
- Audience: owner-private preserved. Existing Sites repository main fast-forward; no GitHub.
- Archive: /workspace/review/multik-onehand-deploy.tar.gz, unchanged after upload. Backend hash sha256:90989a455017fd2cd50f229610d84e6307a7ce468c46bb401eab4937cbe5509a, 23 files.
- Isolated publish checkout built this exact source; all 22 static files matched the tested active build byte-for-byte. 13 Classic files remain identical to the immutable baseline. Stable Classic source checkout remains clean at 5c45ea7.
- Source helper was still absent; reused the documented credential-in-RAM fallback, a non-force push and exact remote HEAD verification. No credentials persisted.
- Verification: 57 unit tests; native-touch GPU, workspace, Pro, onehand (12/13, bottom controls, oriented source+halo export), tiled export/Share retry, cache stress, production smoke and scoped PWA tests pass in Chromium. iPhone native picker, Share-to-Photos and hardware performance remain owner device checks.
- Already-installed version 6 requires explicit update: open the circle/info control, then «Обновить приложение». Subsequent versions label it Update. Do not clear Safari data to update.
- Roll back to saved version 6 below if needed. Root Classic remains available. Existing cached workers may require explicit activation/recovery after hosting rollback; never erase photo storage.

---

# Lighttable pilot — Sites version 6

- Published by explicit owner instruction «давай» following the proposed pilot publication.
- URL: https://multik-photo-room.alexanderhot.chatgpt.site/lighttable/
- Classic: https://multik-photo-room.alexanderhot.chatgpt.site/
- Project: appgprj_6ad0be6c39f48191b3dad11c00502dc4
- Saved version: appgprj_6ad0be6c39f48191b3dad11c00502dc4~appgver_5dcd530c8dcc81918b83354cdb5ec694
- Deployment: appgdep_6ad64917a5e881918c94b62ac782d141
- Source commit: b9c6458d056d78c8c0f57fb86ac6f4c933740eed
- Native result: succeeded, updated_at 2026-10-19T16:45:26.436183+00:00.
- Access: owner-private, unchanged. No GitHub; exact source pushed to the existing Sites repository main branch, fast-forward from 5c45ea7c73361b875e6fbabd0bb64098adbd4dee.
- Deployment archive: /workspace/review/multik-pilot-deploy.tar.gz. Backend stored content hash: sha256:90f43ed5c2eeb0f48660afbfc61ba8013f1a9616426ace8cf8855038fb316ffb, 23 files. Keep unchanged for provenance.

## Reproducible build

npm run build now builds isolated Lighttable, assembles it with deployment/classic-baseline.tar.gz and stages both in dist/. The hosting manifest keeps static.directory=dist. npm run build:classic retains the previous Classic source build command. The immutable tar and its SHA are vendored in deployment/; no external workspace backup is needed to build the published commit.

13 Classic root files were checked byte-for-byte against the saved production tar before publication. PWA/assembly/production checks passed in the prior milestone; this publication changed only build reproducibility, not UI/runtime code. The build succeeded, exact tracked source and deployed output were rechecked before upload.

The Sites skill's source helper was not installed in this execution filesystem; the skill package also became unavailable after reading it. Fallback used an isolated publish clone, the native short-lived Sites credential in hidden stdin/RAM only, Git HTTP extra-header through process memory, no force push, explicit ancestor/remote-HEAD verification, and a tar of .openai/hosting.json + dist from the same source commit. No credentials were written to files/argv or printed. Active Lighttable worktree and stable Classic checkout were preserved.

## Rollback and device check

Classic remains at root. A hosting rollback can redeploy saved version 5 from baseline/BASELINE.json; no destructive Git reset, no DB deletion. Existing /lighttable/ installations may continue their already-cached shell offline after a hosting rollback; no claim that rollback erases or migrates their photos. New data stays in multik-lighttable.

Safari/iPhone 16 Pro, reported iOS «27.01»: installation, real offline launch, owner login after sleep, gesture timings, HEIC/HDR/P3 and Save to Photos still NOT VERIFIED. Browser emulation and native successful deployment do not establish device performance.
