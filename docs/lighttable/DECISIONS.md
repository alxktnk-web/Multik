# 25.10.2026 — фиксация рабочей базы

Владелец запросил именованную рабочую базу для дальнейших точечных исправлений,
дизайна и передачи другому ИИ. Это не запрет новых багфиксов и не заявление об
отсутствии дефектов. Runtime c771eb8 не меняется при документировании.

Актуальные правила сведены в [PRODUCT_SPEC](PRODUCT_SPEC.md), [UI_CONTRACT](UI_CONTRACT.md),
[BASELINE](BASELINE.md), корневых ARCHITECTURE/AGENTS/TRANSFER. Ниже — журнал прежних
решений, не параллельная спецификация. Последние существенные решения: раздельные
Mixes/Library swipes, чистый tap preview, явные View/Move, неподвижная геометрия при
смене tools, L* Levels, immutable variants/working drafts, unlike Undo, direct Share.

---

# Решения и вопросы для пилота

## 24.10.2026 — редактор только в landscape

Владелец утвердил portrait-preview / landscape-edit, прямые Levels и Halo,
восстановление боковых лент и удаление дублирующих двухосевых Halo controls.
Правка ограничена UI/state wiring; формулы и хранилище не переписываются.


## 24.10.2026 — уточнения после проверки на телефоне

Домашнего меню информации нет. Только временная кнопка Update при готовой версии.
Навигация к плёнкам — film icon. Импорт подписан Next Roll / Expose.
В landscape Pro выбор инструмента расположен слева под миниатюрами, шкала справа.
Экспорт без выбора разрешения, всегда максимальные поддерживаемые 4000px, JPEG .95.
Это предел текущего экспортера, не обещание исходного разрешения любой фотографии.


## Длина линейных регулировок — уточнение владельца после adaptive review

Для всех текущих и будущих прямых шкал приоритет — максимально доступная
длина хода для точной настройки. Не сжимать range в узкую панель с кнопками.
Portrait: каждая шкала занимает доступную ширину под фото. Landscape: шкалы
вертикальны рядом с фото, на доступную высоту с небольшими краевыми отступами.
Это относится к Levels, X/Y, масштабу, Pro и будущим линейным инструментам.
Кнопки размещаются отдельно; фото не перекрывается; область касания >=44px.

## 23.10.2026 — фото занимает максимум экрана; Mixes и Library

Утверждённый план: ADAPTIVE_UI.md. Новые требования отменяют v12 landscape
нижнюю полосу, roll-first home и видимый Cancel/Done. Код обработки изображений
сохранён. Manrope локальный; general tone controls не добавлены. В landscape
инструменты сбоку; четыре сочетания ориентаций. Check — commit и выход, Undo
отдельно. Library хранит независимый editable snapshot, с references оригиналов,
а не JPEG вместо источников. Избранная пара фиксирована. Native picker iOS
нельзя принудительно превратить в Photos-only. Mix wizard выбирает две плёнки
до записи, Next остаётся user gesture для второго picker. Backup/ветка/проверки
перечислены в PROGRESS. До визуального checkpoint действующий Sites не меняем.

## 21.10.2026 — упрощение UI без изменения обработки изображения

Владелец утвердил последовательную реализацию с отдельными завершёнными
коммитами на случай лимита сессии. Этапы и точки продолжения —
UI_SIMPLIFICATION.md / PROGRESS.md.

- Отменено прежнее переключение Browse/Move повторным tap миниатюры или ↔.
  Теперь Edit начинает Move, I/II видны в Edit; Done возвращает Browse.
  Свайп пары и rail selection сохраняются. Pinch по-прежнему масштабирует
  только выбранный слой. Долгое нажатие на фото не добавляется.
- Levels выбирают точку по трети видимой композиции при touch-down и меняют
  её вертикальным движением. Выбранная точка остаётся той же до lift. Шкала
  дублирует жесты: horizontal под фото в portrait, vertical у правого края в
  landscape; тонкая линия, маленькие точки, targets 44 px, без легенды.
- Инструменты в один горизонтальный ряд. Save to Photos — видимая иконка
  без подписи в обоих режимах. Export — явная граница сохранения и завершения
  Edit; только после успешного commit. Ошибка сохраняет draft/Undo/checkpoint.
