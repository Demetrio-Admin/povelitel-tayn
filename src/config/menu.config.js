// v0.8.2 — пункты раскрывающегося меню (сетка 3×2, порядок важен).
// stub: true — раздел в разработке: нажатие показывает понятное окно и ничего не меняет в игре.
// Настройки — рабочий раздел (окно из ui/SettingsPanel.js).
export const MENU_ITEMS = [
  { id: 'map', label: 'Карта', icon: 'icon_city' },   // v0.27.0: карта мира (отправиться можно только у выхода из локации)
  { id: 'bank', label: 'Банк', icon: 'icon_bank' },   // v0.20.0: окно кошелька (сапфиры)
  { id: 'rating', label: 'Рейтинг', icon: 'icon_rating', stub: true },
  { id: 'chat', label: 'Чат', icon: 'icon_chat' },
  { id: 'forum', label: 'Форум', icon: 'icon_forum', stub: true },
  { id: 'settings', label: 'Настройки', icon: 'icon_settings' },
];

export const STUB_TEXT = 'Раздел в разработке.';
