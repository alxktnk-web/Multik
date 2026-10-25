> **Исторический журнал проверок.** PASS относится только к указанным здесь версиям. Свежая матрица базы 25.10.2026 — [BASELINE](BASELINE.md), актуальные команды — [ACCEPTANCE](ACCEPTANCE.md).

# Локальная проверка M0–M6

## 23.10.2026 — адаптивный редактор / Mixes / Library

- Node 22: 75 unit tests, TypeScript, production build — PASS; 13 Classic files
  byte-identical. Manrope bundled and included in scoped worker precache.
- New real IndexedDB favorites suite — PASS: concurrent likes deduplicate,
  independent revisions/source references, original mix edits isolated, CAS,
  abort/retry, unlike/rejoin, stale thumbnail guard, reload. Favorite conflict
  copies become visible ordinary Mixes rather than orphaned Library projects.
- New import wizard suite — PASS: 12 reset, capacity segments, Next native picker
  activation, no DB before Create mix, first-roll retention on cancelled picker,
  completed-roll retry reuse, callback failure/retry, original preservation.
- New adaptive integration suite — PASS: real 640px mixed covers, heart, independent
  editor/reopen, pinned favorite pair, zero storage/readback/JPEG/uploads during
  Levels and X/Y/scale input; failed finish retains Undo/draft; four orientations
  with Move/Levels: visible save, 44px targets, no stage overlap or overflow.
- Existing editor, gestures, workspace, onehand, full browser renderer regression,
  production smoke and PWA offline/update/recovery suites — PASS. Existing tests
  now follow capacity buttons, home details and check/Undo semantics. Rotation
  harness notifies Session before touch so adaptive resize settles first.
- Full JPEG suite — PASS: tiled/monolithic parity, snapshot isolation,
  4000px output, 12MP synthetic originals, cancellation, 20-export texture
  plateau, Share retry, quota-resistant ready JPEG and context-loss recovery.
- Home settings/update closes home before opening settings: update remains usable
  while import/editor guards still prevent unsafe activation.

Screenshots: [review set](ui-previews/adaptive-2026-10-23/README.md).
Chromium is not iPhone validation. Native Photos sharing, safe-area ergonomics,
thermal behavior, frame pacing and native picker menus remain device checks.


## 21.10.2026 — упрощение интерфейса по этапам

- 75 unit tests: дополнены реальный выбор трети композиции при разных viewport
  и всех 90° rotations, фиксация точки при пересечении зон, Undo/source isolation,
  отмена незавершённых Levels при переходе к pinch.
- Node 22 production build / TypeScript: PASS; 13 Classic files byte-identical.
- Editor browser suite: rulers, zero hot-path writes/readback/encode/upload/
  compile/allocations, Undo/Cancel/Done/retry/pairs, default Move, icon-only export
  in Edit, export commit failure/retry, portrait/landscape — PASS.
- Native gesture suite: Browse → Edit/Move → selected-layer pinch → Done,
  no writes on lift, commit retry and reload — PASS.
- Workspace suite: native picker activation, 7/6 overflow and forged change,
  real import progress with delayed storage, bad image replacement, long press
  Rename and failure/retry, unchanged roll metadata apart from name, saved mixes
  (including conflict copies), latest-pair resume and picker cancellation — PASS.
  Existing navigation/CAS/copy/rails checks remain passing.
- Onehand suite: 12/13 selection, dock visibility at both scroll ends in
  375×667 / 402×874 / 874×402, auto name, original bytes, portrait/landscape
  placement and JPEG, manual per-pair rotation — PASS.
- Production smoke and PWA offline/update guards/recovery/auth/MIME — PASS.
- Full browser renderer/UI regression: zero gesture I/O, all rotation axes,
  halo, stale decode, bounded GPU resources, context recovery/disposal and
  visible controls >=44 px at four viewport sizes — PASS.
- Screenshots of editor, library and import progress visually reviewed.

Renderer and Lightness math are byte-identical to version 11. Chromium checks
do not establish actual iPhone finger accuracy, native picker options, heat,
frame pacing, Safari keyboard layout or real Photos sharing.

## 21.10.2026 — Lightness-only Levels

- `npm test` / `npm run build` (Node 22): 73 tests PASS, TypeScript/Vite PASS;
  13 Classic files byte-identical. Runtime change limited to `render/levels.ts`.
