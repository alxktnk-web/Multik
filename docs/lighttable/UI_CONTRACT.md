# 24.10.2026 — explicit View / Move (supersedes earlier controls)

One left column: Home, View (eye), Move, Levels, Halo, Favorite, Save, Looks.
Undo has no visible button. View closes adjustments, blocks transform gestures,
and saves through the existing boundary; write failure retains the dirty draft.
View swipes browse pairs. Move explicitly enables selected-layer drag/pinch.
Source selection and repeated tool taps retain the selected tool, including Levels.
Both full film strips are visible in landscape, including Library favorites.
Choosing another frame or swiping from a favorite saves its edits then opens the
originating mix; the saved favorite keeps its fixed source pair. Looks is the only
popup. Right edge contains only the active full-height adjustment track.

# 24.10.2026 — approved single-column mockup

Landscape has exactly one left-hand tool column: Home, Undo, Levels, Halo,
Favorite, Save, Looks at the bottom. The right edge holds only the active
Levels/Halo track. Frame selection returns to direct drag/pinch movement;
pressing the active Levels/Halo control again also returns to movement.
No separate Move button, duplicate source thumbnails or check button. Looks
is the sole expandable menu; choosing a profile closes it. Both film strips
remain visible; a Library favorite exposes one fixed source frame per strip
so either layer can be selected without replacing its source.

# 24.10.2026 — orientation owns the editing mode

Portrait is preview-only: browse pairs, rotate composition, favorite and save.
Landscape automatically opens Move / Levels / Halo, with Looks kept separate.
There is no nested Pro or Halo XY/radius/threshold selector. Halo adjusts strength;
Clear intentionally has no halo. Two film strips flank the photo in landscape
and can be collapsed. Frame/layer selection retains the selected tool.
Returning to portrait commits via the existing navigation boundary; failed writes
retain the RAM draft and Undo without exposing edit controls in portrait.
All adjustment tracks retain full available height; no bottom toolbar in landscape.

# 24.10.2026 — direct Save to Photos

The existing save icon prepares a 4000px JPEG and opens native Share directly.
No export dialog, extra preview, Prepare photo, Download or second save button.
If asynchronous work expires Safari user activation, retain the JPEG in RAM
and request another tap on the same icon. The retry must call navigator.share
before any await. Native cancellation is quiet; failed metadata save retains
the draft and must not start sharing. The native sheet still owns Save Image.

# 24.10.2026 — phone review corrections

Home has no information menu. Update is visible only for a waiting worker and
uses the existing save boundary. Film icon opens rolls/mixes. Import actions:
Next Roll, then Expose. Pro uses a sliders icon; landscape options sit under
source thumbnails on the left, full-height adjustment tracks stay on the right.
Portrait Move controls have definite 44px rows to protect the photo viewport.
Save to Photos always exports the supported maximum 4000px long edge, JPEG .95;
there is no size selector or silent 2000px fallback.

# Общее правило точных регулировок — последнее уточнение владельца

Все линейные регулировки максимально длинные: portrait — полная доступная
ширина, landscape — полная доступная высота. Не делить ширину между X/Y/scale
и не сокращать ход шкалы ради кнопок. Кнопки — отдельная область, шкалы рядом
с фотографией, без перекрытия. Правило распространяется на Levels, Move, Pro
и будущие инструменты; целевая область касания минимум 44px.

# 23.10.2026 — adaptive workspace (implementation branch)

This section supersedes older layout rules below. The adaptive workspace shipped in Sites v13; subsequent rules above take precedence.

- Mixes = sessions with rendered covers. Library = liked individual editable
  snapshots, pinned to their two source assets. Removing a heart never deletes
  originals. Conflict copies are ordinary visible Mixes.
- + Mix collects two equal-length rolls, 12 default. Next opens picker II within
  its click, Create mix performs imports. + Roll defaults to 12 on every open.
  Capacity uses 06/12/24/36 buttons. Native iOS source menus remain system-owned.
- Portrait tools sit below the photograph; landscape has side controls only.
  Phone orientation and composition quarter-turn select layout independently.
  Manrope is locally bundled under OFL; icons local SVG; targets at least 44px.
- Edit starts Move. Source thumbnails choose I/II; drag and X/Y/scale controls
  share the same RAM transforms. Levels acts on source Lightness, same math.
  Ruler horizontal below photo in portrait, vertical far right in landscape.
