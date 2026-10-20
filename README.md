> Current development base: Multik Lighttable v8 in `main` (20 October 2026), imported from `multik-v8-source` at `4f139e6`.
> Start with [PROGRESS.md](docs/lighttable/PROGRESS.md) and [TRANSFER.md](TRANSFER.md). GitHub Actions verifies tests/build only; it does not deploy. The live app remains on [Sites at /lighttable/](https://multik-photo-room.alexanderhot.chatgpt.site/lighttable/).
> The Classic description below is historical. Current hosting and source rollback instructions are in [DEPLOYMENT.md](docs/lighttable/DEPLOYMENT.md).
> Image-algorithm work starts with [ALGORITHM_HANDOFF.md](docs/lighttable/ALGORITHM_HANDOFF.md). The existing [UI contract](docs/lighttable/UI_CONTRACT.md) is separate; algorithm-driven UI proposals go to [UI_REQUESTS.md](docs/lighttable/UI_REQUESTS.md).

# Multik

Локальное PWA для двойной экспозиции. Фотографии и правки хранятся в IndexedDB на устройстве; обработка выполняется в браузере через WebGL2.

Хостинг: Sites, приватный доступ владельца. Исходники и дальнейшая разработка — в GitHub, ветка `main`. Перенос хостинга не выполнялся.

Адрес сайта: https://multik-photo-room.alexanderhot.chatgpt.site

## Запуск

```sh
npm ci --include=dev
npm run dev
npm test
npm run build
npm run preview
```

Для проверки браузерных сценариев нужен Chromium (Playwright или системный). При необходимости задайте `CHROMIUM_PATH`.

```sh
npm run test:browser
```

Проверки используют отдельный профиль браузера и тестовые фотографии. Снимки экранов сохраняются в `lab-out/review/`; путь можно задать через `CHECK_OUTPUT`.

## Настройка интерфейса

Кнопка «⋯» открывает настройку текущего экрана. В просмотре кадров она находится в меню действий: Customize screen.

- **On screen** — инструмент остаётся на основной панели.
- **In More** — инструмент переносится в раскрывающийся блок More.
- **Hidden** — инструмент скрывается; вернуть его можно через ту же настройку.
- Стрелки меняют порядок; Restore layout возвращает стандартную компоновку.

Настройки хранятся отдельно для библиотеки, новой плёнки, смешивания, просмотра и вкладок редактора. Положение инструментов не меняет обработку фотографий. Изменённые параметры в свёрнутой или скрытой части отмечаются индикатором. При недоступном постоянном хранилище панель явно сообщает, что настройки сохранены только на текущий сеанс.

## PWA

Сборка в `dist/` предназначена для статического хостинга по HTTPS; поддерживается размещение в подкаталоге. GitHub для размещения не требуется. Публикация — отдельный шаг.

Сборщик записывает в service worker список файлов и версию по их содержимому. После завершения первой установки приложение и лаборатория доступны офлайн. Новая версия предлагается на главном экране кнопкой Update available · Restart, чтобы перезапуск не прерывал редактирование. При размещении следует отдавать `sw.js` с проверкой обновлений (`Cache-Control: no-cache`), а отсутствующим ресурсам возвращать 404.

На iPhone: открыть опубликованный HTTPS-адрес в Safari → Поделиться → На экран «Домой».

Данные привязаны к устройству и адресу сайта. Очистка данных браузера удаляет библиотеку; синхронизации и резервного экспорта проекта в этой версии нет. Готовые кадры можно сохранить через системное меню «Поделиться».

## Проверено в этой версии

- TypeScript, production-сборка и 25 тестов вычислительной логики.
- Повторный импорт после ошибки без потери формы.
- Защита исходной плёнки, используемой существующей проявкой.
- Прерывание и продолжение проявки; совпадение JPEG предпросмотра и пакетного рендера при одинаковом разрешении и параметрах.
- Сохранение правок и персональных панелей после перезагрузки.
- Доступность всех ползунков на размерах 375 × 667 и 667 × 375.
- Первый офлайн-запуск, ранее не открытая лаборатория, хостинг в подкаталоге, корректная ошибка отсутствующего ресурса.

Браузерные проверки выполнены в Chromium с программным WebGL. Реальные iPhone/Safari, системный экспорт в Фото и аппаратная производительность 12 MP ещё требуют проверки на устройстве.

Исходная спецификация: [SPEC.md](SPEC.md). Архитектура: [ARCHITECTURE.md](ARCHITECTURE.md).
# Safari PWA recovery

If an older installed version reports “Response served by service worker has redirections”, open `/recover.html` on the same site in Safari. This installs the corrected service worker without clearing IndexedDB photos or layout preferences. Close other Multik tabs before recovery so ongoing work is not interrupted. Recovery needs an internet connection and, for the private site, a valid sign-in.

`npm run test:pwa` checks canonical HTML redirects, offline reopening, expired authentication, and recovery from the originally deployed worker while retaining local data. Real iPhone Safari still needs device verification.

## Frame controls

The editor opens on Mix. Its left Top and right Bottom controls move each film strip independently; Grain is no longer exposed as a control (existing grain settings are retained). Leaks and Halo are shown in the main panel. The Halo button opens Wand directly: tap a bright object, then adjust Tolerance, Strength and Colour. Spot remains available.

The viewer's rotation button turns the complete composition 90° clockwise. Orientation is metadata, so repeated rotations do not recompress the stored JPEG or change the recipe. Viewer thumbnails, the editor, original comparison, halo coordinates and exported JPEGs use the same orientation. Each frame keeps its own orientation; the raw rendering stays in film coordinates.

## Жесты и быстрый сдвиг кадра

В обычном просмотре медленно ведите пальцем по фотографии: выбранная плёнка сдвигается вдоль своей ленты. По умолчанию выбран Top; Bottom переключает на нижнюю плёнку. При повороте кадра направление ленты поворачивается вместе с ним. После первого сдвига кадр остаётся в режиме подвижных слоёв: можно отпускать палец, продолжать движение и переключать Top/Bottom. Правки накапливаются в памяти; отпускание пальца не запускает сохранение. Быстрый свайп или выбор другого кадра в ленте сохраняет итог один раз и переключает кадр. Выход из просмотра, переход в редактор и явный экспорт тоже сохраняют накопленную правку. ↶ отменяет последний сдвиг внутри временной правки. До перехода с кадра перезагрузка страницы теряет несохранённый черновик.

Два пальца увеличивают фотографию в просмотре, редакторе и на экране Mix. При увеличении один палец перемещает область просмотра. Добавление второго пальца во время сдвига отменяет незавершённую правку. Масштаб просмотра не меняет экспорт.

Перед проявкой на главной панели Mix доступны Leaks и Halo. В новых настройках случайные засветки и засветка краёв выключены; при миграции прежняя настройка Leaks сбрасывается в ноль. Свечение ярких объектов остаётся, с воспроизводимой случайной силой для каждого кадра. Halo = 0 выключает автоматическое свечение. Старые проявки сохраняют свои параметры.
