# Interface simplification — 21 October 2026

Owner approved implementation in resumable, separately checked commits. No
image algorithm change. Baseline main e726aff / Sites version 11.

## Milestones

1. [ ] Levels: photo thirds choose black/mid/white at touch-down; drag vertically.
   Keep the chosen point until release. Pinch cancels the unfinished Levels
   gesture and scales the selected source. Synchronized draggable thin ruler:
   horizontal immediately below photo in portrait, vertical far right in
   landscape. Tools in one horizontal row, generous invisible hit targets.
2. [ ] Browse/Edit: remove ↔, explicit Edit starts Move; source thumbnails only
   in Edit, Move/Levels/Looks/Pro. Done returns to browsing. Icon-only export
   visible in both modes. Export commits and completes Edit only after success;
   failed saves retain draft/checkpoint/Undo. No long-press gesture on photo.
3. [ ] Library/import: plus at top, roll cards below, long press Rename.
   Plus immediately invokes system photo picker. Clear import progress distinct
   from selection capacity. English UI, no decorative hero or intro copy.
4. [ ] Final checks, main integration, same-origin owner-private Sites release.

## Resume protocol

Read PROGRESS.md and git status/log before continuing. Each completed milestone
gets its own commit and remote branch push. Leave checked runtime on branch
until integration; do not claim publication until native deployment succeeds.
Preserve new drafts and originals. Prior test-data migration is not required.
Chromium checks do not establish iPhone performance or Photos acceptance.