- Check/Escape exit through a guarded commit; Undo reverses recent changes.
  Back saves and opens home. Normal editor has no whole-session Cancel.
  Heart snapshots committed parameters; failed writes leave current draft intact.
  Export is icon-only in workspace and shares existing JPEG/Photos workflow.
- App settings/update/recovery move to home ellipsis. No logo/info in workspace.
- No render formulas changed. Covers use a separate serialized renderer and
  encode only at explicit UI boundaries, never in gesture/update hot paths.

# Интерфейс Multik — договорённости для раздельной разработки

Снимок: 20.10.2026, v8, база `cc5bf66`. Описание сверено с текущим workspace, parameter registry, import/export UI и CSS. Это контракт существующего поведения, а не утверждение о завершённой аппаратной приёмке.

**Чат алгоритма читает этот файл, но не редактирует интерфейс или сам контракт.** Его предложения записываются в [UI_REQUESTS.md](UI_REQUESTS.md). Этот документ может менять чат интерфейса по отдельному заданию владельца, фиксируя дату/решение. Последняя явная инструкция владельца имеет приоритет.

## Реализованное дополнение 21.10.2026 — Edit / Levels / Clear

### Последнее уточнение: упрощение управления

- Browse: swipe листает пары, rails выбирают отдельные кадры; ↔ удалена.
  Edit открывает Move, только внутри Edit видны I/II. Повторный выбор I/II
  не возвращает Browse. Done завершает редактирование. Pinch по-прежнему
  масштабирует выбранный исходник, а не viewport.
- Levels: левая/средняя/правая треть видимой композиции выбирает black/mid/white
  в момент touch-down; вертикальное движение меняет параметр, выбор фиксируется
  до lift. Тонкая draggable шкала без подписей синхронна: снизу в portrait,
  у правого края в landscape. Hit targets 44 px. Второй палец отменяет текущие
  незавершённые Levels и начинает pinch.
- Move / Levels / Looks / Pro — один ряд. В landscape источники и Undo слева
  в нижней панели, инструменты в центре, Cancel / export icon / Done справа.
- Export icon виден и в Browse, и в Edit. Успешный save boundary завершает Edit
  и открывает JPEG; при ошибке checkpoint/draft/Undo остаются в редакторе.
- Library: ＋ сверху, roll cards ниже, без hero/приветствия. Tap выбирает I/II
  для Mix; повторное смешивание открывает последнюю сессию той же пары плёнок.
  Удержание 500 ms или F2/Shift-F10 открывает Rename; движение/scroll отменяет
  удержание. В раскрываемом Saved mixes доступны прежние сессии/конфликтные копии.
- ＋ синхронно вызывает системный multi-image picker (его варианты определяет
  iOS). Отмена пустого picker возвращает библиотеку. После выбора: capacity,
  автозаполненное редактируемое имя, preview grid и Add roll. Импорт показывает
  отдельную progress bar и Importing X of Y; счётчик наполнения и лишние действия
  скрыты до завершения. Ошибки/отмена сохраняют выбранные фото.

Эти пункты заменяют противоречащие им описания жестов/расположения ниже.

Этот раздел заменяет прежние описания Pro и profile modal ниже. Владелец
разрешил реализацию и снял требование миграции старых тестовых данных.

- Edit открывается нижним значком sliders, после прежнего входного boundary.
  Разделы: Levels, Looks, Layers, Pro. Общей тональной коррекции в UI нет.
- I/II выбирают исходник. Levels текущего слоя локальны паре: три точки на
  линейке без legend/чисел/пояснений. Hidden ARIA labels остаются. Тап выбирает
  ближайшую точку, drag меняет её; также работают keyboard и вертикальный
  жест на фото. Portrait шкала снизу, landscape справа; I/II и Undo слева.
- Уточнение 21.10.2026: Levels — black/mid/white входной светлоты CIELAB L*
  (0…1), а не отдельные RGB-кривые. Midpoint отображается в L*=50;
  endpoints сохраняют relative midpoint. Параметры в
  optional layer.levels; отсутствие = identity. Originals не переписываются.
- Looks: Original/2, Film/3, Dense/4, Clear/5. Выбор одним Undo в RAM без modal
  Apply. Clear не применяет автоматические tone/color/halo/gain adjustments;
  ручные Levels и геометрия остаются. Пересвет при сложении клиппируется.
