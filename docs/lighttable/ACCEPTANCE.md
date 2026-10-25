# Multik — приёмка рабочей базы и изменений

Актуально для `baseline-2026-10-25` / runtime `c771eb8`. Старые критерии с Pro,
Done/Cancel и viewport pinch — в [архиве](../history/lighttable-ACCEPTANCE-pre-baseline.md),
они не отменяют нынешнее поведение. «PASS» означает конкретный выполненный тест,
а не отсутствие всех возможных ошибок. Результат этого аудита — [BASELINE.md](BASELINE.md).

## Обязательные инварианты

| ID | Проверяемое поведение | Основная проверка |
|---|---|---|
| A01 | TypeScript/сборка проходят, Classic сохранён byte-for-byte | `npm test`, `npm run build` |
| A02 | Portrait только View; landscape явные View/Move; не двигается canvas при смене инструмента | orientation |
| A03 | Move drag/pinch меняют только выбранный слой; View и Levels не масштабируют | orientation, levels-landscape, unit |
| A04 | Levels — независимый CIELAB L*, neutral identity, midpoint и цвет проверены | levels, levels-landscape, unit |
| A05 | Значения Levels сохраняются при смене инструмента/слоя, навигации и reload | levels-landscape |
| A06 | Движение и отрыв пальца: ноль IDB writes/readPixels/JPEG; запись только на save boundary | levels-landscape; model; favorites |
| A07 | Ошибка commit не теряет RAM-черновик, повтор сохраняет | orientation, favorites |
| A08 | Library swipes только variants, Mixes swipes только pairs; draft/reload/empty/singleton/unlike не меняют смысл | viewer, navigation unit |
| A09 | Тап скрывает/возвращает controls без изменения геометрии; свайп/pinch/longpress/edit tap этого не делают | viewer, gesture unit |
| A10 | Variant immutable; изменённое состояние создаёт новое; unlike + Undo восстанавливают точный snapshot | favorites, unit |
| A11 | Импорт 6/12/24/36, default12, overflow, true progress, retry/cancel без потери оригиналов | import |
| A12 | Rotate90 доступен в editor и portrait, не разрушает другие правки | orientation, unit |
| A13 | JPEG из оригиналов до4000px; snapshot isolation; tiled/monolithic согласованы; Share retry/cancel | export, levels GPU |
| A14 | PWA update/offline не очищает библиотеку и не меняет scope/host | build + аппаратная приёмка; см. долг PWA suite ниже |
| A15 | Никакого удаления оригиналов/сброса базы ради обновления; Like не копирует исходные blobs | favorites, data unit, review |

## Команды и окружение

Node 22; `npm ci --include=dev`. Chromium нужен для browser suites отдельно:
текущие скрипты вызывают **`/usr/bin/chromium`**, Playwright — из devDependencies.
Не обещать универсальный `CHROMIUM_PATH`: не каждый скрипт его поддерживает.
SwiftShader используется для автоматизации GPU, не для измерения скорости телефона.
Запускать из корня репозитория. Некоторые сценарии создают локальный HTTP-server;
в ограниченной среде ему требуется разрешение на сеть/listen.

```sh
npm test
npm run build
npm run test:lighttable:orientation
npm run test:lighttable:viewer
npm run test:lighttable:levels-landscape
npm run test:lighttable:favorites
npm run test:lighttable:import
npm run test:lighttable:levels
npm run test:lighttable:export
```

Каждый сценарий использует тестовый браузерный контекст и fixtures, не библиотеку
владельца. Не запускать разрушительные fixtures в пользовательском профиле Safari.
Для algorithm changes дополнительно проверить нужные Looks через
`LIGHTTABLE_TEST_PROFILE=3` / `4` / `5` у export suite; baseline fresh run не означает
свежий экспортный прогон всех четырёх профилей.

## Что запускать после изменения

| Изменение | Достаточный начальный набор |
|---|---|
| Только документы | Проверка ссылок/статуса, отсутствие runtime diff; не повторять GPU/export без причины |
| CSS, кнопки, навигация | build, unit, orientation, viewer; favorites/import если их экраны затронуты |
| Жесты / Levels | unit, orientation, levels-landscape; GPU levels при изменении математики |
| Хранение / Library | unit, favorites, viewer, levels-landscape; failure/reload/immutable-variant cases обязательны |
| Рендер / экспорт | unit, GPU levels, export затронутых profiles, viewport/layout smoke, тест на iPhone |
| Service worker / хостинг | build, scope/cache/offline/update сценарии и реальный Safari; сначала актуализировать исторический PWA harness |

## Исторические сценарии: не выдавать за актуальную проверку

В package.json сохранены старые workspace/pro/editor/gestures/adaptive/controls/
onehand/browser scripts. Часть ожидает удалённые кнопки и portrait editing; их
нужно читать перед использованием, а не возвращать UI ради зелёного теста.
`test:browser` / `test:pwa` относятся к Classic. `test:lighttable:pwa` проверял
production worker в прошлых релизах, но сейчас его `drag()` не выбирает Move перед
pinch, а современный landscape начинает с View. Полный свежий PASS этого harness
для данной базы **не заявляется**. Требуется отдельная корректировка теста и запуск,
не молчаливое ослабление проверок. Это долг тестовой автоматизации, не доказанный
дефект PWA. Журнал прежних запусков сохранён в PROGRESS/VALIDATION.

## Открытая регрессия для следующего исправления

R01/P2 из [BASELINE_CODE_REVIEW](BASELINE_CODE_REVIEW.md): сохраняемый Library draft
после ухода не имеет UI-входа. Будущий fix должен добавить проверку: изменить
variant → уйти → найти/возобновить draft → reload → значения сохранены, исходный
variant неизменён. Это не пройденный инвариант нынешней базы и не повод очищать IDB.

## Проверка на iPhone

Сделать на iPhone 16 Pro в Safari и установленной PWA; зафиксировать точный номер
iOS, дату и адрес. Ранее владелец сообщил «27.01», не нормализовать его догадкой.

1. Update на главной; имеющиеся фото и Library остаются. Открыть в portrait и landscape, проверить safe areas и доступность крайних кнопок.
2. В Mixes свайпнуть пары; в Library открыть variant и свайпнуть только сохранённые работы. Повторить после Levels-edit, View и перезапуска.
3. Включить Levels, поработать всеми тремя точками на фото и шкале, выбрать второй слой. Фото не скачет, инструмент остаётся, values независимы.
4. Move drag/pinch, View lock, Rotate90; проверить кадры portrait и landscape. Переключение инструментов не смещает canvas.
5. Короткий tap скрывает/возвращает controls. Swipe в чистом просмотре работает; drag/pinch/редакторский tap не скрывает случайно.
6. Сохранить вариант сердцем, изменить, сохранить второй; старый неизменен. Снять лайк в Library, Undo, открыть восстановленный. Повторить в workspace.
7. Импорт12, лишние кадры, отмена и retry. Прогресс понятен, имена редактируются. Системное меню iOS допустимо.
8. Save to Photos → системный Save Image, при необходимости второй tap тем же значком. Сравнить JPEG с предпросмотром: ориентация, границы, Levels, Halo; проверить итоговый размер.
9. После успешного сохранения закрыть/открыть PWA; offline, возврат из background, повторный вход приватного сайта, update. Не очищать данные. Проверить несколько минут жестов, нагрев, память на реальных фото.

Записать PASS/FAIL/NOT TESTED по пунктам и шаги воспроизведения. При ошибке указать
режим, ориентацию, откуда открыто фото, последнюю кнопку и версию приложения;
не просить удалять библиотеку как первый способ диагностики.
