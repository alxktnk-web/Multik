# Multik Lighttable — известные ограничения и открытая приёмка

Срез 25.10.2026, runtime `c771eb8`, документационный `main` до этой работы
`46b5ccb`. Этот список фиксирует подтверждённые ограничения, пробелы проверки
и границы объёма. Непроверенный сценарий не объявляется обнаруженной ошибкой.
База предназначена для практического использования и последующих исправлений;
статус «база» не означает отсутствие будущих багов.

## Подтверждённая находка независимого ревью

**R01 / P2 — нет входа к оставленному Library draft.** Изменить сохранённый вариант,
выйти в View (правки сохраняются в отдельном draft), свайпнуть к другому варианту.
Первый draft остаётся в IndexedDB, но Mixes его скрывает, а Library содержит только
immutable snapshots. После смены last-project/перезапуска нет штатной кнопки,
позволяющей открыть оставленный draft. Оригиналы и сохранённые варианты не удаляются.
До исправления — сохранить желаемое состояние сердцем перед уходом. Следующая
задача: явное восстановление/возобновление рабочих черновиков без изменения
сохранённых вариантов и без смешивания Library/Mixes. Evidence и точные места:
[BASELINE_CODE_REVIEW](BASELINE_CODE_REVIEW.md).

## Текущие ограничения

| ID | Факт и влияние | Статус / источник |
| --- | --- | --- |
| K01 | Последние отчёты не содержат завершённой аппаратной приёмки текущего runtime на iPhone. Реальная точность жестов, native Share → Save Image, Safari/standalone PWA, install/offline/wake/auth, длительная работа и терморежим требуют устройства. | **NOT VERIFIED**. [PROGRESS, 25 октября](PROGRESS.md), [VALIDATION](VALIDATION.md), [ACCEPTANCE, PERFORMANCE](ACCEPTANCE.md). Desktop размеры и mock Share не заменяют проверку. |
| K02 | Принудительное закрытие Safari до успешной границы сохранения может потерять текущую RAM-правку. Готовый Share-файл также хранится в RAM, не является долговременным экспортным backup. | **Ограничение модели**. [navigation.ts](../../src/lighttable/model/navigation.ts), [export-dialog.ts](../../src/lighttable/ui/export-dialog.ts), [DECISIONS, D16](DECISIONS.md). |
| K03 | Максимум пользовательского экспорта — 4000 px по длинной стороне и JPEG quality 0.95. Это рендер из оригинальных Blob в пределах текущего экспортера, без гарантии исходного разрешения/RAW/HDR/P3. Возможна явная ошибка при недостатке ресурсов; скрытого fallback 2000 px нет. | **Реализованный предел**. [export-dialog.ts](../../src/lighttable/ui/export-dialog.ts), [renderer.ts](../../src/lighttable/render/renderer.ts), [DECISIONS, 24 октября](DECISIONS.md). |
| K04 | Async подготовка JPEG может исчерпать Safari user activation. Реализован повтор тем же Save с готовым файлом; итоговое действие Save Image принадлежит native sheet. File Share отсутствует в некоторых браузерах. | **Fallback реализован; iPhone acceptance открыта**. [export-dialog.ts](../../src/lighttable/ui/export-dialog.ts), [PROGRESS, direct Save](PROGRESS.md). |
| K05 | Приложение не управляет системным меню выбора источников, системной Done и жёстким лимитом native iOS picker. Точное число файлов проверяется после возврата в приложение; overflow требует удаления лишних. | **Платформенное ограничение**. [import-roll.ts](../../src/lighttable/ui/import-roll.ts), [import.ts](../../src/lighttable/data/import.ts), [VALIDATION, one-hand interface](VALIDATION.md). |
| K06 | Десять landscape-кнопок укладываются в одну колонку за счёт компактной высоты. Формула `min(44px, (доступная высота)/10)` даёт области меньше 44 CSS px на коротких landscape-экранах. Общая цель ≥44 px не является гарантией для этой компактной колонки. | **Известный компромисс компоновки**. [adaptive.css, последняя landscape-секция](../../src/lighttable/ui/adaptive.css). Удобство на телефоне требует проверки. |
| K07 | Реальные HEIC/HDR/P3/EXIF, 48MP decode и общий пик памяти Safari не подтверждены. Synthetic 12MP JPEG и учёт GPU allocations в Chromium не измеряют browser RSS или нагрев iPhone. | **NOT VERIFIED**. [VALIDATION, M8 / 21 октября](VALIDATION.md), [renderer.ts, allocation report](../../src/lighttable/render/renderer.ts), [assets.ts](../../src/lighttable/render/assets.ts). |
| K08 | Готовый deployment и source rollback не восстанавливают пользовательские фото. Живой hosting rollback и поведение установленной PWA на реальном устройстве не подтверждены текущими browser checks. Очистка Safari data не является способом обновления. | **Открытая эксплуатационная приёмка**. [DEPLOYMENT, rollback limits](DEPLOYMENT.md), [VALIDATION, M9](VALIDATION.md). |