- Layers: move по фото, selected-layer pinch .5–4, 90° layer rotate, Center,
  доступный Scale range. Browse и whole-composition rotate остаются вне Edit.
- Pro: halo strength/radius/threshold, явно выбранный Halo XY, Reset Levels
  текущего слоя. В Clear halo controls disabled, Reset Levels доступен.
- Вход фиксирует checkpoint/history; Undo не уходит за начало текущего Edit.
  Cancel подтверждает Discard changes снизу и восстанавливает checkpoint.
  Done коммитит metadata и выходит только после успеха; повторный Done даёт
  retry при ошибке. No-op и lift не записывают DB. Cancel не меняет originals.
- Во время Edit ленты временно скрыты, их preference не меняется. Навигация/
  библиотека/export закрыты до Done/Cancel; Update также блокируется.
  Ориентация/фон/context loss отменяют лишь незавершённое касание, сохраняют
  завершённые RAM-правки. Убийство Safari до Done может потерять RAM draft.
- SVG Lucide 0.468.0; 44–48 px targets с press state. Снятие pointer ownership
  возвращает controls в доступное состояние; stale pointer сбрасывается на blur.

Реализация и проверки — PROGRESS. Chromium не подтверждает надёжность touch,
производительность или native Share на iPhone.

## Дополнение 21.10.2026 — выбор профиля изображения (история)

По поручению владельца об интеграции алгоритма добавлен Image profile в основной ряд Pro (значок двух кадров). В обычном режиме нового control нет. Остальные существующие инструменты, ranges/defaults и жесты не меняются.

- Компактное окно показывает `Original`, `Film`, `Dense`. Original — прежний profile 2 и default. Film/3 — мягкие света и edge halo, Dense/4 — сильное разделение теней до сложения. Последние два помечены Experimental.
- Выбор немедленно показывает изображение, но остаётся временным сравнением. Прозрачный backdrop не размывает фото. Пока окно открыто, canvas, rails, инструменты, export и update не принимают взаимодействие.
- `Apply` принимает выбор только для текущей пары, одним шагом Undo в RAM. Выбор исходного варианта не добавляет Undo. `Cancel` и Escape отменяют все временные переключения, сохраняя предыдущие правки/историю.
- Resize/orientation, уход в фон и context loss закрывают сравнение с отменой его временного результата. Уже принятый профиль остаётся частью обычного draft.
- Apply не пишет DB; сохранение происходит по прежним boundaries. Ошибка commit оставляет профиль/draft/Undo для повторной попытки. JPEG и derivative cache учитывают выбранную версию.
- Новые пары по-прежнему Original. Никакого массового перевода сохранённых пар в Film/Dense и никакого глобального скрытого preference.

Это отдельная реализация интеграционного направления; правило read-only для исследовательского чата сохраняется.

## Назначение и визуальный язык

- Две плёнки на световом столе; фотография занимает максимум доступного места. Постоянный canvas, непосредственное управление пальцами.
- Тёплый тёмный серый стол `#2c2926`, поверхности `#35312d`, светлый текст `#e6e0d7`, приглушённый sage `#a3b2a0`. Маленькие полупрозрачные стеклянные панели; не превращать весь экран в декоративный эффект.
- Различать фон интерфейса и чёрный участок итоговой фотографии, где оба слоя не покрывают кадр. Цвет стола не входит в JPEG.
- Обычный просмотр чистый, без постоянных слайдеров и названий параметров. Редкие инструменты в компактном Pro.
- Подписи/ошибки/доступные названия UI на английском; пользовательские имена плёнок не переводить. Общение и рабочая документация с владельцем — на русском.
- Safe areas, действия под большой палец, hit targets около 44 px и больше; VoiceOver/keyboard и reduced motion/transparency сохраняются.

## Экраны и основные действия