- Главный экран — ＋ и roll cards. Hold/F2 открывает Rename; Saved mixes
  внутри этого окна оставляет доступ к конфликтным копиям и прошлым сессиям.
  Mix открывает последнюю сессию выбранной пары плёнок, если она существует.
- ＋ сразу вызывает системный multi-image picker в user activation; собственных
  вариантов camera/gallery нет. Конкретное меню iOS контролируется системой.
  Прогресс реального импорта отделён от счётчика наполнения плёнки.

Lightness helper, смешивание, profiles, Session и схема IndexedDB не менялись.
Rename обновляет только name в существующей записи roll, не assets или пары.

## 21.10.2026 — Levels меняют только Lightness

По уточнению владельца Levels больше не применяют одну кривую независимо
к R/G/B. Меняется только CIELAB L* (D65), отдельно у каждого исходника до
смешивания. Black/mid/white теперь заданы в нормализованной светлоте 0…1;
mid отображается в L*=50, а не в 50% линейного света. Формула exponent,
порядок точек и их жесты прежние. Этот раздел заменяет linear-domain Levels ниже.

Компоненты a*/b* сохраняются, пока цвет помещается в sRGB. За пределами gamut
уменьшается только Lab chroma при фиксированных L* и hue; 8 шагов ограниченного
поиска, только для таких пикселей. На L*=0/100 результат чёрный/белый.
Нейтральные Levels обходят преобразование точно. Один shader helper используется
в preview, JPEG и halo extraction; новых textures/readback/DB операций нет.
UI, остальная математика профилей и сложение линейного света не меняются.
Старые тестовые значения теперь имеют смысл L*, без миграции и сброса данных:
владелец ранее снял требование совместимости этих тестовых правок.

## 21.10.2026 — реализация разрешена; Clear и старые тестовые данные

Владелец разрешил реализовать согласованный редактор и Clear, затем прямо
снял обязательство сохранять старые тестовые пары и данные. Отдельную миграцию
не делать; это не требование удалять IndexedDB или исходники. Защита новых
правок (Undo, ошибочный commit/retry) остаётся частью нового редактора.

Clear/version 5 пропускает автоматическую обработку, сохраняя ручные Levels и
геометрию. После input Levels каждый источник складывается в linear RGB с
единичным gain; затем clipping в [0,1] и sRGB encoding. Overlap может стать
белым: нет скрытой auto exposure/shoulder. Переключение профиля не сбрасывает
Levels или сохранённые effects; в Clear они, кроме Levels, не применяются.

Levels хранят black/mid/white в linear input domain (0…1), минимальный размах
black→white .02. Midpoint лежит в 5–95% этого интервала и отображается в .5
линейного выхода через exponent=log(.5)/log((mid-black)/(white-black)).
Endpoint drag сохраняет relative midpoint. Нейтральный branch точный identity.
Порядок: source → Levels → optional Dense → gains/addition → halo → profile tone;
Clear выходит сразу после Levels/addition. Halo masks извлекаются после Levels,
а shared asset на разных сторонах получает отдельную derived signature.

Done — явный metadata boundary; Cancel с нижним подтверждением откатывает
checkpoint. Общих Exposure/Contrast/Balance/Light XY controls в новом UI нет.
Редкие настройки halo и Halo XY находятся в Pro, Clear их отключает.

## 21.10.2026 — запрос на отдельные Levels исходников

Владелец уточнил направление редактора: корректировать тон отдельно у I/II,
без общей тональной коррекции результата. Нужны компактные Levels с чёрной,
серой и белой точками на линейке, без histogram/curves. Portrait — под фото,
landscape — справа; выбор фотографии слева, Levels под правым большим пальцем.
Выбор Original/Film/Dense сохраняется. Требуется сначала превью для комментариев.
После review владелец исключил легенду, подписи точек и пояснения: оставить
только линейку с тремя точками, не резервировать место под описание.

Это отменяет предложение общей Exposure/Contrast/Light XY панели в новом UI,
но не разрешает сбросить существующие metadata или изменить старые пары.
Levels локальны слою в паре; оригиналы неизменны. Алгоритм ещё не реализован;
подробности UI и вопросы shader/identity — PHOTOS_UI_PLAN.md. Прототип находится
в docs/lighttable/ui-previews и не входит в production bundle.

## 21.10.2026 — интеграция исследовательских профилей

