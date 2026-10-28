# Multik UI review

Development-only entry point importing the real Library and ImportRoll components
and application CSS. Production entry points and build inputs are unchanged.

Run npm ci --include=dev, then npm run dev. Open /review/phone.html for a
402 × 874 CSS-pixel viewport, or /review/ for the full window. In managed Work,
use sites-preview start on the checkout and its returned origin.

This is a separate preview origin with its own browser storage. It does not
access the owner's iPhone photos. Empty Mixes and Library can be inspected without
WebGL. Import uses the actual component. Opening a project deliberately reports
that rendering requires WebGL; no simulated render is presented as real.
No iPhone Safari, safe-area, color, native Photos or GPU validation is implied.

Before future reviews refresh sources from current main and compare changes.
This preview is not a deployed site or an automatic cross-chat browser session.

For a synthetic test collection, open `/review/?fixtures=1` or `phone.html`.
It creates four rolls (6/12/24/36) from generated colored images only when this
preview origin has no rolls. It does not clear or modify an existing collection.
The editor deliberately reports unavailable; test data is not personal photos.

`/review/data-check.html` runs synthetic Repository/Navigation checks against this
preview origin's real IndexedDB. It creates new test records without deleting
existing ones. Its renderer is a stub; it does not test the actual GPU editor.
Use `/review/phone.html?w=375&h=812` (or 402/430 and landscape sizes) to
inspect responsive layout. The preview is local and temporary, not publication.
