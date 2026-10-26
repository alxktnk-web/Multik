# 26.10.2026 — уточнение рабочей среды проекта

По поручению владельца после ревизии уточнены границы обсуждения, реализации, интеграции и публикации в AGENTS; старые ALGORITHM_HANDOFF/UI_REQUESTS обозначены историческими; цель 44px в ARCHITECTURE согласована с известным K06. Уточнены передача задач агентам и актуальность брифа. Только документация: runtime, данные, Sites и baseline tag не менялись. Проверка: сравнение исходного и итогового текста и чтение сохранённых файлов; runtime-тесты для этой правки не требуются.

## 2026-10-25 — documentation baseline and independent review

- Runtime remains c771eb8 (live publication recorded at46b5ccb); no application, test, workflow, build or storage changes in this baseline task.
- Replaced historical root README/ARCHITECTURE/TRANSFER with current entry points. Added AGENTS, PRODUCT_SPEC, BASELINE, KNOWN_ISSUES; consolidated UI_CONTRACT/ACCEPTANCE. Preserved exact old documents in docs/history; marked remaining roadmap/validation pages historical. Corrected DEPLOYMENT's stale current heading.
- Captured real synthetic-fixture screenshots for portrait, Mixes View/Levels/Looks, Library View/Levels and clean view. No user photos included.
- Fresh Node22 validation: 109 unit tests, production build (13 Classic files identical), orientation, viewer capture, levels-landscape, favorites, import, GPU L*, export profile2 all PASS. Full PWA harness has old gesture setup and is explicitly not claimed current; real iPhone acceptance stays open.
- Independent read-only review reproduced P2: persisted Library working drafts have no UI reopening route once navigating away. Recorded in BASELINE_CODE_REVIEW/KNOWN_ISSUES; no silent runtime fix or data reset. User baseline means a supported starting point with future bugfixes, not a defect-free freeze.
- Immutable baseline tag/release: baseline-2026-10-25. Documentation-only, no Sites redeployment.

## 2026-10-25 — distinct Library navigation and clean preview

- Added direct Library collection icon alongside Mixes film icon. Saved variant swipes remain in Library instead of jumping into source film pairs. Persisted anchor handles working drafts/reload, removed items, empty and single-item collections.
- Library View hides film strips; editing shows only the two fixed source selectors. Ordinary Mixes retains full strips. No canvas geometry changes when toggling tools or hiding controls.
- Short View tap hides/restores interface in portrait and landscape; swipes still browse. Motion, long presses, pinches, cancellation and editing tools suppress taps.
- 109 unit tests, production build, orientation geometry suite and new real-browser viewer workflow passed. Favorite/Undo and landscape Levels regression suites also passed. Published successfully via Sites at 2026-10-25 15:20 UTC: public source `c771eb8`, private source `ceadb615c02fef5ecc044a63363545b7bc564e57`, deployment `appgdep_6ade1e444ca08191b6549ea778f2c25e`. Device gesture feel is not inferred from Chromium.

## 2026-10-24 — stable canvas, rotation and immutable Library variants

- Fixed mode-dependent right column widths (0 / 44 / 96px), which resized the canvas on tool switches. All landscape tools now reserve 44px; stage gets a fixed 12px margin. Rotation added to the single left column with compact controls on short screens.
- Pinch transforms only in Move; Levels stays fixed. GPU checks confirm CIELAB L* rather than RGB Levels (40 colored probes). Landscape regression covers all three handles, independent sources, zero IDB/readPixels/encoding through finger lift, tool changes, pair navigation and reload.
- Hearts save distinct full editable states with shared originals. Saved Library variants are immutable; editing creates a working copy at the next persistence boundary. Unlike removes membership only and offers Removed · Undo for 8 seconds in both Library and workspace.
- 92 unit tests, production build, orientation geometry checks and landscape Levels regression passed. Classic remains byte-identical. Real IndexedDB and full workspace variant workflow checks also passed, including immutable originals, Levels-only working draft reload, new variant, unlike and Undo. Published successfully 2026-10-24 20:26 UTC through Sites: public source `707047b`, private source `2a0bb28ea41536056d9d4afcf0d24006812b8cbb`, deployment `appgdep_6add1458959c8191b3ac49060f98a1ef`. Real iPhone confirmation remains with owner.

## 2026-10-24 — Explicit View / Move and full Library film strips

Published successfully 20:04 UTC through Sites; public source `72a1b0c`, private source `2b132f2a140d52c4b30785604a794411eb914602`, deployment `appgdep_6add0f45c3cc81918cb57b1a77aebcd8`. 83 unit tests, orientation browser suite and production build passed. Classic remains byte-identical.

- Replaced visible Undo with View; added explicit Move. View prevents drag/pinch edits and saves at the existing boundary, preserving drafts on failure.
- Levels/Halo remain selected across source/layer selection; no repeated-tap switch to Move.
- Full source strips in Library; choosing other frames returns to the original mix after committing favorite edits, without changing its fixed source pair.
- Orientation browser suite passed (single column, 44px controls, full-length tracks, Levels persistence and View pinch lock). Navigation tests cover favorite source safety and pair swipes. Device confirmation remains pending.

## 2026-10-24 — Film navigation hit target

- Landscape: cleared the topbar’s inherited grid area so its absolute left offset is relative to the workspace, not an already safe-area-inset grid cell. Film navigation now aligns with the left tool column instead of overlapping the first source frame on iPhone.
- No changes to image processing, gestures or persistence. Orientation browser suite and production build passed. Published successfully through Sites at 2026-10-24 19:11 UTC; deployment `appgdep_6add02b6a8c08191823a9e06854cfb8f`, source `c57edb918c40a2ed4013110d57bbf7d24551e573`. Real iPhone confirmation remains with owner.

# Multik Lighttable — состояние реализации

## 24.10.2026 — одна колонка опубликована

После явного «Да опубликуй» оба локальных этапа отправлены в GitHub main и
опубликованы на прежнем Sites-адресе. Native status succeeded, 14:35:07 UTC.
Предыдущий approval block разрешён подтверждением владельца. Точный runtime
014b23e; публикация и provenance записаны в DEPLOYMENT.md.


## 24.10.2026 — реализован утверждённый макет одной колонки (локально)

Слева одна колонка: Home, Undo, Levels, Halo, Like, Save, Looks внизу.
Дублирующие миниатюры, Move, галочка и отдельные шкалы перемещения скрыты/убраны
из UI. Кадр ленты выбирает слой и возвращает перемещение; активные Levels/Halo
повторным нажатием возвращают Move. Looks — единственное раскрываемое меню;
выбор профиля закрывает его. Полные ленты доступны в landscape; у Library favorite
в каждой ленте один исходный кадр, оба слоя доступны для выбора без смены пары.

PASS: 75 unit tests, TypeScript/production build, новый orientation browser check:
874×402 и 667×375, единая колонка 7 кнопок, >=44px targets, длинные шкалы,
Levels только выбранного слоя, toggle/Looks, favorite, сохранение и ошибка записи.
Проверку выполнил один агент; основные правки сделаны без переработки рендера/БД.
Скриншоты в lab-out/lighttable/orientation, показываются в чате.
Реальная iPhone-проверка остаётся открытой. Публикации нет: ранее auto-review
отклонил push main, потребовав отдельного подтверждения публикации. В этом этапе
отправка/деплой не повторялись; ожидается явное разрешение владельца.


## 24.10.2026 — ориентация выбирает просмотр/редактор