- `npm run test:lighttable:levels`: independent CPU Lab measurements against
  GPU output; 40 colored probes, 8 preserve a*/b*, 16 gamut-compress at fixed
  L*/hue, 16 black/white endpoints. L* error <0.6, chromatic error <1.5 Lab
  units for 8-bit output. Midpoint L*=50 (~119 sRGB), independent source
  thresholds, neutral Clear addition and hidden-effect bypass PASS.
- `npm run test:lighttable:editor`: actual ruler input, zero hot-path I/O /
  uploads / compilation / GPU allocation, Undo/Cancel, commit failure/retry,
  pair isolation and portrait/landscape PASS.
- `LIGHTTABLE_TEST_PROFILE=5 npm run test:lighttable:export`: non-neutral
  Levels for both sources, preview/JPEG comparison, tiled/monolithic output,
  4000 px, 12MP inputs, snapshot isolation, 20-export plateau, cancel/context
  loss and Share retry PASS.
- `node scripts/lighttable-film-check.mjs`: frozen profile 2 unchanged,
  profile-3 CPU oracle/halo/export/roundtrip PASS with neutral Levels.
- `node scripts/lighttable-build-check.mjs`: production GPU/UI smoke PASS.

Evidence: `lab-out/lighttable/editor/gpu.json`, editor checks, export and film
harness outputs. Chromium SwiftShader verifies correctness, not iPhone frame
rate, Safari color handling or the real Photos share sheet. Lab conversions
and bounded out-of-gamut chroma search still need hardware timing acceptance.

## Обновление 20.10.2026 — свайп, размер слоя, тон

Опубликовано как Sites version 8 / d22a3ca, native status succeeded.

- При открытии рабочей поверхности один палец листает пары: обе плёнки сдвигаются на один слот циклически. Вертикальный жест не листает. Нажатие на миниатюру слоя в dock включает свободный x/y-сдвиг выбранного слоя; повторное нажатие либо ↔ возвращает просмотр. Скорость жеста не переключает режим. Pro включает редактирование, закрытие Pro возвращает просмотр.
- Щипок изменяет только выбранный слой (0.5–4×), с неподвижным начальным центром жеста. Viewport не увеличивается. Появление второго пальца отменяет только текущий незаконченный drag; после первого lift оставшийся палец ждёт нового жеста. Полный pinch — один Undo в RAM. Pointerup не пишет в DB; swipe/rail navigation фиксирует параметры пары.
- Масштаб хранится в optional transform.scale (отсутствие = 1). Preview и tiled JPEG используют одну source-to-film матрицу; halo остаётся привязан к исходнику. Остальные пары не меняются.
- Стрелка сверху открывает библиотеку Lighttable, а не Classic root. Ошибка запуска ведёт в scoped recovery. Старая закладка/иконка на `/` всё ещё открывает сохранённую Classic: актуальный адрес — `/lighttable/`.
- Смешивание по-прежнему складывает линейный свет двух изображений, не opacity. Profile version 2 сохраняет низкие/средние уровни, сжимает только highlights, плавно переводит пересвеченные области в белый, возвращает умеренную S-кривую (.35). Это устраняет глобальное приглушение прежнего Reinhard. Halo настраивается как прежде, остальные декоративные засветки выключены.
- Читаемые profile-1 композиции нормализуются в RAM к profile 2 без массовой записи в DB; следующая обычная commit сохраняет version 2. Thumbnail принимается только при совпадении пары, revision и profileVersion. Оригиналы/DB schema не менялись. **Откат приложения к version 7 не гарантирует чтение новых profile-2 композиций**; для исправлений предпочтителен forward fix. Оригинальные фото при откате не удаляются.
- Попутно исправлена нормализация revision-0 conflict-copy: сохранённые в копии сдвиг/поворот/масштаб не сбрасываются при повторном выборе пары.
- Проверки: 62 unit tests; native-touch gesture suite; GPU/browser, workspace (включая revisit conflict-copy), Pro, tiled export с scale=1.7. Production build/smoke и scoped PWA suites прошли: offline, explicit update, scoped recovery и redirects/MIME safety; 13 Classic files byte-identical. iPhone 16 Pro / «27.01» и субъективная оценка реальных фотографий остаются проверками владельца.


19.10.2026. Linux, Node 24.19, Chromium `/usr/bin/chromium`, SwiftShader. Браузеры — изолированные временные профили и synthetic fixtures, без фотографий владельца.

## Команды

