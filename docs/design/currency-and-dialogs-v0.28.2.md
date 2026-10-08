# Валюты и HTML-окна — v0.28.2

## Изображения валют

Обе иконки созданы встроенной генерацией изображений с настоящим прозрачным фоном. Производственные PNG сохраняют размер 64 × 64: существующие размеры HUD, кошелька, сумки и всплывающих значков не меняются. Манифест обновляет версию URL для сброса старого кеша.

- Монета: `public/assets/sprites/icon_coin.png` — объёмная золотая монета с лунным серпом и звездой.
- Сапфир: `public/assets/sprites/icon_sapphire.png` — огранённый синий камень с выраженной глубиной и светлыми гранями.

### Prompt: сапфир

```text
Use case: stylized-concept. Production asset: a single premium-currency SAPPHIRE icon for the Russian mobile witchcraft RPG 'Колдовство'. One elegant deep cobalt-blue faceted oval-cut sapphire, seen in a three-quarter view, tilted slightly to the right, with a substantial dark blue core, luminous royal-blue facets and restrained icy-blue highlights. Beautiful hand-painted fantasy item art, refined watercolor/gouache brushwork, crisp silhouette and carefully modeled facets, matching an illustrated woodland witch RPG with warm bronze and gold interface ornaments. The stone itself is blue with a small clean highlight; no necklace, mount, rim, circle, coin, halo, platform or lettering. Icon must remain clearly readable when downscaled to 28 pixels. Square composition, single large centered stone fills about 78% of canvas, comfortable transparent padding on every side. Actual fully transparent background with clean alpha edges. No cast shadow on a surface, no floating particles, no text, no watermark. This is a standalone in-game sprite, not a screenshot or mockup.
```

### Prompt: монета

```text
Use case: stylized-concept. Production asset: a single GOLD COIN currency icon for a hand-painted mobile woodland witchcraft RPG. One beautiful substantial old gold coin in three-quarter view, tilted gently left, with a clearly visible round face and ridged thick edge. Warm burnished gold, amber shadows, pale golden highlights, subtle handmade irregularities. A simple raised crescent moon with a tiny four-point star embossed on its face, readable and magical. Refined hand-painted fantasy inventory illustration with watercolor/gouache modeling, clean silhouette and rich material depth; coherent with a cobalt-blue sapphire currency icon and warm dark wooden UI panels with fine antique-gold trim. One coin only, not a pile. Square composition; large centered coin fills about 80% of canvas, comfortable transparent padding on every side. Must remain legible at 28 pixels. Fully transparent background with clean alpha edges. No halo, no outer badge or border, no surface or ground shadow, no lettering, numerals, watermark, floating particles or photorealistic scene. This is a standalone in-game sprite, not a screenshot or mockup.
```

## Стиль окон

Используется существующая система игры: `src/config/ui.config.js` и `paintPanel` из `src/ui/uiPaint.js`. Отдельный художественный концепт для этих двух форм не вводится: задача — привести их к уже принятому стилю игровых панелей.

- Тёмное дерево, пергаментный текст, золотая рамка и угловые украшения рисуются тем же painter, что и в Phaser.
- Толщина рамки и рисунок дерева учитывают масштаб игрового полотна.
- Заголовки и поля используют Philosopher; поля сохраняют обычный HTML-ввод, автозаполнение и управление паролем.
- Кнопки имеют деревянную поверхность, основное действие выделено золотой кромкой.
- Длинные имена и девизы переносятся, материал и количество имеют отдельные подписи для доступности.

## Границы и ввод

`src/ui/gameOverlay.js` привязывает окно к пересечению `#game canvas.getBoundingClientRect()` и видимой области браузера (`visualViewport`). При отсутствии canvas используется тот же портретный FIT 720 × 1280. Содержимое прокручивается внутри рамки. Окно следует изменениям размера canvas, экрана и видимой области, а слушатели и наблюдатели снимаются при закрытии.

Tab остаётся в верхнем окне, Esc закрывает его, фокус возвращается предыдущему элементу. На устройстве с сенсорным вводом окно регистрации не вызывает клавиатуру автоматическим фокусом. Кнопка показа пароля имеет текстовую подпись для доступности и сообщает состояние.

## Состав ковена

Существующие действия сохранены: создание, вступление, изменение девиза, роли, сдача материалов, награда и выход. Недельная цель показана полосой прогресса; награда — иконками с количеством и названиями для доступности. Список участников прокручивается вместе с содержимым. Ошибка загрузки списка показывает повторный запрос, а не сообщение об отсутствии ковенов.

Механика, SQL, баланс и пользовательская расстановка карты в этом обновлении не меняются.