Никакой из этих пунктов не доказывает поломку сохранённых оригиналов,
перезапись Library-варианта или нарушение горячего пути Levels. Последние
зафиксированные browser suites проверяют именно эти свойства; новые
воспроизводимые ошибки должны добавляться отдельно с шагами, runtime и средой.

## Объём, отложенный отдельно

- M10, перевод основного `/` на Lighttable, остаётся отдельным решением;
  нынешний root открывает сохранённый Classic.
- Remote sync и backup пользовательских оригиналов не входят в эту базу.
- M7, совместимость rendering/adoption старых плёнок и проявок, отменена
  владельцем. Старые acceptance-строки не делают её блокирующей задачей.
- Исходное разрешение сверх 4000 px, RAW/HDR export и восстановление
  несохранённого RAM draft не заявлены реализованными возможностями.

Источники: [PRODUCT_SPEC](PRODUCT_SPEC.md), [PROGRESS, этапы/ограничения](PROGRESS.md),
[DECISIONS](DECISIONS.md).

## Как читать исторические документы

В исходном наборе до этой документационной работы есть несовместимые описания.
Они не являются новыми пользовательскими требованиями или доказанными
runtime-багами:

| Историческая запись | Текущее правило / источник |
| --- | --- |
| Старые UI_CONTRACT/PROGRESS: Undo слева, без View/Move; полный strip в Library, смена источника возвращает в Mix. | Верхние записи 24–25 октября: отдельные View/Move, две навигации, фиксированные источники Library, ten controls. |
| ACCEPTANCE, дополнение 20 октября: move через thumbnail, повторный tap возвращает browse, pinch всегда; ранняя матрица: два пальца управляют viewport. | Только Move позволяет drag/pinch слоя; View и Levels не масштабируют. [workspace.ts](../../src/lighttable/ui/workspace.ts), [gestures.ts](../../src/lighttable/input/gestures.ts). |
| ACCEPTANCE: `test:lighttable:pwa` ещё не реализован. | Команда существует в [package.json](../../package.json); результаты и команды нужно сверять с текущей базой. |
| DECISIONS, 23 октября: Check/Undo; старые планы: portrait editing, вложенный Pro, Cancel/Done. | Portrait View; landscape одна колонка с View/Move/Levels/Halo/Looks; Undo membership остаётся отдельным уведомлением 8 секунд. [PRODUCT_SPEC](PRODUCT_SPEC.md). |
| Нижние PROGRESS: favourites не входят в срез, «текущая» версия 10/12, профили ещё не опубликованы. | Верхние записи PROGRESS за 24–25 октября подтверждают неизменяемые варианты Library и runtime `c771eb8`. |
| Старые IMAGE_ALGORITHM: кандидат Film не подключён / не опубликован. | Это этап исследования; нынешний [editor.ts](../../src/lighttable/ui/editor.ts) предлагает Original/Film/Dense/Clear. Художественные сравнения не доказывают device acceptance. |
| README/LIGHTTABLE/старые deployment-инструкции: v12, info → Update, M3 без PWA. | Использовать актуальную точку входа документов и запись релиза; [pwa.ts](../../src/lighttable/ui/pwa.ts) показывает Update лишь для waiting worker. |

При пополнении списка фиксировать: факт или гипотеза, шаги воспроизведения,
ожидание/наблюдение, устройство/iOS/режим Safari или PWA, runtime SHA, наличие
сохранённого draft, доступное evidence и результат проверки исправления.
Не переносить исторический PASS на новую версию без соответствующего запуска;
не объявлять browser PASS аппаратной приёмкой.

## 27 October 2026 — development branch limitations

- Previous runtime does not understand new mix recipes; rollback of code does not roll back IndexedDB and is not established as safe for new projects. Close/update older tabs. Preserve data and use a forward fix if needed.
- Real iPhone/PWA, Photos, offline/update, gesture/memory and full editor integration are NOT TESTED in this environment. Cloud UI harness uses synthetic photos and deliberately does not open the renderer.
- Local Chromium browser suites cannot launch when /usr/bin/chromium is absent. Their results must not be called PASS on that basis.
