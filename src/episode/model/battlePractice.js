// Short lessons use the real battle model. Borrowed powers never enter the adventure save.
import { HERO, WOLF, MOVES } from './combat.js';

const foe = (id, name, hp, texture, extra = {}) => ({ ...WOLF, id, name, hp, texture, idle: [1.8, 2.1],
  actions: { bite: { name: 'Удар', windup: 1.2, dmg: 7, weight: 1 } }, ...extra });
const preset = (id, name, moves, why) => ({ id, name, moves, why });
export const PRACTICE_LESSONS = [
  { id: 'basics', title: '1. Как проходит бой',
    goal: 'Выбери чары заранее. Во время боя ведьма действует сама.',
    enemyHint: 'Небольшая тварь без брони. Здесь можно спокойно освоиться.',
    enemy: foe('practice_critter', 'Лесная тварь', 90, 'enemy_frost_critter'),
    moves: ['throw', 'flame', 'ward'],
    presets: [preset('attack', 'Бросок + Пламя', ['throw', 'flame'], 'Два атакующих приёма. Ведьма сама чередует их и восстанавливает ману.'),
      preset('safe', 'Пламя + Тёплый щит', ['flame', 'ward'], 'Огонь атакует, щит пригодится перед сильным ударом. Против этой твари он почти не нужен.')],
  },
  { id: 'combo', title: '2. Соединяем силы',
    goal: 'Попробуй Удержание + Пламя: Огонь по скованной цели сильнее.',
    enemyHint: 'Корневик готовит тяжёлые удары. Удержание останавливает его и помогает Огню.',
    enemy: foe('practice_rootling', 'Упрямый корневик', 170, 'enemy_rootling', { actions: {
      bite: { name: 'Удар корнем', windup: 1.2, dmg: 9, weight: 1 },
      leap: { name: 'Тяжёлый удар', windup: 1.7, dmg: 18, weight: 1 },
    } }),
    moves: ['throw', 'hold', 'flame'],
    presets: [preset('combine', 'Удержание + Пламя', ['hold', 'flame'], 'Сначала сковать, затем ударить Огнём. Это сочетание ведьма выполнит сама.'),
      preset('direct', 'Бросок + Пламя', ['throw', 'flame'], 'Прямые атаки без контроля. Можно сравнить время и полученный урон.')],
  },
  { id: 'armor', title: '3. Подбираем ответ врагу',
    goal: 'У этого духа броня. Астрал снимает её, а Огонь завершает бой.',
    enemyHint: 'Броня поглощает 60% урона, пока её не разрушит Астрал.',
    enemy: foe('practice_guardian', 'Бронированный дух', 170, 'enemy_guardian', { armor: .6 }),
    moves: ['throw', 'flame', 'astral'],
    presets: [preset('pierce', 'Астрал + Пламя', ['astral', 'flame'], 'Снять броню и бить по открытой цели.'),
      preset('direct', 'Бросок + Пламя', ['throw', 'flame'], 'Пройти силой тоже можно, но броня будет поглощать большую часть ударов.')],
  },
  { id: 'defense', title: '4. Когда нужна защита',
    goal: 'Волк бьёт редко, но сильно. Сравни атаку с набором, в котором есть Барьер.',
    enemyHint: 'Готовит опасный прыжок. Барьер смягчает удар; на II ступени отражает часть урона.',
    enemy: foe('practice_wolf', 'Волк-испытатель', 210, 'enemy_frost_wolf', { idle: [1.6, 1.8], actions: {
      leap: { name: 'Сильный прыжок', windup: 1.7, dmg: 32, weight: 1 },
    } }),
    moves: ['throw', 'flame', 'barrier'],
    presets: [preset('guard', 'Барьер + Пламя', ['barrier', 'flame'], 'Ведьма сама прикроется перед сильным ударом, затем продолжит атаковать.'),
      preset('attack', 'Бросок + Пламя', ['throw', 'flame'], 'Больше прямых атак, но без защиты от прыжка. Ошибаться в тренировке безопасно.')],
  },
];
export function practiceOptions(index) {
  const lesson = PRACTICE_LESSONS[index];
  if (!lesson) throw new Error('Unknown practice lesson');
  return { enemy: lesson.enemy, hero: { ...HERO, hp: 110 }, seed: 7,
    powers: { unlockedAbilities: ['telekinesis', 'fire', 'seal', 'curse', 'barrier'],
      telekinesisLevel: 2, fireLevel: 2, sealLevel: 1, curseLevel: 2, barrierLevel: 2 },
    familiar: false, potion: false, amulet: null };
}
export function suggestedLoadouts(learned, enemyId) {
  const has = id => learned.includes(id);
  const candidates = [
    preset('simple', 'Простой набор', ['throw', 'flame', 'ward', 'push'].filter(has), 'Атака, недорогой бросок и доступная защита.'),
    preset('combine', 'Удержать и обжечь', ['hold', 'flame', 'push', 'ward'].filter(has), 'Удержание усиливает Пламя; Толчок прерывает опасные атаки.'),
    preset('curse', 'Порча и пламя', ['hex', 'flame', 'barrier', 'astral'].filter(has), 'Порча ослабляет цель и усиливает Огонь; Барьер прикрывает ведьму.'),
    preset('armor', 'Против брони', ['astral', 'flame', 'barrier', 'throw'].filter(has), 'Астрал снимает броню, затем атакующие чары бьют сильнее.'),
  ].filter(p => p.moves.length > 0 && (p.id === 'simple' || p.id === 'combine' && has('hold') && has('flame') || p.id === 'curse' && has('hex') && has('flame') || p.id === 'armor' && has('astral')));
  const recommended = enemyId === 'forest_spirit' && has('astral') ? 'armor' : has('hold') && has('flame') ? 'combine' : 'simple';
  return candidates.sort((a,b) => Number(b.id === recommended) - Number(a.id === recommended));
}
export const loadoutKey = ids => [...ids].sort().join(',');
export function explainDecision(b, id) {
  if (id === 'focus') return 'Мана заканчивается — ведьма сама восстанавливает её. Тебе ничего нажимать не нужно.';
  if (id === 'barrier' || id === 'ward') return 'Враг готовит опасный удар — ведьма ставит защиту из выбранного набора.';
  if (id === 'astral' && b.enemy.armor > 0) return 'Сначала Астрал: он снимет броню, которая мешает остальным атакам.';
  if (id === 'flame' && b.enemy.held > 0) return 'Цель скована — теперь Пламя ударит сильнее. Сочетание сработало автоматически.';
  if (id === 'flame' && b.enemy.cursed > 0) return 'На цели Порча — она усиливает следующий Огонь.';
  if (id === 'hold') return 'Удержание останавливает врага и готовит цель для более сильного удара.';
  if (id === 'hex') return 'Порча ослабит удары врага и усилит Пламя.';
  if (id === 'push' && b.patch > 0) return 'Хворост горит — ведьма толкает врага в огонь.';
  if (id === 'ignite') return 'Ведьма поджигает хворост: Толчок сможет отправить врага в огонь.';
  return `Ведьма использует «${MOVES[id]?.name || id}» из твоего набора. Остальные приёмы ждут перезарядки или подходящего момента.`;
}
export function practiceFeedback(index, battle) {
  if (!battle.result) return 'Бой остановлен раньше завершения. Повтори его и дождись результата — тогда можно будет сравнить наборы.';
  const s = battle.stats;
  if (index === 0) return 'Вот и весь ввод в бою: ты выбрал чары и нажал «В бой». Ведьма сама атаковала и восстанавливала ману. Нижние значки показывают её приёмы, нажимать на них не нужно.';
  if (index === 1) return s.comboTypes.heldFlame ? `Сочетаний Удержание → Пламя: ${s.comboTypes.heldFlame}. Ты выбрал пару, а ведьма сама выполнила сочетание.` : 'В этом наборе сочетание Удержание → Пламя не сработало. Попробуй взять оба этих приёма и повторить бой.';
  if (index === 2) return s.commands.astral && battle.enemy.armor === 0 ? 'Астрал снял броню. Поэтому остальным атакам больше не мешала защита духа. Так свойства врага подсказывают выбор сил.' : 'Броня оставалась на враге и поглощала урон. Попробуй Астрал + Пламя и сравни результат.';
  return s.commands.barrier ? 'Ведьма сама выбирала момент для Барьера. Сравни полученный урон с набором без защиты: дополнительная атака не всегда полезнее щита.' : 'Ты взял атакующие приёмы без Барьера. Попробуй заменить один из них защитой и сравни полученный урон.';
}
