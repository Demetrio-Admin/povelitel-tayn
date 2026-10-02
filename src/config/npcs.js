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
};
