# Multik — паспорт рабочей базы 25.10.2026

**Метка Git: `baseline-2026-10-25`.** Она фиксирует работающий срез и документацию,
а не обещание безошибочности. Новые баги, уточнения и улучшения ожидаемы: они идут
следующими небольшими изменениями, без передвижения этой метки и без переписывания
приложения целиком.

## Идентичность

| Что | Значение |
|---|---|
| Репозиторий / рабочая ветка | `alxktnk-web/Multik` / `main` |
| Runtime исходники | `c771eb896204b96e3dbf52e37f6d09614c69bb0d` |
| Последняя запись публикации до аудита | `46b5ccb` |
| Baseline tag | `baseline-2026-10-25`, указывает на документационный commit; runtime относительно c771eb8 не изменён |
| Live | https://multik-photo-room.alexanderhot.chatgpt.site/lighttable/ |
| Sites source | `ceadb615c02fef5ecc044a63363545b7bc564e57` |
| Deployment | `appgdep_6ade1e444ca08191b6549ea778f2c25e`, succeeded 25.10.2026 15:20:46 UTC |
| Saved Sites version | `appgprj_6ad0be6c39f48191b3dad11c00502dc4~appgver_0a7e41304b408191ba7e7d4505885fcc` |
| Access / origin | существующий owner-private Sites, не GitHub Pages; адрес не менялся |

Метаданные публикации получены при успешной native Sites операции. Эта фиксация
не создаёт новую публикацию приложения. Git-тег сохраняет исходники/документы,
но **не** содержимое пользовательской IndexedDB.

## Что считается контрактом

[PRODUCT_SPEC](PRODUCT_SPEC.md) — функции и обязательное поведение;
[UI_CONTRACT](UI_CONTRACT.md) — актуальные экраны, управление и реальные screenshots;
[ARCHITECTURE](../../ARCHITECTURE.md) — карта реализации;
[ACCEPTANCE](ACCEPTANCE.md) — инварианты и процедура проверки;
[KNOWN_ISSUES](KNOWN_ISSUES.md) — ограничения/непроверенное.
[AGENTS](../../AGENTS.md) и [TRANSFER](../../TRANSFER.md) объясняют, как продолжать.

Исторические планы и нижние записи журналов объясняют происхождение решений,
но не являются параллельной действующей спецификацией. Новое явное решение владельца
может изменить базовый контракт — в таком случае обновляются код, соответствующий
раздел документации и проверки, а исходная метка остаётся прежней.

## Свежая проверка 25.10.2026

Окружение: Node22, Vite/Vitest/Playwright из lockfile, Linux Chromium `/usr/bin/chromium`,
GPU через SwiftShader. Тестовые изображения синтетические, данных владельца нет.

| Проверка | Результат |
|---|---|
| `npm test` | PASS, 109 tests / 8 files |
| `npm run build` | PASS, tsc + production dual artifact, 13 Classic files byte-identical |
| orientation | PASS: обе ориентации, геометрия при смене инструментов, сохранение/ошибка записи, поворот |
| viewer | PASS: отдельные пространства, draft/reload, короткий tap/clean swipes; тот же сценарий запущен с дополнительными screenshot-снимками |
| levels-landscape | PASS: все3 точки, независимость, persistence/reload, zero IO through lift, no Levels pinch |
| favorites | PASS: immutable variants, concurrent dedup, working draft, unlike/Undo, transaction failure/retry |
| import | PASS: default12/capacity/overflow/progress/native picker request/wizard/retry |
| levels GPU | PASS: Clear linear oracle, CIELAB L*, 40 colored probes |
| export (profile2) | PASS: tiled/monolithic, snapshot/cancel, 4000px, 20-export plateau, direct Share/retry/cancel, context-loss |
| PWA полный production harness | Не заявляется свежий PASS; устаревший выбор режима в тесте, см. ACCEPTANCE |
| Реальный iPhone | Не завершена формальная приёмка; обратная связь владельца — рабочая версия в целом удобна, будущие ошибки ожидаемы |

Снимки в [baseline-2026-10-25/screenshots](baseline-2026-10-25/screenshots/) получены
из настоящего UI. Temporary capture harness добавлял только screenshot-вызовы к
viewer regression и не включён в исходники. Снимки не доказывают iPhone performance.

## Независимое ревью

Отдельный агент без контекста реализации проверил runtime read-only. Подтверждённых P0/P1 в проверенных путях не обнаружено. Результаты:
[BASELINE_CODE_REVIEW](BASELINE_CODE_REVIEW.md). Подтверждён P2: после ухода с
изменённого Library-варианта рабочий draft остаётся в IDB, но не имеет отдельного
входа из галереи; пока для повторного открытия результата нужно сохранить его
сердцем до ухода. Это явный долг следующего исправления, не удаление исходников.
База сохраняется с этим известным ограничением; она не означает «все дефекты закрыты».

## Продолжение и откат

Обычная работа начинается от актуального main, не от старого тега:

```sh
git switch main
git pull --ff-only
git switch -c fix/short-description
```

Для изучения или восстановления базы без изменения текущей рабочей ветки:

```sh
git fetch origin --tags
git worktree add --detach ../Multik-baseline baseline-2026-10-25
```

Для исправления регрессии обычно предпочтительны отдельный fix/revert commit и
проверки. Не применять `reset --hard`, force-push или очистку IndexedDB как обычный
процесс отката. Репозиторий и Sites live — разные состояния: восстановление
исходников **не** переключает сайт автоматически. Хостинг откатывается к конкретной
сохранённой Sites version с сохранением доступа/origin; браузерные данные при этом
не откатываются. Совместимость данных с выбранным старым кодом проверяется отдельно.
