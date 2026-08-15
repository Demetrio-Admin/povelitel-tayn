export const HEROES = [
  {
    id: 'adam',
    name: 'Адам',
    rune: '✦',
    role: 'Маг разлома',
    hp: 100,
    status: [],
    skills: [['rift', 'Импульс разлома'], ['bind', 'Связующая печать'], ['shield', 'Магический щит']]
  },
  {
    id: 'mira',
    name: 'Мира',
    rune: '❧',
    role: 'Следопыт и проклятия',
    hp: 84,
    status: ['Проклятие'],
    skills: [['bind', 'Терновая петля'], ['rift', 'Срыв чар'], ['shield', 'Теневая защита']]
  },
  {
    id: 'garret',
    name: 'Гаррет',
    rune: '♜',
    role: 'Страж отряда',
    hp: 72,
    status: ['Ранение'],
    skills: [['shield', 'Стена щитов'], ['bind', 'Удержание'], ['rift', 'Удар печати']]
  },
  {
    id: 'ellian',
    name: 'Эллиан',
    rune: '✧',
    role: 'Целитель',
    hp: 91,
    status: [],
    skills: [['shield', 'Свет исцеления'], ['bind', 'Тихая молитва'], ['rift', 'Снятие скверны']]
  }
];

export const INITIAL_STATE = {
  screen: 'travel',
  selected: 'adam',
  skill: null,
  round: 1,
  seals: 4,
  threat: 58,
  travelStep: 2,
  busy: false,
  heroStatuses: Object.fromEntries(HEROES.map(hero => [hero.id, [...hero.status]]))
};