Portrait — только просмотр, листание пар, поворот композиции, Like и Save.
Landscape автоматически открывает редактор: Move, Levels, Halo и отдельно Looks.
Вложенный Pro, radius/threshold/Halo XY убраны из UI; модель и рендер сохранены.
Halo регулирует силу; Clear по-прежнему без декоративных эффектов.
Две ленты снова доступны в редакторе, можно скрыть; выбор кадра сохраняет инструмент.
Смена слоя повторно связывает инструмент с выбранной фотографией.
Переход в portrait завершает RAM-жест и сохраняет через navigation boundary;
ошибка оставляет dirty draft и Undo в памяти, portrait остаётся просмотром.
Portrait pinch и клавиши масштаба не редактируют слой.

PASS: 75 unit tests, production build, orientation regression (две ширины,
все инструменты, ленты и collapse, Levels одного слоя, Halo, ориентационное
сохранение и ошибка записи), production PWA/offline/update/recovery.
Classic 13 файлов идентичны. Реальная проверка на iPhone ещё требуется.
Текущий сценарий проверяет `test:lighttable:orientation`; прежние manual editor/
long-controls/adaptive сценарии с кнопкой Edit и portrait-edit описывают старый UI.
Скриншоты сохранены локально и показываются в чате, не добавляются в GitHub.


## 24.10.2026 — прямое Save to Photos (опубликовано)

По запросу владельца изменён только сценарий экспорта: убраны промежуточный
диалог, предпросмотр, Prepare photo, Download и отдельная кнопка Save to Photos.
Основной значок готовит JPEG 4000px и сразу вызывает native Share. Во время
подготовки короткий статус на рабочем экране. Если Safari теряет user activation,
готовый JPEG остаётся в RAM; повторный тап по тому же значку вызывает Share
синхронно, без повторного рендера. Отмена системного меню проходит без ошибки.
Dirty draft сначала сохраняется штатной boundary; ошибка записи не открывает Share.
Качество JPEG, жесты, остальные экраны и исходники не изменены.
75 unit tests, production build, editor, полный export и PWA regression — PASS.
Проверки native Share используют mock браузерного API; реальный iPhone ещё
нужен для проверки user activation и системного Save Image.


## 24.10.2026 — исправления после iPhone review (опубликовано)

- Убраны меню информации и домашнее троеточие. Update появляется только для
  ожидающей версии; безопасная граница сохранения и блокировка во время действий сохранены.
- Возврат к плёнкам обозначен Lucide film; Pro — sliders-vertical.
- Убрана отдельная portrait/wide схема с вложенным min/calc. Область шкал Move
  имеет явные 176/132px и строки 44px, фото получает оставшуюся высоту.
  Это исправление по скриншоту iPhone; аппаратная перепроверка ещё нужна.
- В landscape Pro-инструменты под миниатюрами слева, длинные шкалы справа.
- Импорт: Next Roll → Expose; системный iOS source chooser не обходится.
- Save to Photos: всегда максимальный поддерживаемый JPEG 4000px по длинной
  стороне, качество .95. Селектор 2000/4000 убран; исходники не уменьшаются.
- PASS: 75 unit tests, production build (Classic 13 файлов идентичны),
  40 сочетаний long-controls с проверкой несхлопнувшегося фото, import-v3,
  полный PWA update/offline/recovery и полный export-check (4000px, Share retry,
  12MP исходники, 20 экспортов, GPU recovery). См. DEPLOYMENT.md для публикации.


## 2026-10-23 — опубликована версия 13

Adaptive UI объединён в main (`ebec8fa`) и опубликован на прежнем Sites-адресе.
Native deployment succeeded, версия 13. Две левые миниатюры и Move дополнительно
уменьшены по последнему замечанию владельца. 75 тестов и production build PASS;
независимая сборка Sites совпала побайтно. Подробности в DEPLOYMENT.md.
Аппаратная проверка на iPhone остаётся следующим этапом.


## 2026-10-23 — подготовка публикации

Владелец одобрил публикацию adaptive UI. Перед выпуском ещё немного уменьшены
две левые миниатюры и значок Move; touch targets сохранены.


## 2026-10-23 — компактный нижний ряд

По следующему замечанию владельца нижний ряд Move при вертикальной композиции
собран по центру: убраны промежутки между группами, миниатюры уменьшены внутренними
отступами, значки инструментов — с 23 до 20px. Области нажатия остаются 44px.
На ширине 402px по краям остаётся по 25px; длина шкал не изменена.
`lighttable-long-controls-check.mjs` — PASS (40 сочетаний, включая 320/375/402px).
Обновлённый скриншот показан в чате. Sites не публиковался.


## 2026-10-23 — кнопки Move в нижнем ряду

По замечанию владельца в portrait с вертикальной композицией поворот слоя и
центрирование перенесены в нижний ряд. Отдельная строка 44px удалена;
Undo расположен сверху рядом с возвратом. Длина X/Y/Scale не сокращена.
На экранах уже 360px миниатюры слоёв переходят наверх, сохраняя цели 44px.

- `lighttable-long-controls-check.mjs` — PASS: 40 сочетаний размеров,
  поворотов и инструментов; дополнительная проверка общего нижнего ряда,
  отсутствия перекрытий и 132px для трёх шкал при ширине 320/375/402px.
- Production build (Node 22), включая TypeScript — PASS.
- Скриншот показан в чате; файлы превью не добавлены в GitHub.
- Изменение только интерфейса. Sites не публиковался; iPhone ещё не проверен.


## Уточнение после review — длинные шкалы

Все прямые регулировки теперь используют доступную короткую сторону экрана:
portrait — отдельные строки на ширину, landscape — вертикальные колонки на
высоту. Move X/Y/scale, Levels, Pro и Halo XY; кнопки в отдельной области.
Правило закреплено в DECISIONS.md и UI_CONTRACT.md. Владелец просит показывать
скриншоты прямо в чате, не отправлять его в GitHub для просмотра.

- TypeScript и `lighttable-long-controls-check.mjs` — PASS: 24 сочетания
  размеров/поворотов/инструментов, длина шкал, >=44px targets, нет перекрытия
  фото, native vertical drag + Undo, нет commits на lift.
- Повторная совместная adaptive-проверка — PASS: home/Library, независимые
  правки, hot path, failed finish/retry, четыре ориентации.
- Реальные скриншоты: `lab-out/lighttable/long-controls/`, показаны владельцу
  прямо в чате; тестовые изображения. iPhone ещё не проверен.
- Финальная сборка первоначально не запускалась: automatic approval review
  не смог завершиться из-за usage limit сервиса (не unsafe-action rejection).
  После команды владельца «продолжай» повтор через тот же механизм разрешений
  успешно выполнен: Node 22 production build — PASS; 13 файлов Classic byte-identical.
- Sites пока остаётся на v12; данные и алгоритм обработки не менялись.


## 23.10.2026 — адаптивный интерфейс, работа начата

Владелец утвердил макеты и реализацию с агентами. План и границы владения:
[ADAPTIVE_UI.md](ADAPTIVE_UI.md). База `4fa5601`, ветка
`feat/adaptive-workspace`, backup `backup/main-before-adaptive-2026-10-23`.
Git fetch: main совпадал с origin/main; workflow — только test/build, без Pages.
- Данные Library: независимый snapshot в отдельном project kind=favorite,
  ссылки на оригиналы, атомарное добавление/снятие membership без удаления фото.
  Реальный IndexedDB suite `lighttable-favorites-check.mjs` — PASS: concurrent likes,
  CAS, abort/retry, повторное добавление, stale thumbnail, reload.
- Импорт: standalone каждый раз 12; сегменты 06/12/24/36; Next вызывает
  второй picker в user activation, обе подборки до Create mix остаются RAM.
  Завершённые плёнки переиспользуются при retry; исправлен bubbling native cancel.
  `lighttable-import-v3-check.mjs` — PASS: native chooser, zero writes before
  Create mix, abort/error/retry, отсутствие дубликатов, оба расположения, 44 px.
