# Adaptive workspace — 23 October 2026

Authorized by owner after numbered mockups. This supersedes the v12 layout rules
(one horizontal landscape toolbar, roll-first home, visible Cancel/Done).
Base: main 4fa5601; branch feat/adaptive-workspace;
rollback reference backup/main-before-adaptive-2026-10-23.

## Architecture and checkpoints

1. Shared appearance: bundled Manrope OFL font, consistent local SVG icons,
   visually compact controls with at least 44px targets.
2. Workspace: four phone/composition orientation combinations; landscape tools
   in side areas, no bottom bar; portrait photo width maximized. First visual
   review checkpoint before release; real iPhone geometry remains unverified.
3. Shared editor: source-specific Move X/Y/scale, lightness Levels ruler,
   Looks/Pro, Undo, icon-only finish/export/heart. Finish saves; no whole-session
   Cancel in the normal flow. No change to shader formulas or gesture hot path.
4. Mixes home: rendered composition covers; rolls secondary; + Mix and + Roll.
   Import default 12 each new flow; segmented 06/12/24/36. Mix Next opens the
   second native picker synchronously, then both rolls import on Create mix.
   iOS owns native camera/Photos/Files menu; no guarantee it can be suppressed.
5. Library: independent editable favorite snapshots referencing original assets.
   Same editor, fixed source pair. Unlike removes membership, never originals.
6. Integration: unit/build and targeted browser/IDB/regression checks, screenshots,
   then owner iPhone review. Sites stays on its existing origin; no Pages deploy.

## Agent ownership

Root: integration/workspace, covers, fonts, docs and final review.
Layout: editor.ts + adaptive.css. Import: import-roll.ts + import.css.
Home: library.ts + home.css. Data: repository/types + favorites checks.
Separate files, shared contracts; no duplicate agent implementations.

## Resume

Check git status and latest PROGRESS before editing. Agents may have left changes
without commits if their quota ended. Never treat a successful agent report as
proof of integration: run combined TypeScript/build and UI checks after merging.
Generated illustrations are references, not exact layouts or actual render output.