| Область | Текущее поведение |
| --- | --- |
| Запуск | При сохранённом lastProject восстанавливает рабочую пару; иначе открывает библиотеку |
| Библиотека | Полноэкранный экран: последний микс/hero, стопки плёнок, выбор A/B, сохранённые проекты, добавление и запуск смешивания |
| Hero | Thumbnail результата только при совпадении composition/revision/profile; иначе две карточки источников, без имитации смешивания CSS |
| Верхняя панель рабочего стола | Стрелка в библиотеку Lighttable, wordmark, компактный info |
| Основной dock | Миниатюры I/II для выбора слоя, ↔ просмотра, плюс библиотеки, поворот всей композиции, Save to Photos, Pro |
| Pro | Группы света и halo, move layer, поворот выбранного слоя, Undo, центрирование; дополнительный ряд появляется по выбранной группе |
| Info | Краткая помощь, состояние PWA, явное Update, scoped recovery |
| Import/Export/Info sheets | Прокручиваемое содержимое и закреплённые снизу подтверждения/закрытие |

Save находится в нижнем dock в portrait и в левом dock в landscape. Undo в текущей v8 находится внутри Pro; не переносить его в рамках алгоритмической задачи.

## Жесты и режимы

| Состояние/действие | Результат |
| --- | --- |
| Обычный browse, горизонтальный свайп по фото | Обе плёнки переходят на один слот циклически; dirty-пара сохраняется перед переходом |
| Вертикальный жест в browse | Не листает пары |
| Нажатие миниатюры I/II в dock | Выбирает слой и включает его движение x/y |
| Повторное нажатие активной миниатюры в move | Возвращает browse |
| ↔ | Возвращает browse, закрывает Pro |
| Drag в move | Свободный x/y/диагональный перенос только выбранного слоя; скорость не переключает режим |
| Pinch | Масштабирует только выбранный слой 0.5–4×; viewport не увеличивается |
| Второй палец во время drag | Отменяет только текущий незавершённый drag; законченные жесты остаются |
| После первого lift из pinch | Оставшийся палец ждёт нового жеста, не продолжает неожиданное редактирование |
| Pointer cancel/resize | Отмена текущего незавершённого жеста с сохранением предыдущего RAM draft |
| Открытие Pro | Сначала metadata boundary, затем редактирование |
| Закрытие Pro | Browse; закрытие само не сохраняет |
| Выбранный one-axis инструмент | Вертикальное движение меняет его параметр; горизонтальная ось ничего не назначает |
| Явный XY-инструмент | Две назначенные оси меняются одним жестом; один Undo возвращает обе |

Один законченный жест — один Undo. Простой tap/no-op не создаёт правку. Нельзя превращать медленный свайп в перемещение или pinch в общий zoom просмотра.

## Ленты, геометрия и ориентация

- Portrait: две горизонтальные ленты внизу, dock ниже. Landscape: плёнка A слева, B справа, композиция между ними, dock у левого края.
- Native scroll ленты не меняет выбранный источник; tap выбирает фотографию. Последняя выбранная сторона становится активной.
- Handle скрывает/раскрывает ленты; предпочтения видимости раздельны для portrait и landscape.
- Поворот телефона меняет раскладку, но не пару, правки или ориентацию самой композиции.
- Поворот всего кадра на 90° доступен с основного dock, без входа в Pro. Меняет ориентацию preview/export метаданными, не переписывает originals; закрывает Pro.
- Отдельный поворот выбранного слоя находится в Pro. Перемещение/масштаб/поворот каждого слоя локальны для пары.
- Новые portrait-источники размещаются повёрнутыми по часовой стрелке на общей landscape-плёнке; без растяжения, обрезки и перезаписи оригиналов. Существующие сохранённые правки не сбрасываются.
- Пустые области не дорисовываются, скрытого auto-crop нет.

## Контракт существующих инструментов

Источник значений: `src/lighttable/model/parameters.ts` и `effectDefaults` в `model/types.ts`. Чат алгоритма не меняет эти диапазоны, defaults, шаги, labels или назначения движений.

| ID / английское имя | Диапазон | Default | Шаг доступного control | Шкала |
| --- | --- | --- | --- | --- |
| `exposure` / Exposure | −2…2 EV | 0 | 0.1 | Линейная |
| `balance` / Film balance | −2…2 | 0 | 0.1 | Линейная |
| `contrast` / Contrast | 0.5…1.5 | 1 | 0.05 | Линейная |
| `halo` / Halo strength | 0…1 | 0.35 | 0.05 | Линейная |
| `haloRadius` / Halo radius | 0.2…1.6 мм | 0.65 | 0.05 | Логарифмическая при drag |
| `haloThreshold` / Highlight threshold | 0.5…0.95 linear | 0.75 | 0.025 | Линейная |