- Общий стиль: локальный variable Manrope (OFL), без запроса Google Fonts
  при работе приложения; единые SVG. Worker принимает font/ttf и кеширует шрифт.
  Production build и PWA offline/update/recovery suite с проверкой font cache — PASS.
- Редактор: четыре компоновки по ориентации телефона/композиции, в landscape
  без нижней панели; светлота Levels остаётся per-source. Move: X/Y/scale,
  Undo; check сохраняет и выходит, Cancel убран из обычного потока. Экспорт и
  сердце доступны в обоих режимах. Portrait-wide: линейка сразу под фото.
- Mixes: реальные 640 px обложки через отдельный последовательный renderer
  тех же шейдеров; его работа запускается на home/heart boundary, не на движениях.
  Library открывает отдельную сохранённую пару в общем редакторе; смена кадров
  избранного запрещена. Конфликтная копия доступна как обычный Mix.
- Совместные проверки: 75 unit tests, TypeScript/production build, editor,
  adaptive (8 компоновок Move/Levels, 44px, без overlap/overflow, zero hot-path
  I/O, независимое избранное, failed commit/retry), gestures, workspace,
  onehand, production smoke и PWA offline/update/recovery — PASS.
  Manrope включён в offline cache; Classic 13 файлов byte-identical.
- Контрольный визуальный просмотр: реальные Chromium screenshots в
  `lab-out/lighttable/adaptive/`. Изображения тестовые, не фото пользователя.
  Аппаратная проверка iPhone и просмотр владельцем ещё впереди.
- Финальная проверка Node 22: 75 tests/build — PASS. Полный renderer browser
  suite и JPEG export suite — PASS (2000/4000, tiled/mono, 12MP fixtures,
  20 exports без роста texture memory, Share retry, context loss/recovery).
- Скриншоты для review сохранены в
  [ui-previews/adaptive-2026-10-23](ui-previews/adaptive-2026-10-23/README.md).
  Новые команды: `npm run test:lighttable:adaptive`, `:favorites`, `:import`.
- Этапы сохранены: `d2fe1aa` план, `3ba83ef` данные Library, `94d0672` импорт,
  `e05c1a6` шрифт/иконки/offline, `2ef8bbf` интеграция редактора и home.
