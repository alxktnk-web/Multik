# Levels — interaction study, 21.10.2026

`levels-review.html` is a standalone, responsive UI prototype; open it in a
browser. It has no storage, network calls, service worker, or production imports.
Screenshots show 402×874 portrait and 874×402 landscape.

Select source I/II, select or drag Black/Mid/White, use arrow keys on handles,
Undo, and switch Looks. Each source has independent mock values. Done only
displays a review notice; Cancel resets mock values. This is not the proposed
production save/discard transaction.

The picture is static and illustrative. Its CSS screen combination is NOT the
Multik renderer, a Levels implementation, or evidence of output quality.
Values 0–100 are handle positions, not finalized algorithm units. No actual
user photo is included. The source assets are existing public-domain NASA
astronaut and SpaceX rocket fixtures; provenance is in
`../../../scripts/fixtures/film-photos/README.md` (repository-root-relative
location: `scripts/fixtures/film-photos/README.md`).

Icons are Lucide 0.468.0, retrieved from that tag's `icons/` directory;
license and derived Feather notices are in `LUCIDE-LICENSE.txt`.

Local review checked both orientations, layer selection, keyboard adjustment,
and mock state isolation. It does not establish real iPhone touch reliability
or performance. See `../PHOTOS_UI_PLAN.md` for the proposed actual behavior.

Owner review refinement: removed visible point labels, legend selectors and
explanatory text. The ruler itself is the control; accessible point names
remain. Landscape panel is 112 px wide; portrait no longer reserves legend rows.
