# Multik: instructions for developers and AI agents

## Read first

Read `TRANSFER.md`, `docs/lighttable/BASELINE.md`, `PRODUCT_SPEC.md`, `UI_CONTRACT.md`, `KNOWN_ISSUES.md`, `ACCEPTANCE.md` (the latter five in `docs/lighttable/`), then root `ARCHITECTURE.md`. Inspect current Git status and code before editing. User instructions and later explicitly adopted decisions supersede this baseline; update the current contracts when behavior intentionally changes.

This is an existing working application, not a starter to recreate. Do not restart M0 or implement the historical Classic roadmap. The original v8 import checksums describe that import only. GitHub is an authorized development destination; historical platform prohibitions no longer apply. This is not standing authorization to implement ideas. Discussion and review are read-only unless the owner requests changes. An implementation request authorizes necessary edits and checks within its scope without repeated approval for routine choices. Main integration, publication, access changes and destructive operations require explicit authorization, which may be included in the original task.

## Scope and implementation

- Default to the smallest coherent change in existing components. Preserve unrelated user changes. No wholesale rewrite, dependency/framework migration, storage reset or broad refactor as a side effect of a UI request.
- If a larger change is necessary, explain the concrete limitation, affected modules, alternatives and validation before expanding scope. Do not interpret every routine implementation choice as needing permission.
- UI/design-only: work in `src/lighttable/ui/` and scoped styles. Preserve gesture meaning, navigation, persistence boundaries, photo geometry and renderer formulas. If a requested design needs a behavior change, identify it explicitly.
- Algorithm-only: use current PRODUCT_SPEC, ARCHITECTURE and ACCEPTANCE. ALGORITHM_HANDOFF and old UI_REQUESTS entries are historical task records, not universal restrictions. Identify UI dependencies explicitly. A task explicitly covering both algorithm and UI may have one owner implement both. Preview and export must use matching processing.
- Data changes require explicit compatibility/retention reasoning and tests for failure, reload and saved-state isolation. Original assets must not be deleted/reset to simplify a change. No Classic compatibility migration is required, but preserve deployed Classic files.
- During pointer motion/lift: no IndexedDB commits, JPEG encoding or readPixels. Finished gestures accumulate in RAM until the documented navigation/explicit save boundary. Keep dirty drafts on write failure.
- Saved Library states are immutable; new edits use a working draft. Unlike changes membership only. Library browsing must never become film-pair browsing accidentally.
- UI strings English; communicate with the owner in Russian. Use existing SVG icon family and font. Do not promise iPhone smoothness based on Chromium.

## Working method

Use a focused branch for new feature work, e.g. `fix/levels-hit-target` or `design/library-cards`, based on current main (not automatically the old baseline tag). State scope and choose appropriate checks from ACCEPTANCE. Prefer existing tests; add targeted regression coverage for a real bug or behavior change. Do not rewrite obsolete tests' expectations merely to get green without understanding the intended contract.

Where user requests agents, assign disjoint file ownership, share interfaces first and have one owner integrate/check. Multiple agents must not independently deploy or edit the same files without coordination.

Update PRODUCT_SPEC/UI_CONTRACT/ARCHITECTURE if their content changes and add a dated PROGRESS entry with actual validation. Track unresolved defects in KNOWN_ISSUES; separate observed failures from hypotheses and untested device behavior. Report what changed, evidence, and limitations. Screenshots shown to the user belong in chat; repository copies are also useful for handoff.

## Validation and release

Node 22; `npm ci --include=dev`, `npm test`, `npm run build`. Use current browser suites listed in ACCEPTANCE for affected behavior. Many older scripts refer to removed controls; their presence in package.json does not make those controls requirements.

`npm run build` must preserve the 13 Classic files and produce combined `dist/`. GitHub workflow only verifies; no Pages deployment. The live Site remains `/lighttable/` at its existing origin and audience. Source pushes are not Site publication. Read DEPLOYMENT and use the Sites workflow when publication is in scope. Do not expose credentials or commit local tokens, private user photos, generated build output or browser databases.

Baseline tags/releases are immutable historical references. Make new commits/tags for corrections; never move the old tag or force-push shared history. Code rollback and hosting rollback are separate; neither rolls back browser IndexedDB. A documentation-only baseline does not require republishing the unchanged application.

## Discussion, context and freshness

Existing contracts can be challenged in discussion; an idea is not an adopted requirement. Expert roles in one chat are perspectives, not independent agents or independent review. Prefer one owner per coherent task. Where agents are requested, hand off the goal, base branch/commit, relevant sources, permitted changes and acceptance criteria; one owner integrates and verifies. Do not promise unstarted background work or automatic synchronization between chats, GitHub, project attachments and the live Site. PROJECT_BRIEF is a dated map, not an automatically updated source. Refresh affected contracts with behavior changes and the brief after substantial changes; ordinary brainstorming does not require reading every document or writing logs.