Владелец поручил посмотреть результат соседнего чата, интегрировать его и сделать рабочим в приложении. Это поручение разрешает текущему интеграционному направлению реализовать UI-ALG-001 и объединить проверенный результат; старые запреты остаются ограничениями исследовательского направления, а не блокировкой этой задачи.

- Original/profile 2 остаётся default и эталоном старых пар. Film/3 и Dense/4 — явный выбор текущей пары в Pro, без дополнительных sliders и без изменения прежних controls.
- Выбор оформлен отдельным компактным modal с прозрачным backdrop: изображение остаётся видимым, фоновые действия блокируются. Три варианта сравниваются при одинаковых параметрах. Apply завершает одну RAM-транзакцию/Undo, Cancel/Escape возвращают прежний draft. Сама операция не коммитит metadata.
- Resize, уход в фон и context loss отменяют только незаконченное сравнение. Принятые Apply и предыдущие жесты остаются в RAM; обычный boundary сохраняет их с прежним retry/CAS.
- Profile 4 не становится default: предподготовка до сложения может полностью обнулить слабые тени. Original/Film дают обратимость художественного выбора без изменения originals.
- Shader formulas 3/4 принимаются без переопределения. Не добавлять grain/leaks/masking или отдельный gain gate в UI без отдельной задачи.
- Sites сохраняет origin, owner-private audience и immutable Classic. Pages workflow остаётся без deployment. Сохранённые profiles 3/4 требуют reader этой версии; для отката предпочтителен forward fix, не возврат старого бинарника с очисткой данных.

## 20.10.2026 — v8 становится базой разработки в GitHub main

- Владелец отменил прежний запрет на GitHub: дальнейшая разработка ведётся в `alxktnk-web/Multik`, основная ветка `main`. Это дополнение имеет приоритет над запретами в исторических разделах и плане.
- Проверенный импорт v8 — `4f139e6740641aa25178245d5ad446e6fce7225f`, прямой потомок прежнего main `57ce58e6c9f68c2e81bd8156218426bc347ba695`. Сохраняем обе истории обычным merge, без squash/rebase/force push; прежний main закреплён резервной веткой.
- Workflow `.github/workflows/pages.yml` становится CI без публикации. Удалены upload/deploy Pages и права pages/id-token; проверки тестов и сборки сохранены. Защита выделена в отдельный коммит перед merge, чтобы `git revert -m 1` объединения её не отменял.
- Действующий Sites `/lighttable/`, root Classic, audience и данные браузера не меняются. Это не M10 и не перенос хостинга. PWA использует абсолютные `/lighttable/` URL; размещение на Pages `/Multik/` требует отдельного решения и проверки путей.
- Runtime, зависимости, SW и baseline v8 переносятся без правок. Hardware gate на iPhone остаётся открытым.

## Актуальное дополнение 20.10.2026

Этот раздел заменяет прежние D11/D12, G2/G5 и пункты плана о viewport zoom/always-drag. Default browse: горизонтальный свайп переключает обе плёнки на один слот; move включается миниатюрой слоя, повторным tap или ↔ возвращается browse. Pinch всегда масштабирует выбранный слой (.5–4), viewport неизменен. Одна навигация сохраняет dirty metadata; lift/переключение browse–move не сохраняют. Pro и экспорт сохраняют принятые раньше save boundaries. Подробности нового профиля 2, сохранности данных и ограничения отката — PROGRESS.md.

Приёмка: `npm run test:lighttable:gestures` — native touch browse/move/pinch, zero writes on lift, swipe commit/reload, retry при storage failure, safe library navigation и GPU black/mid/white probes. `test:lighttable:export` проверяет масштабированный слой (1.7×) в tiled/monolithic JPEG. `test:lighttable:workspace` также проверяет возврат к conflict-copy revision 0 без сброса правок. Hardware acceptance на iPhone остаётся открытым.


## Актуальное уточнение владельца — 19.10.2026

Совместимость новой версии со старыми плёнками, проявками, recipes и edits **не нужна**. Владелец разрешил независимую новую версию. M7 отменён; legacy adaptation/parity, copy-on-adopt и наследование старых эффектов не являются условиями выпуска. Эта запись отменяет противоречащие ей D08 и старые разделы плана о legacy. Новые native rolls/manual pairs и их frame-local edits остаются основным потоком. Старый checkout/DB сохраняются как backup, без миграции и удаления. Номер internal branch/DB менять ради названия «третья версия» не требуется.


