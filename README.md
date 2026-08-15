# Повелитель Тайн — Codex project

Рабочий проект мобильной/browser fantasy RPG. Текущая реализация — техническая оболочка вертикального среза без фреймворка и production-зависимостей.

## Быстрый запуск

Понадобится Node.js 18 или новее.

```bash
npm run dev
```

Откройте `http://127.0.0.1:4173`.

Исходный `index.html` не требует сборки, но использует JavaScript-модули, поэтому его следует запускать через локальный сервер. Для запуска двойным щелчком используйте готовый `dist/povelitel_tayn_standalone.html`.

## Проверка и сборка

```bash
npm test
npm run build
```

- `npm test` проверяет структуру, обязательный UI, изображения и синтаксис каждого JS-модуля.
- `npm run build` создаёт автономный `dist/povelitel_tayn_standalone.html` со встроенными стилями, кодом и изображениями.

## Структура

```text
Povelitel-Tayn/
├─ AGENTS.md
├─ PROJECT_STATE.md
├─ README.md
├─ index.html                  # только HTML-структура и точка входа
├─ package.json
├─ assets/
│  └─ images/
│     ├─ portraits/           # отдельные production-портреты героев
│     ├─ scenes/              # отдельные responsive-сцены mobile/desktop
│     └─ *.png                # исходные концепты и портретный источник
├─ styles/
│  ├─ main.css                # токены, сцены, раскладка, responsive
│  ├─ buttons.css             # кнопки, состояния и combat abilities
│  └─ modals.css              # модальные поверхности и toast
├─ scripts/
│  ├─ app.js                  # сценарии и обработчики приложения
│  ├─ data/
│  │  └─ game-data.js         # герои и исходные игровые данные
│  ├─ state/
│  │  └─ game-state.js        # состояние и localStorage
│  ├─ ui/
│  │  ├─ buttons.js           # шаблоны и состояние кнопок
│  │  ├─ dom.js               # DOM-утилиты
│  │  ├─ templates.js         # HTML-шаблоны карточек и модалей
│  │  └─ view.js              # рендер экранов и UI
│  ├─ check-build.mjs         # проверка автономной сборки
│  ├─ check-project.mjs       # структурные и синтаксические проверки
│  └─ dev-server.mjs          # локальный сервер
├─ tools/
│  └─ inline-assets.mjs       # standalone-сборщик
├─ docs/
└─ dist/
   └─ povelitel_tayn_standalone.html
```

## Архитектурные границы

- `index.html` описывает семантическую структуру экранов.
- `styles/` отвечает только за визуальный слой.
- `scripts/data/` содержит неизменяемое игровое описание.
- `scripts/state/` управляет изменяемым состоянием и сохранением прогресса.
- `scripts/ui/` создаёт и обновляет интерфейсные компоненты.
- `scripts/app.js` связывает пользовательские действия с состоянием и UI.

Notion остаётся источником продуктовых решений. Ссылки находятся в `docs/NOTION_SOURCES.md`.

## Рекомендуемый Git-чекпойнт

```bash
git init
git add .
git commit -m "Complete modular Stage 7 shell"
```