- `npm test`: 45 tests, exit 0.
- `npm run build`: exit 0, Classic не включает v2 entry.
- `node scripts/browser-check.mjs`: exit 0, прежние сценарии импорта, независимых frame drafts, undo/pinch/menu, одного commit на переход, поворотов/экспорта, раскладок и offline.
- `node scripts/pwa-check.mjs`: exit 0, redirect normalization, auth cache poisoning protection, recovery без удаления фото/prefs.
- `npm run test:lighttable:browser`: новый самостоятельный suite. Можно использовать уже запущенный сервер через `LIGHTTABLE_URL=http://127.0.0.1:5174`.
- `npm run test:lighttable:build`: изолированная production-сборка и smoke через HTTP без dev server.
- Сравнение каждого `dist/*` с `baseline/production.tar.gz`: все 13 файлов byte-identical. Baseline production archive не изменён.

Первый запуск browser baseline в sandbox получил `listen EPERM`; повтор с разрешённым network capability прошёл. Это инфраструктурная ошибка, не скрытый PASS первого запуска.

## Evidence

В рабочем checkout, `lab-out/lighttable/` (generated, ignored):
- `browser-evidence.json` — значения счётчиков и проб shader pixels;
- `portrait.png`, `portrait-rotated.png`, `landscape.png` — просмотренные screenshots;
- `production-smoke.png` — bundled app.

В browser suite после прогрева движение/lift дают **0** readPixels, encode, putImageData, texImage2D, shader compilation, IDB opens. Это перехват настоящих API, не только наши собственные counters.

Контрольный halo outside-object: strength 0 → RGB [0,0,0], strength 1 → [95,18,4], после переноса источника → [91,17,4]; tolerance по положению/дискретизации заранее 6 byte levels. Два gray источника дают одинаковый [178,178,178] с halo 0/1. Пробные `readPixels` используются только внутри теста, после hot-path проверки.

Проверка контекста использует `WEBGL_lose_context`: после восстановления source pair и RAM composition сохраняются. 100 invalidate внутри одного кадра дают один draw. После dispose tracked GPU textures/bytes = 0.

На двух 960×720 synthetic inputs текущая пара занимает 7,635,144 bytes tracked GPU textures; подготовка новой пары достигала 17,375,832 bytes. Эти значения **не включают весь процесс браузера**; не переносить их на 48MP original decode как утверждение о памяти.

## Не проверено

- Safari и установленная iPhone PWA, реальные 60/120Hz timings, GPU duration, температура/энергосбережение.
- HEIC/HDR/P3 и EXIF photo matrix на устройстве.
- Legacy parity M7, full-size/tiled export M8, dual SW/auth/rollback M9 и смена основного адреса M10. M3–M6 см. актуальные дополнения ниже.
- Нет измерения input-to-photons. `inputToRafMs` — proxy по invalidation→выдаче draw, включая подготовку/resize, а не hardware latency. `drawCpuMs` не измеряет завершение GPU.

## Дополнение M3–M4 (актуальнее ранних M2 ограничений)

Выполнено 19.10.2026, те же isolated Chromium/SwiftShader профили.

- `npm test`: 50 tests, exit 0.
- `npm run test:lighttable:data`: native IndexedDB, transactional abort/retry, CAS конфликт двух экземпляров Repository, immutable original bytes, hidden partial import и cleanup, interrupted/resumed adoption, zero legacy readwrite transactions, фото доступны после fixture удаления originals из Classic.
- `npm run test:lighttable:workspace`: реальный file picker с 7→6 overflow, программный change сверх лимита, broken-file correction, две плёнки/пары, 0 writes на lift, одна revision на navigation, reload, tx failure/retry, concurrent navigation lock, conflict-copy, rails collapse/orientation.
- `npm run test:lighttable:cache`: 100 pair changes, warm return uploads 0, settled 20,992,500 tracked GPU texture bytes, peak 27,296,544, disposal 0. Тестовые originals 1024×768, не 48MP и не реальный iPhone.
- `npm run test:lighttable:browser`: прежние GPU/gesture probes прошли после интеграции данных. Старый двухфайловый временный picker заменён durable roll picker; его сценарии теперь в workspace suite.
- `npm run test:lighttable:build`: bundled staging работает; dev global отсутствует, SW отсутствует, создаётся только `multik-lighttable` DB, не `multik-app`.

Новые screenshots: `rolls-portrait.png`, `rolls-landscape.png`; memory evidence: `cache-evidence.json`. Это технические synthetic fixtures, не фото пользователя.