Статус: решения плана с дополнениями реализации M0–M4. Локальная работа разрешена владельцем; публикация не выполнялась. Не все визуальные детали прошли device review.

## Зафиксированные требования владельца

- Никакого GitHub. Существующий Sites проект, прежний адрес/доступ.
- Фото и правки каждого кадра независимы; нельзя двигать всю проявку от одного жеста.
- Верхний/нижний слой можно двигать рукой; нужны x/y/диагональ, максимальная площадь фото.
- Не сохранять после каждого отрыва пальца. Движения накапливаются до перехода.
- Все настройки скрыты в обычном режиме. Маленькая кнопка Pro, минимальные значки, почти без текста.
- Тёмный тёплый серый вместо чёрного. Приглушённые зелёные акценты, фото важнее chrome.
- Portrait и landscape. Лента результатов в landscape слева; ленты можно скрывать.
- Ручной микс: плёнка A слева, B справа, выбор произвольной пары, перемещение слоёв в центре.
- В новом чистом режиме из декоративных эффектов остаётся регулируемое красное свечение очень ярких объектов.
- Нужны строгая вместимость плёнки и понятное состояние N/N.
- Нужны безопасный откат и подробная передача модели GPT-6.1 Sol.

## Архитектурные defaults

D01. Эволюция: отдельная v2 рабочая поверхность + проверенное ядро, Classic остаётся доступным.
D02. Прямой GPU preview; readPixels только для явных производных/экспорта вне движения.
D03. rAF latest-state + stable canvas; нет render queue на каждый event.
D04. Committed parameters — источник истины, JPEG — производный кэш. Navigation commit не ждёт full JPEG.
D05. v2 DB отдельно, legacy DB version 1 readonly. Adoption только выбранных плёнок с копией blobs, не всей библиотеки.
D06. Пилот /lighttable/ на том же origin. Root baseline и его SW не пересобираются поверх v2 assets.
D07. Новая пара имеет отдельную composition identity, previous pair offsets не наследуются молча.
D08. Существующие кадры наследуют legacy profile; clean profile применяется только к новым manual pairs.
D09. Default blending сохраняет характер двойной экспозиции: сложение линейного света, не CSS opacity/multiply. Для clean профиля начать с unit pass gain, default balance 0 (weights 1/1 через нынешний balanceGains, sum=2), предсказуемого neutral shoulder SDR и отдельной экспозиции. Точный shoulder/white mapping зафиксировать как versioned profile по визуальному M2 review. «Световой стол» — метафора управления, не команда незаметно заменить алгоритм на физическое перемножение прозрачностей.
D10. Новый clean profile выключает grain/dust/leaks/endFog/mottle/vignette/lensSoftness/самостоятельный bloom. Halo threshold per source; небольшая вариация seeded, не меняется от движения.
D11. Одно-пальцевый drag по фото не листает. Перелистывание через rail; hide/show через handle.
D12. В v2 layer tool одним пальцем двигает слой даже при zoom; два пальца всегда управляют viewport. Изменение относительно v1, объяснить при первом device review.
D13. Parameter tool меняет только параметр. XY режим явный и вторым этапом после one-axis.
D14. Отсутствие покрытия слоя открывает другой слой; нет покрытия обоих → чёрный no-exposure участок в итоговой фотографии. UI вокруг кадра остаётся тёплым серым. Не дорисовывать и не auto-crop.
D15. Без обязательного worker/WebGPU/нового framework. Добавлять оптимизации по профилю, а не заранее.
D16. После pointerup только RAM draft. Commit при смене кадра/пары и ранее принятой границе выхода/редактора/экспорта. Crash до границы может потерять текущий draft — скрытый autosave не вводить.
D17. Минимальная типографика не отменяет aria-label, статусы ошибок и понятный overflow review.
D18. Старые rare tools могут временно оставаться в Classic, пока не портированы; не объявлять полный паритет раньше тестов.

## Что проверить/уточнить по устройству, не останавливая подготовку

