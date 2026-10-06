// v0.8 — персонажи. Положение на карте — в world.content.js (INTERACTIVES, kind: 'npc'), реплики — в dialogues.js.
export const NPCS = {
  mirra: {
    id: 'mirra', name: 'Мирра', title: 'Хозяйка дома', texture: 'npc_mirra', color: 0xc9a2ff,
    greetings: ['Мирра поправляет шаль и поворачивается к вам.'],
    wave: true,
  },
  veda: {
    id: 'veda', name: 'Веда', title: 'Травница', texture: 'npc_veda', color: 0x8fe39a,
    greetings: ['Веда отряхивает руки от земли.'],
    wave: true,
  },
  goran: {
    id: 'goran', name: 'Горан', title: 'Охотник', texture: 'npc_goran', color: 0xe8b04a,
    greetings: ['Горан откладывает нож и оборачивается.'],
    wave: false,
  },
  selena: {
    id: 'selena', name: 'Селена', title: 'Дух алтаря', texture: 'npc_selena', color: 0x9fe9ff,
    greetings: ['Свет дрожит — Селена оборачивается к вам.'],
    float: true, // парит над землёй
  },
  // ---- v0.20.0: глава II, город
  ilaria: {
    id: 'ilaria', name: 'Илария Восс', title: 'Архивист', texture: 'npc_ilaria', color: 0x9fb4ff,
    greetings: ['Илария поднимает взгляд от записей.'],
    wave: false,
  },
  // v0.21.0 — маг Льда (глава II, квесты 8–10)
  nerys: {
    id: 'nerys', name: 'Нэрис', title: 'Маг Льда', texture: 'npc_nerys', color: 0x9fe6ff,
    greetings: ['Нэрис стряхивает иней с рукавов.'],
    wave: false,
  },
  // v0.22.0 — доброволец эксперимента и глава Ковена Пепельной Луны
  tikhon: {
    id: 'tikhon', name: 'Тихон', title: 'Доброволец', texture: 'npc_tikhon', color: 0xa8c8e8,
    greetings: ['Тихон кутается в плащ, хотя у котла тепло.'],
    wave: false,
  },
  rowena: {
    id: 'rowena', name: 'Ровена', title: 'Ковен Пепельной Луны', texture: 'npc_rowena', color: 0xe0b48a,
    greetings: ['Ровена кивает, не отрываясь от карты города.'],
    wave: true,
  },
  severin: {
    id: 'severin', name: 'Северин Вейр', title: 'Общество Преображения', texture: 'npc_severin', color: 0x7f9cff,
    greetings: ['Северин откладывает прибор и улыбается — так, будто ждал вас.'],
    wave: true,
  },
  merchant: {
    id: 'merchant', name: 'Борис', title: 'Торговец', texture: 'npc_merchant', color: 0xe8b04a,
    greetings: ['Торговец раскладывает товар и кивает.'],
    wave: true,
  },
  banker: {
    id: 'banker', name: 'Агата', title: 'Хранительница Банка', texture: 'npc_banker', color: 0x6fa8ff,
    greetings: ['Агата закрывает тяжёлую книгу счетов.'],
    wave: false,
  },
  duelist: {
    id: 'duelist', name: 'Кассиан', title: 'Дуэлянт', texture: 'npc_duelist', color: 0xff6a5a,
    greetings: ['Кассиан крутит посох и оценивающе смотрит на вас.'],
    wave: false,
  },
};
