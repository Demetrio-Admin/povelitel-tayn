# Стартовый экран и регистрация — v0.29.1

Первый экран теперь знакомит игрока с миром: рисованный лес, ведьма и колдун одного масштаба, Морвен между ними. Вместо описания способностей и служебных строк — название, выбор героя, «Начать приключение» и ссылка входа. Настройки доступны через маленькую шестерёнку.

Форма регистрации использует тёмное дерево и золото из существующей системы игры. Портрет соответствует выбранному герою. На виду только три поля и краткое ограничение длины никнейма; подробности собраны в закрытой подсказке «Как сохранить доступ». Вход оформлен в том же стиле. HTML-ввод, проверка паролей, гостевой профиль, повторный вход, ограниченный доступ и локальные сохранения остаются прежними.

## Сверка с концептом

| Деталь | Реализация |
| --- | --- |
| Лес, фиолетовый сумрак, бирюзовая листва, тёплые фонари | Общая рисованная обложка без интерфейса, 1080×1920 WebP |
| Ведьма слева, колдун справа, небольшой кот между ними | Равный масштаб героев; иллюстрация общая при переключении |
| Золотое название и подзаголовок | Настоящий текст Phaser / Philosopher |
| Две равные кнопки выбора | Родные деревянные кнопки и золотая рамка активного героя |
| Одна основная кнопка и лёгкая ссылка входа | Копия текста концепта совпадает дословно |
| Тёмная форма с портретом, тремя полями и закрытой подсказкой | Настоящий HTML; ввод, автозаполнение и управление паролями сохранены |
| Всё внутри игрового окна | Привязка к canvas и visualViewport; прокрутка внутри формы |

Осознанные отличия: портрет находится внутри карточки, чтобы не обрезаться на малом экране. Используются реальные игровые портреты и существующий painter дерева; тонкая рамка и кнопки не запечены в картинку. После основной кнопки сохранён компактный выбор гостевой игры, регистрации или входа. В горизонтальном режиме сохраняется портретное игровое полотно и появляется внутренняя прокрутка формы. Служебная версия, глава, повторное имя героя и описания способностей удалены из первого экрана.

## Файлы и происхождение

- `public/assets/ui/welcome-cover-v1.webp`: новое фоновое изображение без текста, элементов интерфейса и рамок; встроенный ImageGen, затем подготовка размера и WebP.
- `public/assets/ui/welcome-settings.svg`: векторная шестерёнка для настоящей кнопки настроек.
- Остальной интерфейс — Phaser и HTML/CSS, существующие `addButton` и `paintPanel`.
- Механика аккаунта и серверные функции не изменены; новая SQL-миграция не нужна.

## Prompt: концепт

```text
Use case: ui-mockup. Asset type: complete mobile fantasy RPG welcome screen and registration form, two portrait 9:16 screens side by side. Redesign the supplied Russian game screenshot, retaining the exact cute painted storybook witch and matching young male warlock from the supplied sprite references. Not a website landing page. A beautiful hand-painted dusk woodland cover fills the entire game rectangle: purple twilight, old twisting trees framing a winding stone trail, soft amber lanterns near a distant forest cottage, teal moonlit plants, a luminous tiny crystal held by the heroes, warm fireflies. Both witch (left) and warlock (right) stand naturally side by side in the middle of the cover, equal scale and height, the same purple costumes, brown hair, pointed hats as supplied references. Small black mentor cat near their feet. Art like polished premium illustrated board game / Wytchwood, coherent with existing game, not realistic, not 3D, no anime makeover. Quiet dark negative space at top for title and bottom for native UI. LEFT is full welcome: exact native Cyrillic title "Колдовство" in warm antique gold Philosopher serif at top, subordinate "Магическая RPG", a fine gold ornament divider. No colon. Bottom beneath characters a subtle dark edge fade, small label "Выберите героя", two equal restrained wood/gold selector buttons "Ведьма" and "Колдун" with selected witch fine luminous gold outline (no checkmark). One large native gold/wood CTA "Начать приключение". Below a lightweight text action "Уже играли? Войти". One unobtrusive small gear at top right; no version, no chapter line, no hero description, no stats, no extra card, no repeated hero name, no giant Settings button. RIGHT is registration over the same cover: compact single elegant dark wood panel with fine antique gold edge and two restrained gold corners, surrounded by visible cover art. Top small real witch portrait medallion, heading "Создать аккаунт", one short subline "Ваше имя в мире магии". Native HTML form fields with labels "Никнейм", "Пароль", "Повторите пароль"; field placeholders "Имя персонажа", "От 8 символов", "Ещё раз"; subtle eye icons for passwords. Only brief nickname helper "3–20 символов". Wide CTA "Создать аккаунт" and lightweight "Назад" at bottom. Small secondary disclosure "Как сохранить доступ" below fields, collapsed; no alarming paragraph filling the form. X close top right. Fully confined within game portrait canvas, touch-sized controls and readable Cyrillic. All UI typography/forms/buttons will be implemented as real code-native Phaser/HTML, never bake interface text into the production art; request a feasible composition. No fake metrics, badges, pills, extra copy, battle scenes, portals, new story claims or other navigation. Preserve existing gold wood material vocabulary but much more intentional spacing, hierarchy and restrained details.
```

## Prompt: производственная иллюстрация

```text
Use case: background-extraction / illustration-story. Production background asset for a portrait 720x1280 Phaser game welcome screen. Use the LEFT panel of the supplied concept as the exact visual design reference. Deliver one standalone portrait 9:16 painted cover illustration, ideally 1440x2560, edge-to-edge, no side-by-side comparison. Preserve precisely the same witch on left, equal-height young male warlock on right, black cat in between, their faces, purple hats with orange leaves, purple capes, amber hair, brown boots, and softly lit winding stone trail. Preserve the dark twisting forest tree arch, amber lantern on left, distant cottage on right, moon, autumn purple foliage, teal foreground plants, delicate fireflies, and same magical storybook painting style. Both heroes' feet around 62% image height, hats around 31%; the black cat lower between them. Preserve peaceful dark sky behind future title in top 6-22%; forest foreground with quiet dark natural vignette behind future controls in bottom 69-98%. Remove ALL interface content from the concept: no words, no letters, no numbers, no title, no subtitle, no buttons, no frames, no gear, no portraits, no input boxes, no divider ornaments, no selection UI, no rectangular patches or borders. Seamlessly paint the original forest behind removed interface areas. No registration panel, no duplicated second screen. This is only the background art; all text and controls are real HTML/Phaser layered later. Preserve original composition and colors with enough dark negative space for readable gold overlay text, do not make a brighter washed-out version. NO TEXT OF ANY KIND. Keep a full painterly composition, not a screenshot cropped from a mockup.
```