| Вопрос | Default до уточнения | Когда оценивать |
|---|---|---|
| Модель iPhone и iOS | неизвестны; не выводить из старого ARCHITECTURE.md | M2 hardware run |
| Чувствительность переносов/параметров | матричное 1:1 движение, 70% высоты для полного диапазона параметра | M2/M5 |
| Halo характер/сила/threshold | один версионированный clean profile, стабильный seed | M2 визуальный review |
| Открытый край обоих слоёв | чёрный no-exposure, без auto-fill | M2 |
| Поведение single-finger при zoom | layer drag; pan двумя пальцами | M2 |
| Выгодность более высокого preview tier | 1024 moving, до 1536 idle | M2 hardware |
| XY пары | свет/контраст и halo strength/radius, только явно включённые | M5 |
| Детали home hero и анимаций | concept.png как направление, новые две боковые ленты важнее точного рисунка | M6 |
| Делать ли v2 основной на root | нет | только M10 после отдельного решения |

Если implementation требует отступления: добавить запись с датой, причиной, затронутыми тестами и выбранным вариантом. Не молча менять draft saving, source ownership или baseline доступность ради упрощения.

## Реализация 19.10.2026

- Владелец разрешил M0–M2 в текущей среде. Ограничения локального первого этапа сохранены; новая публикация не выполнялась.
- Рабочее дерево `/workspace/sites/multik-lighttable`, ветка `lighttable-v2`; Classic clean на baseline.
- Clean SDR shoulder v1: `linearRGB / (1 + max(linearRGB))`, затем sRGB transfer; profile version зафиксирован в Composition. Legacy profile не меняли.
- M2 halo: threshold .75 linear, sigma .65 mm, padding 2.4 mm; seeded factor .85–1.15, stable across gesture/resize. Более сложные настройки/кэш — M5.
- Автоматический quality controller и 1536 idle отложены до hardware измерений. Три фиксированных tier API проверены без изменения сцены.
- M2 ограничен in-memory ручной парой. Persistent composition validation/CAS, legacy placements и durable import принадлежат следующим этапам; типы M2 не объявляются окончательной schema для старых данных.
- Подтверждено устройство: iPhone 16 Pro. iOS пока неизвестна.

## Реализация M3–M4, 19.10.2026

- Продолжение разрешено владельцем; iOS сообщена как «27.01», сохранено буквально.
- Отдельная DB `multik-lighttable` v1. Native import jobs при ошибке/отмене очищают только свою незавершённую staging область; прерванная legacy adoption остаётся resumable и может быть явно удалена в библиотеке.
- При конфликте CAS предлагается новая project/composition copy. Ни last-write-wins, ни автоматический reload/потеря RAM draft.
- Пока отсутствует gallery/export, derivatives новой композиции не генерируются. Ленты показывают source thumbnails, подготовленные при импорте.
- GPU cache 24 MiB, immutable asset id/revision + source geometry + fixed halo profile key. Active и pending sources pinned. Radius/threshold при M5 должны войти в ключ.
- Без предварительного декодирования всей плёнки. Недавние выбранные sources кэшируются; speculative prefetch пока не включён. Native rolls <=36; полноценная DOM virtualization аномально длинных legacy rolls остаётся ограничением.
- Закрытие Pro не является отдельной save boundary. Открытие Pro, библиотеки, выход и смена пары фиксируют dirty metadata согласно плану. Rotation закрывает Pro, чтобы сразу можно было двигать слой.

## Реализация M5–M6, 19.10.2026

- Новые эффекты добавлены к schema 1 с нейтральными defaults (contrast 1, haloRadius .65, haloThreshold .75). При чтении старой записи возвращается нормализованная копия; IDB version остаётся 1. Валидация отвергает NaN/out-of-range новых полей.
- Radius/threshold хранятся в Composition, но не дублируют source image в cache. Derived halo имеет отдельную signature; проверяется при draw. GPU mask + ping-pong textures остаются с source и входят в LRU 24 MiB. Это осознанное уточнение требования «расширить cache key»: независимая derived signature даёт invalidation без повторного image upload и texture allocation при каждом движении. Padding увеличен до 4.8 mm (3 sigma при radius 1.6).
- One-axis сначала проверены unit tests; XY добавлены явно отдельными значками. Y: exposure/halo strength, X: contrast/halo radius. Нет неявной второй оси у one-axis. Keyboard arrows и два native range обеспечивают альтернативу XY.
- Contrast применяется после SDR shoulder как positive peak curve относительно .18 с сохранением RGB ratios; neutral 1 сохраняет прежний clean mapping. Старые Classic эффекты этим не заменяются.
- В M6 hero показывает две source preview cards последнего проекта. Точный derivative композиции потребовал бы M8 renderer/export jobs; не имитируем его CSS blend. При отсутствии проектов home показывает абстрактные стеклянные плёнки. App стартует с home только при отсутствии lastProject.
- Изменения локальны. M6 hardware/owner review, M7–M10 и публикация остаются открыты.