- Движение вверх увеличивает выбранный параметр. Полный диапазон соответствует примерно 70% высоты рабочей области; изменение относительно начала касания, с clamp и deadzone.
- `lightXY`: X — contrast, Y — exposure. `haloXY`: X — radius, Y — strength. Оба режима выбираются отдельным значком.
- Indicator осей небольшой; native range служит доступной keyboard/VoiceOver-альтернативой, а не постоянной панелью поверх фото.
- Во время активного касания смена инструмента блокируется.
- Нулевая сила halo выключает его полностью. «Halo strength» не становится скрытым регулятором grain, общего bloom или баланса слоёв.

## Правки, сохранение и ошибки

- Пара определяется project/rolls/assets/revisions и порядком A/B. Возврат к паре возвращает её собственные параметры.
- Движения копятся в RAM. **Pointerup не пишет IndexedDB и не создаёт JPEG.**
- Границы сохранения dirty metadata: смена пары/кадра, переход в библиотеку, вход в Pro, явное открытие экспорта и безопасное применение обновления PWA.
- No-op не создаёт revision. Закрытие Pro и переключение browse/move сами не сохраняют.
- При quota/transaction failure навигация не проходит, draft и Undo остаются, доступен retry. При CAS-конфликте есть явный `Save a separate copy`; нельзя молча перезагрузить или перезаписать чужие правки.
- Убийство Safari до boundary может потерять незаписанную RAM-правку. Скрытый autosave не добавлять.
- Original blobs и данные прежних версий не удаляются ради восстановления. Очистка Safari не является способом штатного обновления.

## Импорт

- Вместимость 6/12/24/36. Новое имя автоматически берётся из локальной даты/времени и редактируется; место съёмки не выдумывается.
- Постоянный счётчик N/N и индикатор заполнения; при лимите — `Roll full`, плюс и input отключены, обработчик также проверяет лимит.
- При избытке — `Remove X`, заметные лишние кандидаты, ручное удаление; никакого молчаливого выбора первых N или потери прежних кандидатов.
- При повреждённом файле можно исправить выбор и повторить. Подготовка последовательная и отменяемая.
- Подтверждение/закрытие внизу собственного sheet. Системные Done/ограничения выбора iOS Photo Picker контролируются iOS.

## Save to Photos и JPEG

- Явное открытие Save фиксирует metadata и запускает подготовку. Кнопки доступны снизу sheet.
- Выбор 2000/4000 px; landscape 2000×1500 / 4000×3000, portrait с переставленными сторонами после поворота.
- JPEG соответствует композиции: тот же профиль, blend, halo, seed, source transforms и ориентация. CSS chrome/стол/viewport не запекаются.
- После подготовки отдельный tap `Save to Photos` вызывает системный share sheet, если браузер поддерживает file sharing. На iPhone пользователь выбирает `Save Image`. `Download` — отдельная альтернатива.
- Отмена/отказ share не теряет файл; доступен повтор. Во время подготовки доступны статус и отмена. Ошибка thumbnail не уничтожает готовый JPEG.
- Никакой фоновой полноразмерной проявки на каждом жесте или перелистывании.

## PWA и ограничения

- Рабочий адрес: https://multik-photo-room.alexanderhot.chatgpt.site/lighttable/ . Classic остаётся на `/`.
- Новая и старая PWA имеют отдельные scope/cache/DB. Изменение адреса не переносит фотографии.
- Update применяется явным действием после безопасной границы; без перезагрузки во время жеста/import/export. Recovery не удаляет IndexedDB.
- Изменения алгоритма не дают права менять hosting, SW, manifest, аудиторию, корневой адрес или публиковать сайт.
- iPhone 16 Pro, iOS сообщена как «27.01»: реальный Photos, HEIC/HDR/P3, производительность, нагрев и resume ещё требуют device review. Chromium не подтверждает эти свойства.

## Передача между направлениями

Чат алгоритма отвечает за цвет/свет/halo и соответствие preview/JPEG. Чат UI отвечает за controls, жесты, экраны и их интеграцию с API алгоритма. Предложения не становятся автоматически принятыми требованиями.

Изменять этот контракт можно отдельным датированным решением владельца/задачей UI. При принятии UI request указать ID, обновить соответствующий раздел и PROGRESS.md, сохранить исходную мотивацию предложения.