M3/M4 больше НЕ относятся целиком к «не проверено» выше. Не реализованы derivative/result thumbnail jobs, длинные legacy DOM virtualization, M7–M10. Новая публичная версия не выкладывалась. iPhone 16 Pro, iOS указана как «27.01»; аппаратных измерений пока нет.

## Дополнение M5–M6

19.10.2026, локально. Фактическая сборка `dist-lighttable/`, без публикации.

- `npm test`: 55 tests, exit 0. Добавлены XY accumulation/Undo, pinch rollback, каждый one-axis/no-op X, clamp recovery, log radius, 4 px deadzone, additive schema-1 normalization и corrupt fields.
- `npm run build:lighttable` и `node scripts/lighttable-build-check.mjs`: exit 0. Production UI, изолированные assets, нет dev hook/SW/legacy DB creation.
- `npm run test:lighttable:pro`: exit 0. Native Chromium touch, явные one-axis/XY, tool lock во время touch, native ranges/keyboard, закрытие Pro при rotate, frame-local persisted effects и reload. Слой не меняется от параметрического жеста. 100 invalidation в одном task → два mask rebuild (по одному source), 0 uploads, 0 дополнительных texture bytes.
- GPU pixel probe: .2 mm halo на удалении от объекта → [0,0,0]; radius 1.6 mm → [78,14,3]; threshold .95 → [0,0,0]. Readback только в test probe, не в runtime.
- Browser regression evidence обновлено: GPU pixels, all rotation/zoom gestures, source races, context loss, controls/layout, zero hot-path readback/encode/upload/compile/IDB. Ожидания active textures изменены с 4 на 8: mask/temp теперь удерживаются для rebuild без allocation.
- `npm run test:lighttable:data`: exit 0, сохранены CAS/abort/retry/immutable bytes/zero legacy writes.
- Workspace suite после изменений home/Pro: exit 0, сохранены exact capacity, zero composition writes на lifts, navigation commits, independent pairs, conflict-copy, portrait/landscape rails.
- Cache evidence после M5: 100 pair changes, warm return 0 uploads, settled 21,609,828 tracked bytes, peak 28,813,104, dispose 0. Часть бюджета теперь занята scratch textures, поэтому в 24 MiB помещается меньше sources; источник не переподготавливается на каждом pointermove.

Просмотрены snapshots `home-empty.png`, `home-library.png`, `home-landscape.png`, `pro-portrait.png`, `pro-landscape.png` (synthetic demo, не фото владельца). Дополнены import-full/overflow/error snapshots. Hero показывает исходные карточки пары, не derivative результата. Owner feedback и device review M6 ещё впереди.

Аппаратная плавность, Safari/PWA, HEIC/HDR/P3/EXIF и 48MP imports остаются непроверенными. Все timings/memory выше относятся к Chromium SwiftShader и не являются измерениями iPhone 16 Pro / «27.01». Classic checkout остался чистым; публикация не выполнялась.

Один повторный запуск Pro suite был отклонён automatic approval review из-за лимита использования (review failure, не оценка небезопасности). После команды владельца продолжить следующий запуск состоялся и завершился успешно; блокировок на конец этапа нет.

## M8 и отмена M7 — 19.10.2026

Владелец исключил совместимость со старыми плёнками/проявками. M7 отменён; historical legacy checks не являются условиями выпуска. Новый UI больше не предлагает импорт из Classic. Старый checkout/DB не менялись.

- `npm test`: 55 tests, exit 0; `npm run build:lighttable`: exit 0.
- `npm run test:lighttable:export`: native browser/WebGL + original blobs. JPEG 2000×1500/4000×3000 (в проверке metadata turn=1 → 1500×2000/3000×4000). Без тихого уменьшения размера.
- Monolithic 2000 px против tile 257 px: JPEG mean absolute RGB error .0007581/255, max 4 в единичных точках; проверены геометрия, источник-ореол и поворот без tile seams. Тот же tile path до/после изменения foreground exposure даёт snapshotDiff 0; revision результата остаётся исходной, RAM правки пользователя сохранены.
- Отмена после tile, unsupported size, context loss/recovery: временные ресурсы освобождены, draft сохраняется, foreground восстановлен. 20 экспортов подряд возвращают tracked allocations к одному plateau 13,644,696 bytes. Два synthetic original 4000×3000 успешно отрендерены в 3000×4000; общий peak tracked GPU 121,954,096 bytes в этом сценарии. Это не RSS/тепло/latency iPhone.
- UI: подготовленный файл доступен после отказа Share; повторный явный tap повторяет вызов. Download URL остаётся. Thumbnail quota failure оставляет готовый JPEG; устаревшая thumbnail после изменения revision не показывается как текущая.
- Системный Share в Chromium заменён stub с первым NotAllowedError: это тест логики повторного вызова, **не** проверка реального меню iPhone/Save to Photos.
- GPU/gesture regression и Pro suite прошли после выделения общего present pass для preview/export; hot path по-прежнему без readback/encode/upload/compile/IDB. Production staging smoke и workspace checks выполнены отдельно.
- Просмотрены `export-ready.png` и `home-result.png`; все изображения — synthetic fixtures. `export-evidence.json` содержит числовые probes.

