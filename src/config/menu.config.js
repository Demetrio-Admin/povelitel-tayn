// v0.8.2 — пункты раскрывающегося меню (сетка 3×2, порядок важен).
// stub: true — раздел в разработке: нажатие показывает понятное окно и ничего не меняет в игре.
// Настройки — рабочий раздел (окно из ui/SettingsPanel.js).
export const MENU_ITEMS = [
  { id: 'city', label: 'Город', icon: 'icon_city', stub: true, note: 'Здесь появятся магазины и другие городские возможности.' },
  { id: 'bank', label: 'Банк', icon: 'icon_bank', stub: true },
  { id: 'rating', label: 'Рейтинг', icon: 'icon_rating', stub: true },
  { id: 'chat', label: 'Чат', icon: 'icon_chat', stub: true },
  { id: 'forum', label: 'Форум', icon: 'icon_forum', stub: true },
  { id: 'settings', label: 'Настройки', icon: 'icon_settings' },
];

export const STUB_TEXT = 'Раздел в разработке.';
