# Implementation plan — 28 October 2026

1. Establish PR 3 base, compatibility and file ownership (FILM_FEEDBACK_CONTRACT.md).
2. In parallel, A implements versioned strip geometry/render/export and persistence; B implements free/fixed import, cover resolution and composer.
3. Integrate and repair interfaces, test CPU invariants and existing regression suite, build combined artifact, inspect actual DOM where possible. Investigate reported glitches only with reproducible evidence.
4. Independent C reviews integrated changes for data retention, legacy/favorite parity, geometry and preview/export consistency; correct findings and rerun relevant tests.
5. Update current contracts and HANDOFF with actual evidence, commit and update PR 3 branch without main/live changes. Produce combined dist for separately authorized test Site update. Device, GPU and iOS system picker claims require real verification.