Sites v12 пока остаётся действующим. Ветка опубликована в GitHub для review;
main не объединён и Sites не изменён до согласованного визуального checkpoint.
Draft PR: [#2](https://github.com/alxktnk-web/Multik/pull/2). На `c5ff477`
GitHub Actions — success, run `39961217101`. Финальный export landscape также
переведён на боковую панель; full export suite с geometry assertion — PASS.
Дополнительно устранён intrinsic-size overflow картинки в export grid; UI
Share/retry/context-loss и границы preview после этой CSS-правки — PASS.
Следующий шаг: комментарии владельца к реальным экранам, правки при необходимости,
затем release на прежнем origin и проверка на iPhone.


## 21.10.2026 — упрощение интерфейса, этапы с сохранением прогресса

План: [UI_SIMPLIFICATION.md](UI_SIMPLIFICATION.md), ветка
`feat/interface-simplification` объединена с main. Действующий сайт — **Sites version 12**.

- **Этап 1 завершён:** зоны Levels на фото (слева black, центр mid, справа
  white), выбор фиксируется до lift; второй палец отменяет незавершённые
  Levels и начинает pinch выбранного слоя. Учтены реальные границы композиции,
  letterboxing и поворот. Тонкая draggable шкала синхронна с фото: снизу в
  portrait, у правого края в landscape. Инструменты одним горизонтальным рядом.
- Проверки этапа 1: 75 unit tests, Node 22 production build, editor browser
  suite (hot path zero I/O, Undo/Cancel/retry/пары/ориентации) — PASS.
  Portrait/landscape screenshots просмотрены; iPhone не проверялся.
- **Этап 2 завершён:** ↔ удалена; Edit начинает Move, миниатюры исходников
  видны только в Edit. Повторный выбор слоя не переключает режим. Done
  возвращает просмотр. Save to Photos — одна и та же кнопка-иконка в просмотре
  и Edit. Export сначала сохраняет правки и завершает Edit; ошибка сохраняет
  draft/checkpoint/Undo. Основной toolbar в landscape тоже горизонтальный.
- Проверки этапа 2: production build, editor suite с export failure/retry,
  native touch browse/Edit/move/pinch/Done/reload — PASS. Скриншоты 375×667
  и landscape просмотрены.
- **Этап 3 завершён:** минимальная библиотека без hero, ＋ вызывает системный
  picker, крупные roll cards, удержание/F2 для Rename. Ошибка rename оставляет
  введённое имя; исходники не меняются. Saved mixes внутри меню плёнки сохраняет
  доступ к прежним сессиям/конфликтным копиям; Mix возвращает последнюю сессию
  той же пары. Import progress отделён от capacity; во время записи видны
  Importing X of Y и Cancel. Пустая отмена picker возвращает библиотеку.
- Проверки этапа 3: workspace/import suite (native picker, progress, overflow,
  decoder error/retry, rename failure/retry, сохранность metadata, saved mixes,
  отмена picker, CAS/copy/rails), onehand 375/402/874 и production smoke — PASS.
  75 unit tests и production build — PASS. PWA offline/update/recovery — PASS.
  Просмотрены library/import/editor screenshots.
- Финальная browser renderer/UI regression — PASS (hot path, rotations, halo,
  recovery/disposal, visible targets >=44 px). Этапы сохранены коммитами
  `3d5bef5`, `08aaf82`, `8778646`.
- **Опубликовано как Sites version 12**: deployment `appgdep_6ad8e04844ec8191b7a34a45ec05352a`,
  succeeded 21.10.2026 15:55 UTC. GitHub merge `517f06f`, CI
  [39629768898](https://github.com/alxktnk-web/Multik/actions/runs/39629768898) success.
  Sites source `38e1afa`, одинаковое source tree и все 22 файла сборки.
  Backup `backup/main-before-ui-2026-10-21` на `e726aff`. Прежний адрес,
  owner-private audience и root Classic сохранены. Установленная PWA: info → Update.

Обновлено: 21.10.2026. Пользователь разрешил продолжить; локально реализованы M0–M6, экспорт M8 и PWA/dual artifact M9. Совместимость со старыми плёнками/проявками отменена владельцем; M7 пропускаем. Текущий выпуск: **Sites version 12**, deployed source `38e1afa`; GitHub runtime merge `517f06f` (одинаковое source tree).

## 21.10.2026 — точечная поправка Levels / Lightness

- По уточнению владельца изменён только runtime helper `render/levels.ts`:
  Levels корректируют CIELAB L* каждого исходника. a*/b* сохраняются в gamut;
  вне gamut chroma уменьшается при прежних L*/hue. Нейтральный путь — identity.
- Интерфейс, модель сохранения, жесты, сложение и профили не переписывались.
  Preview, halo extraction и JPEG используют общий helper.
- Проверено: 73 unit tests, production build, 40 цветных GPU-проб (8 сохранений
  a*/b*, 16 gamut compression, 16 чёрных/белых границ), середина L*=50,
  независимость слоёв и Clear linear-light oracle. Editor suite: zero I/O hot
  path, Undo/Cancel/retry, сохранение/пары, portrait/landscape — PASS.
- Export suite с разными Levels обоих источников: mono/tiled JPEG, 4000 px,
  12MP inputs, preview match, snapshot isolation, 20-export plateau и Share
  retry/context recovery — PASS. Frozen profile 2 / Film harness и production
  GPU/UI smoke — PASS. iPhone не проверялся.
- Опубликовано как **Sites version 11**: `appgdep_6ad89986a4fc819198d6534fd8d90aca`,
  succeeded 21.10.2026 10:53 UTC. GitHub merge `36b2a92`, CI
  [39587642725](https://github.com/alxktnk-web/Multik/actions/runs/39587642725)
  success; Sites source `0c5008f`, source trees и 22 статических файла совпали.
  Прежний адрес и owner-private audience сохранены. В установленной PWA: info → Update.

## 21.10.2026 — реализация Edit / Levels / Clear

- Владелец разрешил реализацию и отдельно снял требование сохранения старых тестовых пар/данных. Специальная миграция/legacy compatibility не делалась; уже работающие default readers оставлены. Очистка браузера не требуется и не выполняется.
- Ветка `feat/levels-editor-clear` от main `fc4f28f`: новый редактор Levels / Looks / Layers / Pro вместо старого Pro/modal. I/II и Undo слева в landscape, controls справа; шкала с тремя точками без легенды, локальные SVG Lucide, targets 44–48 px. Ленты временно скрыты в Edit, preference остаётся прежним.
- `layer.levels={black,mid,white}` — отдельное состояние слоя в паре. Input Levels в linear RGB до Dense и сложения; midpoint задаёт gamma. Halo extraction учитывает Levels, derived cache разделён по стороне. Identity не меняет исходный сигнал. На drag/lift нет DB/readback/JPEG/uploads/новых GPU allocations.
- Clear/version 5: прямое сложение линейного света после ручных Levels, sRGB output и clipping. Игнорирует halo, художественные кривые/chroma, общие exposure/contrast/balance и placement gains; metadata не сбрасываются при переключении профиля. В интерфейсе нет общей тональной коррекции.
- Session checkpoint: Cancel возвращает начало Edit и прежнюю историю, Undo внутри Edit не выходит за checkpoint; Done коммитит один раз, no-op не пишет. Ошибка DB/CAS оставляет редактор/draft/Undo и Retry/Save a separate copy. Resize/background/context loss отменяют только активное касание.
- Завершены: 73 unit tests, Node 22 production build; новый editor browser suite, отдельный Clear/Levels GPU oracle, прежние browse/move/pinch, profile-3 harness, workspace/import/CAS/rails; Clear + разные Levels обоих источников: JPEG mono/tiled, 2000/4000 px, 12MP synthetic inputs, 20-export plateau, cancel/context loss, Share retry; production smoke и PWA offline/update/recovery.
- **Опубликовано как Sites version 10**: native deployment `appgdep_6ad852d9099c8191bd6a8722ca6697c1`, succeeded 21.10.2026 05:51 UTC. GitHub main merge `851a47d`, CI [39551785695](https://github.com/alxktnk-web/Multik/actions/runs/39551785695) success. Sites source `bf113b8` имеет точно то же source tree. 22 статических файла совпали с проверенной сборкой; детали в DEPLOYMENT.md. Hardware iPhone 16 Pro остаётся NOT VERIFIED.

## 21.10.2026 — упрощение Levels после review

- По уточнению владельца убраны легенда Black/Mid/White, повторные переключатели точек, заголовок/значение и пояснение выбранного слоя. Осталась шкала с тремя цветными точками; доступные имена скрыты визуально.
- Portrait: удалённые строки больше не занимают высоту; landscape: правая панель сужена со 150 до 112 px. Обновлены HTML и изображения макета. Production runtime и публикация не менялись.

## 21.10.2026 — Levels по слоям, превью для обсуждения

- Уточнение владельца: тональные настройки только отдельно для I/II; общие Levels/Exposure/Contrast результата не нужны. Выбор Original/Film/Dense остаётся. Новое требование записано в PHOTOS_UI_PLAN и DECISIONS; сохранённые параметры не сбрасываются.
- Создано изолированное `ui-previews/levels-review.html`: три точки на шкале без histogram/curves, portrait снизу, landscape справа, выбор слоя/Undo слева. Lucide 0.468.0 SVG с лицензией. Это интерактивный макет controls со статичной иллюстрацией, **не реализованный Levels renderer**.
- Получены portrait 402×874 / landscape 874×402; проверены выбор слоя, keyboard adjustment и независимость mock values. Production runtime/DB/публикация не менялись; аппаратная проверка отсутствует.

## 21.10.2026 — исследование интерфейса Photos (план)

- По запросу владельца изучены его скриншот Photos Crop, официальные материалы Apple и текущие workspace/CSS/rails/session, включая локальные скриншоты portrait/landscape. Реального теста касаний на iPhone в этом этапе не было.
- Подготовлен [PHOTOS_UI_PLAN.md](PHOTOS_UI_PLAN.md): единый Edit с Looks/Adjust/Layers, крупные SVG Lucide, шкала параметра, диагностика пропущенных taps, сохранность edit draft и этапы проверки.
- Targets dock/Pro уже 44×44 px, но SVG 22 px/stroke 1.35 и gap 2 px; busy/gesture guards временно отклоняют действия. Это направления проверки, не доказанный диагноз устройства.
- План **proposed**, не реализован: Cancel/Done внизу, общий checkpoint и новая Done save boundary — предложения, не текущий UI contract. Runtime, алгоритм и публикация не менялись; Sites version 9 остаётся действующей. Runtime-тесты для документации не перезапускались.

## 21.10.2026 — интеграция Film / Dense

- По новой команде владельца проверен PR #1, head `319e3f8`; интеграция ведётся в `integrate/film-profiles` поверх этой ветки. Ограничение «не merge/deploy» относилось к исследовательскому чату; текущая задача владельца — подключить готовый алгоритм в приложение.
- Выбрано явное включение на пару: Pro → Image profile → Original (2) / Film (3) / Dense (4). Default остаётся 2; старые пары не мигрируют. Film/Dense отмечены experimental; Dense может терять слабые теневые детали.
- Новый компактный preview chooser: варианты меняют только RAM, Apply — один Undo, Cancel/Escape возвращают предыдущее состояние вместе с прежними правками. При resize/background/context loss незавершённое сравнение отменяется. Gestures/navigation/export/update блокируются на время выбора.
- Запись — на прежней metadata boundary, не на выборе или Apply. Ошибка commit сохраняет draft и Undo. Original blobs, schema DB и независимость пар сохранены.
- Экспорт дополнительно инвалидирует готовый JPEG по profile.version, даже при равных id/revision. Thumbnail guard уже учитывает version.
- Проверки: Node 22.23.3 / npm 10.9.9, 66 unit tests; оба film harness (3/4), density study, browser/gestures/Pro/workspace, полный export suite на profile 4 (включая 4000 px/12MP inputs/20 exports), production smoke и scoped PWA — PASS. Frozen profiles 2/3 совпадают точно; 13 Classic files byte-identical. Новая UI-suite PASS: Cancel/Undo/no-op, ноль writes/readback/encode/upload/compile при сравнении, failure/retry, per-pair/reload, cache JPEG/thumbnail, 375×667 / 402×874 / 874×402, resize/context loss, hashes originals. Найденное растягивание dialog на всю высоту исправлено через fit-content и проверено скриншотами.
- Интеграция включена в GitHub main merge-коммитом `c3372d9a209a68baa0f812ddb0b25ac73ac9a2ec`, PR #1 merged; backup `backup/main-before-profiles-2026-10-21` на `0dc89b7`. GitHub CI [39521219112](https://github.com/alxktnk-web/Multik/actions/runs/39521219112) — success.
- **Опубликовано как Sites version 9**, native deployment `appgdep_6ad806c9cf988191a064d4dab77a5d9c`, succeeded 21.10.2026 00:27 UTC. Sites source `b21533c1470f84862b9e3c22903dd42107c82d90` сохраняет прежнюю Sites history; source tree совпадает с GitHub runtime merge. Все 22 статических файла публикации совпали с проверенной сборкой. Подробности/rollback — DEPLOYMENT.md.
- Адрес `/lighttable/`, owner-private и root Classic сохранены. Для установленной PWA: info → Update. Затем Pro → Image profile → Original / Film / Dense → Apply. Не очищать Safari data. Профили не объявляются проверенными на iPhone.

## 20.10.2026 — отдельное направление алгоритма изображения

### Продолжение B1 — запрос на плотные тени и взаимодействие участками

- Пользователь попросил объяснить потерю чёрного, исследовать практические способы и сделать ещё один профиль. Проверены remote: main `0dc89b7`, research `0d5250c`, PR #1 OPEN; чужих изменений нет. Запрет UI/merge/deploy сохраняется.
- Чёрный в аддитивной модели добавляет 0, поэтому чёрный+серый=серый. Сделать чёрный прозрачным и одновременно сохранить его чёрным в том же пикселе невозможно без смены правила смешения/маски.
- Изучены официальные Nikon Add/Average/Lighten/Darken и Adobe Blend If. План B2: сравнить усиление теней обоих источников, одного источника и яркостный выбор более тёмного; отдельный opt-in profile 4 с fixed source contrast до gains/addition. Profile 3 не переопределяется.
- Frozen profile-3 fragment от `0d5250c` сохранён для pixel regression. Runtime/test подготовка ведётся; новые результаты ещё не объявлены PASS.

### Продолжение B2 — отдельный плотный profile 4

- `render/dense-profile.ts`: source-local luminance gate `smoothstep(.02,.4,Y)`, общий множитель RGB **до** gains/balance/addition/exposure. В 4 используются прежние tone/halo 3, user Contrast остаётся в конце. Profile 2/3 не переопределяются.
- Minimal type/validator расширены до 4, copy сохраняет версии, default новых пар=2. Изменений UI/import/DB schema/export workflow нет; UI-ALG-001 дополнен только proposed вариантом 4.
- Полный film harness параметризован `LIGHTTABLE_TEST_PROFILE=4`, default по-прежнему 3, assertions/tolerances сохранены. 66 unit tests и сборка прошли. Оба profile harness и frozen 3 — PASS.
- 64+64 при EV=0/Contrast=1: profile 3 =83/255, profile 4 =5/255; белые нейтральные источники сохраняют tone 3. Слабые детали теней могут исчезать; вернуть их общей Exposure после gate нельзя, но originals не меняются и можно выбрать прежний профиль.
- Формулы/первичные источники/варианты/ограничения добавлены в IMAGE_ALGORITHM.md. **Кандидат, не опубликован**; PR #1 остаётся открытым.

### Продолжение B3 — A/B, численные и регрессионные проверки

- Runtime `85cb495`; `scripts/lighttable-density-check.mjs` сравнивает 6 вариантов на 4 парах. Архив `docs/lighttable/density-comparisons/`: прямые 3↔4, шестисторонние таблицы с sources, 2↔4 patches/halo, candidate JPEG, snapshots/metrics/checks. Визуально просмотрены все четыре исследования и прямой портретный A/B.
- 66 unit tests, build, browser/export/gestures/data/workspace/cache/Pro, полный film harness в режимах 3 и 4, density-study **PASS**. Старые assertions/tolerances не ослаблены. Frozen 2 max=0; frozen 3 max=0 (7 comparisons); mixed-source oracle 4 max=.506/255.
- Candidate 4 JPEG tiled/mono MAE=.005321/255; preview/downscaled JPEG MAE=1.5215/255 (max79 на границах; sampling/JPEG не pixel-identical). Snapshot/recovery max=0; 6 original hashes и соседняя v8 pair неизменны; горячий путь без I/O/новых allocations.
- Повторная scope-проверка: 62 защищённых файла совпадают с main; original package/lock/UI contract/deployment не изменены. Node 24/Chromium локально; CI Node 22 проверяется после push.
- Рекомендация для запроса: profile 4 (подготовка обоих источников) даёт плотные участки без выбора между объектами. На rocket/portrait может чрезмерно затемнять, поэтому не заменяет 3/2 и не включается автоматически. UI-ALG-001 остаётся proposed. Merge/publish не выполнялись.

### Этап A1 — исследование базы (research/film-rendering)

- Проверены remote HEAD, main и рабочая ветка: все на `0dc89b74d9f6792142769538c7ff285ccf8f9024`; v8 merge `cc5bf66` присутствует. Отдельный чистый checkout `/workspace/Multik`.
- Прочитаны handoff, UI contract, transfer, план, решения, acceptance и deployment. Выводы пяти референсов перенесены в `IMAGE_ALGORITHM.md`; пользовательские фото не копируются в Git.
- Подтверждены SRGB8_ALPHA8 sampling, общий present preview/export, profile-2 tone и per-source halo. Независимый frozen profile-2 fragment сохранён для GPU regression.
- План: opt-in profile 3 в render/model validation, без UI/default migration. Проверки кандидата ещё не выполнены. **Кандидат, не опубликован**; Sites v8 не изменён.

### Этап A2 — opt-in profile 3 в общем renderer

- Добавлен `render/film-profile.ts`: непрерывная toe/shoulder, luminance scaling и мягкая chroma compression. В `shaders.ts` отдельная ветка 3 и halo spill `max(blur-mask,0)`; прежняя ветка 2 сохранена. `renderer.ts` передаёт version/mask uniforms без новых GPU ресурсов или изменения контракта UI.
- Минимальные type/validator изменения: принимается 3, `copyComposition` сохраняет 3; прежнее 1→2 остаётся, новые пары default=2. Нет DB schema/import/original changes.
- 65 unit tests (включая 3 новых), TypeScript/build прошли. Browser, gestures, data, workspace suites прошли; 13 Classic файлов сборки byte-identical. Полный export/cache и расширенная проверка кандидата — этап A3.
- Формулы/defaults/cache rationale в `IMAGE_ALGORITHM.md`. `UI-ALG-001` — **proposed**, выбор profile только в harness/API snapshot, без пользовательского переключателя. Защищённые UI и конфигурация не менялись. **Кандидат, не опубликован**.

### Этап A3 — сравнение и проверка изображения

- Runtime `9315887`, база `0dc89b7`, ветка `research/film-rendering`. Новый `scripts/lighttable-film-check.mjs`, независимый test oracle/synthetic fixtures и 4 разрешённых photographic fixtures с provenance. Пользовательские референсы не опубликованы.
- A/B: 7 подписанных contact sheets, оба исходника/оба профиля/параметры; candidate tiled JPEG и JSON evidence в `docs/lighttable/film-comparisons/`. Все таблицы визуально просмотрены. Формулы, наблюдения, сравнения и ограничения — `IMAGE_ALGORITHM.md`.
- 65 unit tests, build, browser, gestures, data, workspace, export, cache, Pro и новый film harness **PASS**. Исходные assertions не изменялись. Frozen profile 2 max diff=0 в 10 comparisons. CPU oracle max error .500/255.
- Candidate tiled/monolithic JPEG MAE .004618/255; preview/downscaled JPEG MAE 1.5079/255 (resampling/JPEG edges, не pixel identity). Snapshot/cancel/context restore — PASS. Hashes 6/6 originals совпали; version 3 roundtrip, соседняя v8 pair и seed/правки сохранены.
- Hot path 3: 0 readback/encode/CPU pixel ops/upload/compile/DB writes/новых bytes; profile switch без rebuild. Штатные export/cache suites подтверждают прежние budgets; это не iPhone RSS/fps.
- Явный визуальный компромисс: белое на чёрном при EV=0 у 3 =231 вместо 248 у 2. Кандидат сохраняет градации/цвет в светах, но может выглядеть менее воздушным. Exact matching референсам без исходных пар не доказан.
- UI-ALG-001 **proposed**; никаких UI/control/config/deployment изменений. Profile 2 остаётся default и reference. Safari/HEIC/HDR/P3/iPhone hardware acceptance открыты. **Кандидат, не опубликован**.
- Финальная scope-проверка: 62 защищённых файла byte-identical базе, package/lock/UI contract/deployment config неизменны; frozen shader точно извлечён из базы. Evidence: `film-comparisons/scope.json`.

### Этап A4 — передача на review

- Открыт [PR #1 в main](https://github.com/alxktnk-web/Multik/pull/1), head `research/film-rendering`. Коммиты: `861f872` (анализ/reference), `9315887` (runtime), `118d3f4` (проверки/A/B).
- Обычный push без force; remote main повторно проверен и остаётся `0dc89b7`. Ни merge, ни публикации не выполнялось.
- GitHub workflow **Verify source (no deployment)** на `118d3f4`: **SUCCESS**, Node 22 / unit tests / build ([run](https://github.com/alxktnk-web/Multik/actions/runs/39435104615)). Локальные browser suites остаются Chromium SwiftShader.
- PR оставлен открытым для визуального решения владельца. Profile 3 opt-in, UI-ALG-001 proposed, default 2; **кандидат, не опубликован**. Аппаратные ограничения описаны выше.

- По поручению владельца подготовлена передача соседнему чату: `ALGORITHM_HANDOFF.md`. Работа алгоритма ведётся в `research/film-rendering`, отдельно от main; результат — открытый PR для проверки, без самостоятельного merge/публикации.
- Зафиксирован подробный текущий UI-контракт в `UI_CONTRACT.md`: экраны, жесты, Pro, параметры, ориентации, импорт, сохранение и Save to Photos. Для чата алгоритма UI и этот контракт read-only.
- `UI_REQUESTS.md` — единственное место предложений алгоритма к UI, с подробным шаблоном и явными статусами. Предложение не разрешает реализацию; UI занимается отдельный чат по поручению владельца.
- Доработка алгоритма ещё не началась. Runtime, данные, workflow и действующий Sites не изменены. Проверка этого этапа — согласованность документов/ссылок и отсутствие runtime diff; прежние результаты 62 тестов не выдаются за тестирование будущего алгоритма.

## 20.10.2026 — перенос базы разработки v8 в GitHub main

- Владелец разрешил дальнейшую работу через GitHub. Старые запреты в документах отменены; `main` становится базой разработки v8. Перенос хостинга и M10 не входят в этот этап.
- Проверены remote branches: прежний `main` — `57ce58e6c9f68c2e81bd8156218426bc347ba695`, `multik-v8-source` — `4f139e6740641aa25178245d5ad446e6fce7225f`. Main является родителем импорта; расхождения истории нет. Все 104 записи CHECKSUMS.sha256 совпали до правок интеграции (105 файлов с самим manifest).
- Создана remote backup-ветка `backup/main-before-v8-2026-10-20` на прежнем main. Исходная v8-ветка сохраняется.
- Изучен Pages workflow: автоматический push main ранее публиковал `dist`, последний запуск прежнего main завершился success. Перед merge публикация заменена на CI tests/build без upload/deploy и pages/id-token write. Отдельный коммит защиты перед merge сохраняет её при `git revert -m 1`.
- Объединение оформлено обычным merge без конфликтов: первый родитель — коммит отключения публикации, второй — проверенный импорт v8. Runtime/lockfile/baseline/Sites config совпадают с v8; изменения относительно импорта ограничены workflow и шестью документами.
- Проверки интеграции: Node 22.23.3 / npm 10.9.9, 62/62 unit tests, TypeScript + production build, production GPU/UI smoke и полный scoped PWA suite прошли (offline, explicit update, recovery, redirects/MIME). SHA-256 baseline архива совпал; 13 файлов Classic byte-identical. YAML CI проверен: push/PR main и manual, только contents:read, без Pages deploy.
- Sites и браузерные данные не затрагиваются. Hardware acceptance iPhone остаётся открытым. Для дальнейших правок используем main; source rollback — DEPLOYMENT.md.

## Обновление 20.10.2026 — свайп, размер слоя, тон

Опубликовано 20.10.2026 как Sites version 8, source `d22a3ca`; native deployment succeeded. Подробности — DEPLOYMENT.md.

- При открытии рабочей поверхности один палец листает пары: обе плёнки сдвигаются на один слот циклически. Вертикальный жест не листает. Нажатие на миниатюру слоя в dock включает свободный x/y-сдвиг выбранного слоя; повторное нажатие либо ↔ возвращает просмотр. Скорость жеста не переключает режим. Pro включает редактирование, закрытие Pro возвращает просмотр.
- Щипок изменяет только выбранный слой (0.5–4×), с неподвижным начальным центром жеста. Viewport не увеличивается. Появление второго пальца отменяет только текущий незаконченный drag; после первого lift оставшийся палец ждёт нового жеста. Полный pinch — один Undo в RAM. Pointerup не пишет в DB; swipe/rail navigation фиксирует параметры пары.
- Масштаб хранится в optional transform.scale (отсутствие = 1). Preview и tiled JPEG используют одну source-to-film матрицу; halo остаётся привязан к исходнику. Остальные пары не меняются.
- Стрелка сверху открывает библиотеку Lighttable, а не Classic root. Ошибка запуска ведёт в scoped recovery. Старая закладка/иконка на `/` всё ещё открывает сохранённую Classic: актуальный адрес — `/lighttable/`.
- Смешивание по-прежнему складывает линейный свет двух изображений, не opacity. Profile version 2 сохраняет низкие/средние уровни, сжимает только highlights, плавно переводит пересвеченные области в белый, возвращает умеренную S-кривую (.35). Это устраняет глобальное приглушение прежнего Reinhard. Halo настраивается как прежде, остальные декоративные засветки выключены.
- Читаемые profile-1 композиции нормализуются в RAM к profile 2 без массовой записи в DB; следующая обычная commit сохраняет version 2. Thumbnail принимается только при совпадении пары, revision и profileVersion. Оригиналы/DB schema не менялись. **Откат приложения к version 7 не гарантирует чтение новых profile-2 композиций**; для исправлений предпочтителен forward fix. Оригинальные фото при откате не удаляются.
- Попутно исправлена нормализация revision-0 conflict-copy: сохранённые в копии сдвиг/поворот/масштаб не сбрасываются при повторном выборе пары.
- Проверки: 62 unit tests; native-touch gesture suite; GPU/browser, workspace (включая revisit conflict-copy), Pro, tiled export с scale=1.7. Production build/smoke и scoped PWA suites прошли: offline, explicit update, scoped recovery и redirects/MIME safety; 13 Classic files byte-identical. iPhone 16 Pro / «27.01» и субъективная оценка реальных фотографий остаются проверками владельца.

## Обновление по feedback владельца — управление одной рукой

Опубликовано 19.10.2026 как Sites version 7, source `cad3a1d`; native deployment succeeded. Подробности и rollback в DEPLOYMENT.md.

- Bottom sheets: собственные подтверждения/закрытие импорта, библиотеки, export/info закреплены снизу независимо от прокрутки. На рабочем столе Save перенесён в нижний dock (слева в landscape), Undo находится внутри Pro.
- Импорт: крупный постоянный N/N, полоса заполнения, `Roll full` + выключенный плюс при N; красный `Remove X` и отметки лишних кандидатов при overflow. Без молчаливого удаления фотографий. Системный iOS photo picker управляется iOS: HTML multiple input не умеет ограничивать выбор внутри него и перемещать его Done. Это ограничение не выдаётся за исправленное.
- Новая плёнка получает локальную дату/время (`19 Oct · 17:10`), редактируемое поле. При новом открытии прежнее имя не переносится. Место съёмки/EXIF-география не придумываются.
- Новые и ещё не правленные пары лежат в единой landscape-ориентации. Portrait source получает placement.turns=1 и rect, рассчитанный по повёрнутым размерам. Оригиналы byte-identical; без crop/stretch. Сохранённые правки revision>0 не переписываются. В Pro есть ручной поворот выбранного слоя, Undo и независимость пары сохранены.
- Halo mask строится в физических осях исходника (swap width/height при odd placement turn); texture cache key включает parity. Геометрия и halo одинаковы в preview/export.
- Фото готовится автоматически после явного открытия Save; снизу Save to Photos (системный share sheet) и Download. При отмене/отказе Share файл остаётся доступен. Браузер не может молча записать фото в Camera Roll: на iPhone пользователь выбирает Save Image в системном меню.
- Новый тёплый графит/приглушённый sage, полупрозрачные dock/sheets, компактные rails единой формы, минимум надписей. UI и ошибки английские; названия пользовательских плёнок сохраняются как введены. Reduced transparency/motion и VoiceOver labels сохранены.
- 57 unit tests, production build, workspace, Pro, export, onehand, GPU/native-touch, cache stress, production/PWA suites прошли. Onehand: 12/13, автоимя, закреплённый Save при 375×667 / 402×874 / 874×402 на обоих концах прокрутки; landscape/portrait JPEG+halo comparison MAE 0.00368/255, оригинальные bytes совпадают. Проверка native iOS picker, Photos и hardware fps всё ещё на устройстве владельца.

## Где продолжать

- **Рабочая база:** GitHub `alxktnk-web/Multik`, ветка `main`; текущий checkout `/workspace/Multik`. Исторические `/workspace/sites/...` и handoff-пути относятся к прежней среде и могут отсутствовать.
- **Точки восстановления:** `multik-v8-source` (`4f139e6`), `backup/main-before-v8-2026-10-20` (`57ce58e6`). Classic production baseline сохранён в `deployment/classic-baseline.tar.gz`, сведения — `deployment/BASELINE.json`.
- План/решения/приёмка: рядом в `docs/lighttable/`. Последние датированные решения важнее раннего плана; GitHub теперь разрешён. CI не публикует сайт.
- Пилот: **https://multik-photo-room.alexanderhot.chatgpt.site/lighttable/**. Sites version 9, owner-private. Root Classic сохранён побайтово.
- Устройство владельца: **iPhone 16 Pro**, версия iOS сообщена как **«27.01»** (записано буквально, не проверено на устройстве).

## Этапы

| Этап | Фактический статус |
| --- | --- |
| P0 план и backup | готово; baseline checksum проверен |
| M0 изоляция | готово, `d9660f8` |
| M1 модель/жесты | готово, `72120fa` |
| M2 GPU-срез | локально готов, `634869e` + последующие улучшения cache; **hardware gate открыт** |
| M3 данные/commits/import | основной путь готов; data commit `46150a3`; UI-интеграция в HEAD новой ветки |
| M4 ручные пары/две ленты | готово локально; старые проявки исключены из scope |
| M5 компактный Pro | готово локально: one-axis, явные XY, доступные controls, GPU halo invalidation |
| M6 home/визуальная доводка | реализовано локально; просмотрено в Chromium, визуальная приёмка на iPhone впереди |
| M7 legacy rendering parity | **отменён владельцем** 19.10.2026; не реализовывать |
| M8 export/derivatives | локально готово: JPEG 2000/4000 px, tiles, cancel, Share/download, result thumbnail; device gate открыт |
| M9 dual PWA/publish | **обновление опубликовано**, version 8 / d22a3ca; device acceptance впереди |
| M10 основной адрес | отдельное будущее решение |

## Что уже работает

- Постоянный WebGL2 canvas: просмотр со свайпом; явный режим x/y/диагонального движения слоя; pinch меняет размер выбранного слоя; metadata rotation и Undo. Cancel/resize сохраняют предыдущие законченные жесты.
- Горячий путь без readPixels/ImageData/JPEG/IDB/upload/compile. rAF latest-state, fixed quality tiers 1024/768/512.
- Чистое линейное сложение света, highlight shoulder/S-curve profile 2, красный per-source halo; grain/leaks/общий bloom off. Сила halo uniform; radius/threshold регулируются с coalesced GPU rebuild без decode/upload/allocation на движении.
- Нативный импорт 6/12/24/36; N/N блокирует input и обработчик; overflow сохраняет ВСЕ кандидаты до ручного отбора. Повреждённое фото можно заменить без потери остальных выбранных файлов. Подготовка последовательная и отменяемая.
- Отдельная `multik-lighttable` DB version 1: assets/rolls/jobs/projects/compositions/prefs. Оригинальные blobs сохраняются byte-identical, preview/thumbnail — производные. Нет записи/upgrade в старую `multik-app`.
- Основной путь — только новые native rolls/manual pairs. Импорт из Classic убран из нового UI по решению владельца. Исторический reader и его тесты остались в исходниках, в runtime bundle не подключены. Classic checkout/DB не менялись.
- Новый микс создаёт project; ordered pair identity включает project/rolls/assets/revisions. Выбор любой A/B фотографии возвращает именно её прежние параметры. Последний выбранный слой становится активным.
- **Pointerup не сохраняет.** Навигация фиксирует только metadata dirty-композиции, без полноразмерного JPEG. No-op кадр не получает новую revision. Save boundary также на входе в Pro/библиотеку/экспорт; закрытие Pro само не сохраняет.
- Atomic CAS по revision, блокировка повторной навигации, retry при сбое без потери draft. При конфликте вкладок явная «Сохранить отдельную копию», без перезаписи чужой версии.
- Перезагрузка возвращает последнюю выбранную пару и сохранённые правки. Текущая незавершённая RAM-правка до навигации может потеряться при убийстве Safari — скрытого autosave нет.
- Portrait: две нижние native-scroll ленты, landscape: A слева/B справа, композиция между ними. Прокрутка не выбирает источник; tap выбирает. Handle скрывает/показывает ленты, prefs раздельны для ориентаций. Поворот телефона не меняет пару/frame turns.
- GPU LRU cache 24 MiB с pinned active/pending sources в рамках 96 MiB tracked texture budget. Повторный выбор недавней пары не делает upload/decode. Prepared bitmaps закрываются. Async requests помечены selection epoch/context generation; старая загрузка не подменяет новую пару.
- WebGL loss/restoration сохраняет draft; dispose освобождает textures/listeners/rAF. Маленький toolbar, приглушённые цвета, настройки скрыты; при ручном повороте кадра Pro закрывается.

## Добавлено M5–M6

- Pro: группы света/ореола, одноосные exposure/contrast/balance/halo strength/radius/threshold, явные XY «свет/контраст» и «сила/радиус ореола». X у one-axis не меняет параметры. Радиус имеет логарифмическую шкалу; clamp и 4 px deadzone.
- Небольшой indicator осей, native range для каждого значения XY, keyboard/VoiceOver labels. Выбор инструмента заблокирован во время touch. Pinch откатывает только текущий жест. Undo восстанавливает обе координаты XY одним шагом. Закрытие Pro/rotation возвращают layer tool; на lift нет commit.
- Shared registry для gesture/UI/validation; additive schema-1 defaults при чтении старых записей — без DB version upgrade и перезаписи оригиналов.
- GPU derived mask signature отделена от immutable source upload key; при radius/threshold rebuild максимум один на source за rAF. Сдвиги/экспозиция/контраст/сила ореола не пересчитывают masks. Scratch textures удерживаются, никаких аллокаций на параметрическом движении.
- Home/library на весь экран: empty film stack, photographic source-card hero последнего микса, карточки-стопки плёнок, минимальные действия. При отсутствии проекта открывается home; сохранённый проект по-прежнему сразу восстанавливается. + открывает библиотеку с рабочего стола. Portrait/landscape, safe areas и reduced transparency/motion сохранены.

## Добавлено M8

- Кнопка экспорта в нижнем dock рабочего стола (обновлено после version 6). Этот явный переход сохраняет metadata dirty-пары; JPEG не создаётся при lift/обычном перелистывании.
- JPEG 2000×1500 / 4000×3000 (или portrait после 90°). Source decode из originals, последовательно decode/upload/close; экспорт отдельного immutable snapshot через тот же GL context. Preview viewport/zoom/chrome не входят в результат.
- Tile 1024×1024 по умолчанию, единые матрицы/halo masks для всех tiles, readPixels только в export job. Foreground rAF paused до завершения; visible canvas, draft/history и выбор пары сохраняются. Отмена/context loss освобождают временные textures/output canvas.
- Подготовленный JPEG доступен через свежий Share tap или download; не теряется при отказе Share/истёкшей activation. Один файл в RAM до следующего результата/dispose. Thumbnail 320 px сохраняется по project с compositionId/revision; home показывает точный результат только при совпадении пары/revision, иначе source cards. Ошибка сохранения thumbnail не уничтожает файл.
- Interactive GPU budget 96 MiB; временный export budget 160 MiB включает retained foreground. Это tracked texture allocation, не browser RSS. На устройстве 4000 px/48MP decode/Share ещё не проверены; при неподдержанном размере явная ошибка, без скрытого уменьшения.

## Добавлено M9 локально

- Standalone manifest с отдельными id/start_url/scope `/lighttable/`, Apple install metadata и непрозрачными приглушёнными icons 180/192/512 px. Orientation any; portrait/landscape CSS сохранён.
- Свой worker `/lighttable/sw.js`, content-based build version, отдельный CacheStorage prefix. Только свои статические files; install atomic, строгая MIME/canonical URL проверка, очистка redirected responses для Safari. Ни photo blobs, ни DB не кэшируются worker-ом.
- Offline readiness появляется в info только после activated worker. Обновление ждёт явного tap в info, не вызывает reload само. Gesture/import/library/export блокируют применение; dirty metadata сохраняется через Navigation boundary перед activation/reload. Обновление другой вкладкой не перезагружает текущую.
- `/lighttable/recover.html` вне precache. Восстановление трогает только registration с точным scope `/lighttable/` и его cache prefix; IndexedDB/localStorage/Classic/sibling scopes не удаляются. Ошибка установки не мешает online работе приложения.
- `npm run build:lighttable:combined` создаёт `dist-combined/`: точный baseline root + namespace `/lighttable/`, без повторного запуска Classic precache generator. 13 baseline files побайтово совпадают с production.tar.gz; proof в assembly-evidence.json.
- Пилот опубликован по команде владельца, доступ owner-private сохранён. Root не переключали. Реальные Safari, установка на iPhone, вход после сна и 4000 px export/Share ещё требуют проверки. Данные публикации — DEPLOYMENT.md.

## Проверки

См. `VALIDATION.md` и исполняемые `scripts/lighttable-*-check.mjs`.
- 62 unit tests: 25 Classic + 25 geometry/gesture + 5 Pro/XY + 6 schema/import/session + 1 scheduler.
- Classic browser/PWA regressions прошли на M0; последующая Classic сборка сохраняет 13 файлов побайтово идентичными опубликованному baseline.
- GPU/browser suite: native touch, all rotations/zoom, hot-path API interception, halo pixels, stale loads, tiers, context loss, layout, cleanup.
- Data suite: byte identity, CAS conflict, aborted tx/retry, hidden incomplete imports, bad-file cleanup, interrupted/resumed/deduplicated adoption, zero legacy writes, v2 originals survive Classic deletion.
- Workspace suite: native picker overflow/limit guard, correction/retry, actual zero composition put/add on lifts, one metadata put on navigation, pair isolation/reload, failed commit blocks navigation, serialized targets, conflict-copy, rails layout/preferences.
- Cache stress: 100 changes of pairs; warm return 0 texture uploads; tracked settled 21,609,828 bytes, peak 28,813,104 bytes, dispose 0. Это **не iPhone RSS**.
- Export suite: monolithic/tiled matching, snapshot isolation, exact 2000/4000 px, 12MP source uploads, cancel/context loss, 20-job plateau, Share retry/download, thumbnail quota/revision checks. iPhone Share/performance пока не проверены.
- Production build smoke: assets доступны, dev global отсутствует, v2 DB изолирована, PWA worker контролирует только /lighttable/; legacy DB не создаётся.
- PWA suite на production dual artifact: root→v2 under old worker, install/redirect safety, offline обоих приложений с imported photos/edits, waiting update без auto reload, busy guards, explicit metadata commit/reload, scoped recovery, auth redirects и HTML-as-JS rejection/atomic install cleanup.

## Ограничения / будущая работа

1. Pro/home/export/PWA реализованы локально. Favourites и общая result-галерея не входят в текущий готовый срез. Новая версия доступна по /lighttable/; установка и hardware acceptance на iPhone ещё не подтверждены.
2. Старые плёнки/recipes/edits исключены владельцем из требований. M7 отменён. Не возвращать legacy parity/migration как блокирующий этап.
3. Result thumbnail создаётся только при явном export. Фоновой очереди derivatives на навигации и общей галереи всех результатов нет. Ленты по-прежнему показывают sources, hero использует matching export thumb или две source cards.
4. Новые плёнки ограничены 6/12/24/36. Виртуализация аномально длинных legacy rolls больше не является требованием.
5. Halo: defaults radius .65 mm / threshold .75 linear, диапазоны .2–1.6 mm / .5–.95; padding 4.8 mm. Immutable source cache отделён от derived signature radius/threshold; mask/temp удерживаются и учитываются в 24 MiB бюджете. Automatic adaptive quality/1536 idle ждут hardware измерений.
6. Browser decoder/original decode, compositor/driver memory не входят в texture counters. HDR/P3/HEIC/EXIF и 48MP imports на устройстве не проверены.
7. iPhone 16 Pro / «27.01»: Safari/PWA fps, p95 latency, нагрев, resume и Share — **NOT VERIFIED**. Chromium SwiftShader не заменяет hardware acceptance.
8. Dual artifact собирается в dist-combined/. Не публиковать только dist-lighttable поверх root. Hosting deployment завершился succeeded. Реальный hosting rollback и private auth/resume на iPhone ещё не проверены.

## Следующий этап

Version 10 размещена. Следующие действия: feedback владельца по Levels I/II, Clear и новым controls в portrait/landscape; сравнение JPEG/Photos и проверка Done/Cancel/Undo, browse/move/pinch на реальном iPhone 16 Pro; Safari/PWA install, native picker, Save Image, offline, wake/auth и hardware gesture timings. Не просить повторного разрешения на уже состоявшуюся публикацию и не публиковать её заново ради документации. M7 отменён; M10 переключение root остаётся отдельным решением.

В новом чате не начинать M0 заново: читать этот файл и фактический Git. В portable package новый код — `implementation/repository.bundle`/`source.zip`; `baseline/` оставлен для отката. После следующего этапа обновить файл и его зеркало в handoff.