## Реализация M8 — экспорт

- Один WebGL context: foreground scheduler приостанавливается на время явного export job. Экспорт получает immutable composition snapshot и оригинальные blobs, отдельно от preview textures/viewport. Видимый canvas не меняется.
- Оригиналы decode/upload/close последовательно. Источники подготавливаются по размеру выбранного выхода (2000/4000 px), не из 1024 px preview. Halo masks рассчитываются один раз на весь source; tiles используют общие screen→film/source matrices и абсолютный output origin, поэтому halo не обрезается границами tiles.
- По умолчанию output GPU tile 1024×1024. Полный JPEG собирается в 2D canvas, readPixels/putImageData/encoding разрешены только внутри этого явного job. JPEG quality .95, thumbnail 320 px quality .85. 90° metadata учитывается; pinch/pan и chrome в export не входят.
- Экспорт временно допускает до 160 MiB tracked GPU allocations, включая retained foreground; interactive limit 96 MiB не меняется. CPU output/raw/decoder/browser memory в эту цифру не входят. Нет обещания 4000 px на iPhone до hardware проверки; allocation failure выдаёт явную ошибку/вариант 2000 px, без тихого уменьшения размера.
- Result file остаётся в RAM до замены/dispose и доступен через отдельный свежий Share tap/download. Thumbnail хранится по project id с compositionId/revision; home использует её только при совпадении последней пары и revision. Quota error thumbnail не уничтожает готовый JPEG. Никакого autosave/encode на lift.

## M9 PWA / подготовка без публикации

- Явное согласие владельца продолжить подготовку PWA; текущий цикл локальный. Существующий адрес/audience не менялись.
- Независимые id/scope `/lighttable/` и CacheStorage prefix `multik-lighttable:<scope>:`. Classic worker/cache не пересобираются. v2 install атомарен; разрешены только ожидаемые MIME, canonical same-origin responses. Redirected body пересоздаётся до CacheStorage/respondWith для Safari.
- Cache-first только для полного перечня статических файлов текущей сборки. Никакого wildcard app-shell fallback для missing JS/login/recovery. При cache miss auth redirect возвращается как redirect навигации, а не кэшированный login; login HTML вместо JS отвергает установку. Фото и metadata остаются в собственной IDB.
- Waiting worker активируется только по явному tap после canUpdate + metadata boundary. Нет автоматического reload на controllerchange от другой вкладки. Текущая сборка не имеет lazy chunks; прежняя открытая вкладка продолжает уже загруженный код после claim. При будущем code splitting нужно отдельно обеспечить доступность старых chunks.
- Recovery работает только с точным scope и prefix новой версии. Root и sibling registration/cache, localStorage и IndexedDB не удаляются. recovery HTML не precached и требует сеть.
- Dual assembly берёт сохранённый production.tar.gz (вместе с его root assets/SW), проверяет byte identity 13 root files и добавляет Lighttable. Output `dist-combined/`; baseline archive можно передать positional argument в scripts/lighttable-assemble.mjs при переносе workspace.
- Реальная owner-private auth/Safari/offline-on-device проверяется после пилотного размещения. Local Chromium passing не снимает hardware gate и не означает successful deployment.


## 19.10.2026 — owner feedback after pilot

All remaining UI labels in English; reduce persistent text, warm graphite/glass/sage. App-owned confirmation controls at bottom for one hand. Native iOS picker Done/max-selection cannot be controlled by the web app; enforce and emphasize full/overflow upon returning. Roll name defaults to local import date/time, no invented geolocation. Portrait sources lie clockwise on the same landscape film as landscape sources without cropping or original blob rewrites; preserve already edited pairs. Allow explicit per-pair layer rotation in Pro. Save-to-Photos entry in main bottom/landscape-left dock, auto-prepare after explicit opening, then fresh user-activated Share; iOS Save Image remains a system action.
