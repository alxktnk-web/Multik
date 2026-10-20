# Multik Lighttable — состояние реализации

Обновлено: 20.10.2026. Пользователь разрешил продолжить; локально реализованы M0–M6, экспорт M8 и PWA/dual artifact M9. Совместимость со старыми плёнками/проявками отменена владельцем; M7 пропускаем. Текущий выпуск по feedback владельца: **Sites version 8**, deployed commit `d22a3ca`.

## 20.10.2026 — отдельное направление алгоритма изображения

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
- Пилот: **https://multik-photo-room.alexanderhot.chatgpt.site/lighttable/**. Sites version 8, owner-private. Root Classic сохранён побайтово.
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

Version 8 размещена. Следующие действия: feedback владельца по явному browse/move, pinch выбранного слоя и новому тону на реальных фото iPhone 16 Pro; Safari/PWA install, native picker, Save Image, offline, wake/auth и hardware gesture timings. Не просить повторного разрешения на уже состоявшуюся публикацию и не публиковать её заново ради документации. M7 отменён; M10 переключение root остаётся отдельным решением.

В новом чате не начинать M0 заново: читать этот файл и фактический Git. В portable package новый код — `implementation/repository.bundle`/`source.zip`; `baseline/` оставлен для отката. После следующего этапа обновить файл и его зеркало в handoff.
