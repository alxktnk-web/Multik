# Profile 2 / profile 3: review artifacts

Кандидат не опубликован. Render source: commit `9315887`; base
`0dc89b74d9f6792142769538c7ff285ccf8f9024`. Оба профиля рендерятся одним
`Renderer.present`; 2 дополнительно сравнен с frozen shader базы.

Запуск: `node scripts/lighttable-film-check.mjs`. Генератор пишет новые артефакты
в `lab-out/lighttable/film/`, не перезаписывает этот review snapshot автоматически.
Снимки 1600×1260: вверху исходники A/B, внизу profile 2 / candidate 3.
Labels содержат EV/balance/contrast/halo/seed; точные transforms/snapshots —
[evidence.json](evidence.json). JPEG таблицы предназначены для просмотра;
численные проверки используют GPU readback, не повторно сжатые таблицы.

| Сравнение | Что оценить |
| --- | --- |
| [Ветки / свет / фактура](branches.jpg) | Контраст тонких веток при светлом и тёмном перекрытии |
| [Силуэт / фактура](silhouette.jpg) | Проявление второго сюжета в тёмной фигуре |
| [Портрет / кошка](portrait-cat.jpg) | Кожа, тёмный воротник, блики на шлеме; EV −.5 |
| [Кофе / кошка](coffee-cat.jpg) | Белая керамика, дерево, тёплые насыщенные цвета |
| [Ракета / портрет](rocket-portrait.jpg) | Локальные светильники, тёмное небо, светлый фон |
| [Цветовые и серые поля](patches.jpg) | Светлые ступени и gamut compression |
| [Гало](halo.jpg) | Центр белого emitter и spill за его границей |
| [JPEG кандидата, tiled](candidate-tiled.jpg) | Поворот кадра/слоя, scale 1.7, halo radius 1.6, 1500×2000 |

Фотографии разрешены для использования: [credits, лицензии, исходные SHA](../../../scripts/fixtures/film-photos/README.md).
Пять пользовательских референсов не загружались в Git. Synthetic fixtures —
код этого репозитория. Локальные браузерные originals не менялись.

[Проверки](checks.json) • [Численные результаты](evidence.json) •
[Отсутствие UI/config изменений](scope.json) •
[Формулы, анализ и ограничения](../IMAGE_ALGORITHM.md)

Белый source на чёрном у 3 темнее (231 против 248 при EV=0). Это сознательный
компромисс длинного shoulder, который требует визуального решения владельца.
Chromium SwiftShader не доказывает плавность или точность цвета Safari/iPhone.