Не проверено на устройстве: 48MP/HEIC/HDR/P3 original decode, пик всей памяти Safari, фактическое сохранение в Photos, нагрев и performance при background/resume. PWA scopes/worker/offline/publish — следующий M9. Новой публикации нет.

## M9 local PWA / dual artifact

- `npm test`: 55 tests, exit 0. Production build/TypeScript прошли. `node scripts/lighttable-build-check.mjs`: scoped worker установлен, dev hook отсутствует, только v2 DB создана.
- `node scripts/lighttable-assemble.mjs`: 13 baseline root files byte-identical, включая Classic manifest/SW/recover/assets. Root precache generator не запускался поверх v2. Evidence: assembly-evidence.json.
- `node scripts/lighttable-pwa-check.mjs`: production dual artifact через HTTP localhost + Chromium. Первая навигация Classic→Lighttable под root worker, canonical /index.html redirects, v2 standalone manifest/scope и cache без redirected flags; native roll import, commits, offline reload Classic и Lighttable, фото и metadata доступны.
- Waiting update не делает reload/commit dirty scene автоматически. Применение заблокировано во время touch, библиотеки/импорта и export dialog. Явный update после нового drag делает одну metadata revision и reload; Classic cache не меняется.
- v2 recovery переустанавливает только свой worker/cache; root/sibling caches и оба scope остаются, localStorage sentinel и native roll/composition сохраняются. Root recovery также не разрушает v2 offline запуск.
- Expired-auth redirect при cache miss приводит в /login без login cache entry. Fresh install при redirect на login и при text/html вместо JS заканчивается redundant worker с нулём частичных v2 cache entries.
- PWA и assembly evidence в lab-out/lighttable/. Никаких пользовательских фото/данных не использовали.

Не проверено: реальная установка/standalone Safari на iPhone, owner-private sign-in на живом hostname, Safari background eviction, системное меню Share/Photos, deployment/hosting rollback. Новая версия не публиковалась. Для публикации нужен combined artifact, не только isolated staging.

## Pilot publication

Sites save_version_and_deploy_private returned succeeded for version 6 / source b9c6458. Saved version source provenance was read back and matched. Access stayed owner-private. No extra status poll after terminal success. Source helper was unavailable; exact-state fallback and credential handling are recorded in DEPLOYMENT.md. Build reproducibility was added with the immutable Classic tar in source. Native device checks remain pending.


## Post-pilot one-hand interface / film orientation (19.10.2026)

57 unit tests and production combined build pass. Workspace, Pro, export, production build smoke and PWA suites rerun against the updated UI. `npm run test:lighttable:onehand` adds 12/13 overflow/full, auto naming, visible and hit-testable bottom confirmation at both scroll extremes on 375×667, 402×874 and 874×402; normalized portrait/landscape equal geometry and source halo, JPEG mean absolute pixel difference 0.0036823/255 (max 5), original bytes unchanged; manual layer rotation remains per pair and navigation-committed. Evidence: lab-out/lighttable/onehand-evidence.json and onehand-full/workspace.png. Export now auto-prepares when explicitly opened; fresh Share retry and optional thumbnail storage failure tests pass.

Native iOS picker limit/Done position is outside HTML file-input control. Actual iPhone Photos share and timing remain NOT VERIFIED. No claims of native picker hard limit, silent Camera Roll write, or guaranteed 60 fps.

GPU/native-touch browser suite and 100-pair cache stress also pass after the UI/placement changes: zero readback/encode/upload/compile/IDB during movement/lift; warm return uploads=0; settled tracked texture bytes 21,609,828, peak 28,813,104, dispose=0. Recovery-page changes after the PWA suite are English copy and bottom-positioned controls only; worker/data logic unchanged.


## 21.10.2026 — интеграция профилей в Pro

Node 22.23.3 / npm 10.9.9, Chromium SwiftShader. Это не hardware acceptance.

- `npm test`: 66/66. `npm run build`: TypeScript и production сборка, 13 Classic baseline files byte-identical.
- `node scripts/lighttable-film-check.mjs` и `LIGHTTABLE_TEST_PROFILE=4 node scripts/lighttable-film-check.mjs`: frozen profile 2, CPU oracle, halo, hot path, durable roundtrip, originals/context recovery и JPEG — PASS.
- `node scripts/lighttable-density-check.mjs`: frozen profile 3, mixed-source oracle и comparisons — PASS.
- `node scripts/lighttable-profile-ui-check.mjs`: новый пользовательский выбор, Cancel/Escape/Apply/Undo/no-op, сохранение прошлой dirty-правки, zero-I/O preview, блокировки, ошибка commit/retry, независимые pairs/reload, JPEG profile invalidation (включая equal-revision snapshot), stale thumbnails, portrait/landscape и context loss — PASS. Evidence/screenshots: `lab-out/lighttable/profile-ui/`.
- `npm run test:lighttable:browser`, `test:lighttable:gestures`, `test:lighttable:pro`, `test:lighttable:workspace` — PASS.
- `LIGHTTABLE_TEST_PROFILE=4 npm run test:lighttable:export`: profile 4, mono/tiled, 4000 px, 12MP synthetic originals, 20-export plateau, cancel/context loss, snapshot, Share retry/download и thumbnail quota — PASS. Script default остаётся 2; можно отдельно задавать 3/4. Evidence: `lab-out/lighttable/export-evidence.json`.
- `node scripts/lighttable-build-check.mjs`: production без dev hooks, явный выбор Dense через UI — PASS.
- `npm run test:lighttable:pwa`: dual offline, update guards, recovery, redirects/MIME — PASS.
- JPEG/SwiftShader результаты не доказывают Safari/P3/HDR/HEIC, реальный Share в Photos или аппаратную плавность. Эти проверки на iPhone 16 Pro остаются открытыми.


## 21.10.2026 — Levels editor and Clear

Node 22.23.3 / npm 10.9.9 for unit/build/production smoke/PWA; local Chromium
SwiftShader browser checks. No iPhone hardware claim.

- `npm test`: 73 PASS, including midpoint math/order, invalid input, edit
  checkpoint/history, retry state, per-layer state and Clear persistence.
- `npm run build`: TypeScript/Vite + dual artifact, 13 Classic files identical.
- `npm run test:lighttable:editor`: real ruler pointer input, zero IDB/readback/
  encode/upload/compile/new GPU bytes during input, independent I/II, Undo,
  full Cancel, failed Done/retry, one commit, reload and independent pairs;
  375×667, 402×874 and 874×402, rotation preserves completed edits.
- `npm run test:lighttable:levels`: independent linear-light CPU oracle for
  Clear, highlight clipping, black/mid/white probes, source isolation and
  bypass of saved halo/exposure/contrast/balance/gain effects.
- `LIGHTTABLE_TEST_PROFILE=5 npm run test:lighttable:export`: non-neutral
  Levels on both sources; monolithic/tiled JPEG, 2000/4000 px, 12MP inputs,
  snapshot isolation while live Levels change, 20-job memory plateau,
  cancellation/context loss, fresh Share retry/download and thumbnail failure.
- `npm run test:lighttable:gestures` and `test:lighttable:workspace`: native
  touch browse/move/pinch, lift has no writes, serialized navigation/retry/CAS,
  native import overflow, rail scroll/selection and orientations PASS.
- `node scripts/lighttable-film-check.mjs`: profile-3 oracle, existing profile-2
  identity, halo, durable roundtrip, export/context recovery PASS.
- `node scripts/lighttable-build-check.mjs`: actual production Clear/Levels
  controls, no dev hook, scoped worker PASS.
- `npm run test:lighttable:pwa`: offline/update/recovery/auth/MIME PASS;
  editor checkpoint now blocks applying a waiting update, even if not dirty.

Old Pro/profile-modal script entry points now run the new editor contract;
removed global-tone controls and nested Apply modal are not expected by tests.
Evidence: `lab-out/lighttable/editor/`, `export-evidence.json`, workspace/PWA
and film harness outputs. Screenshots were visually reviewed. Owner device
checks remain: finger accuracy, Safari colour/HDR/P3, real Photos share, heat
and gesture latency; Chromium does not establish these.
