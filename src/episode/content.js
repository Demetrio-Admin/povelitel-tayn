// Расстановка эпизода «Первое пламя» на существующих картах (координаты мира, как в config/world.*.js).
// Лес Мирры: дом на юге → лагерь Горана на восточной тропе → поваленное дерево в узком месте тропы →
// поляна у Лунного алтаря (круг огня, Веда, сбор) → ледяная стена в проходе старой каменной стены.
// Морозный лес: святилище с кристаллом на вершине нарисованной карты.
import { frostwoodPoint } from '../config/frostwood.plan.js';

export const HERO_START = { x: 900, y: 4760 };

const npc = (id, x, y) => ({ id: `ep_${id}`, kind: 'npc', npc: id, x, y, texture: `npc_${id}`, collide: { w: 30, h: 14 }, radius: 115 });

/** Где стоят персонажи на каждом шаге (берётся последнее место, чей шаг уже наступил). */
export const NPC_PLACES = {
  mirra: [{ from: 'intro', x: 860, y: 4790 }, { from: 'ask_fire', x: 1080, y: 2330 }],
  veda: [{ from: 'intro', x: 1440, y: 2430 }],
  goran: [{ from: 'intro', x: 1410, y: 3950 }],
};

export const EPISODE_CONTENT = [
  npc('mirra', 860, 4790), npc('veda', 1440, 2430), npc('goran', 1410, 3950),

  // Телекинез: сухое дерево поперёк северной тропы (в узком месте между елями)
  { id: 'ep_tree', kind: 'ep_drag', x: 1238, y: 2960, texture: 'dead_tree_01', angle: 84, scale: 1.6, center: true, collide: { w: 260, h: 50 }, radius: 190,
    target: { x: 1070, y: 2770 }, targetRadius: 85, restCollide: { w: 150, h: 30 }, fromStep: 'intro' },

  // ледяная стена в проходе старой каменной стены (там, где в главе I лежала глыба)
  { id: 'ep_wall', kind: 'ep_wall', x: 1250, y: 2000, texture: 'ice_wall_01', scale: 1.75, collide: { w: 220, h: 54 }, radius: 220 },
  { id: 'ep_shard', kind: 'ep_pull', x: 1345, y: 2075, texture: 'ice_crystal_node_01', scale: 0.45, item: 'frost_shard', radius: 120,
    gotText: 'Осколок стены: холодный, а в глубине — искра' },
  { id: 'ep_wolf', kind: 'ep_wolf', x: 1250, y: 1925, texture: 'enemy_frost_wolf', radius: 170, fromStep: 'fight', untilStep: 'enter' },
  { id: 'ep_frost_path', kind: 'ep_travel', x: 1250, y: 1915, texture: 'signpost_01', radius: 150, fromStep: 'enter' },

  // круг огня у Лунного алтаря: первая искра и ритуал Проводника
  { id: 'ep_circle', kind: 'ep_circle', x: 1000, y: 2400, texture: 'fire_circle_01', collide: { w: 130, h: 36 }, radius: 150, flameY: 26 },

  // замёрзший сбор Веды: последствие неумелого огня
  { id: 'ep_herbs_1', kind: 'ep_heat', purpose: 'herbs', frozen: true, activeStep: 'herbs', x: 1505, y: 2470, texture: 'herb_bundle_01', scale: 1.5, radius: 110 },
  { id: 'ep_herbs_2', kind: 'ep_heat', purpose: 'herbs', frozen: true, activeStep: 'herbs', second: true, x: 1565, y: 2482, texture: 'herb_bundle_01', scale: 1.5, radius: 110 },

  // смола для ритуала: вытопить огнём (можно пережечь)
  { id: 'ep_resin_1', kind: 'ep_heat', purpose: 'resin', activeStep: 'gather', x: 905, y: 2565, texture: 'resin_log_01', collide: { w: 56, h: 18 }, radius: 110 },
  { id: 'ep_resin_2', kind: 'ep_heat', purpose: 'resin', activeStep: 'gather', x: 1560, y: 2630, texture: 'resin_log_01', collide: { w: 56, h: 18 }, radius: 110 },
  { id: 'ep_resin_3', kind: 'ep_heat', purpose: 'resin', activeStep: 'gather', x: 1500, y: 2195, texture: 'resin_log_01', collide: { w: 56, h: 18 }, radius: 110 },

  // лунная трава
  { id: 'ep_moon_1', kind: 'ep_gather', item: 'moon_herb', x: 950, y: 2255, texture: 'moon_herb_01', radius: 95 },
  { id: 'ep_moon_2', kind: 'ep_gather', item: 'moon_herb', x: 1180, y: 2625, texture: 'moon_herb_01', radius: 95 },
  { id: 'ep_moon_3', kind: 'ep_gather', item: 'moon_herb', x: 1620, y: 2355, texture: 'moon_herb_01', radius: 95 },
  { id: 'ep_moon_4', kind: 'ep_gather', item: 'moon_herb', x: 1350, y: 2725, texture: 'moon_herb_01', radius: 95 },

  // фонари: простое пламя (после «Уверенного огня» — одним касанием)
  { id: 'ep_lantern_1', kind: 'ep_heat', purpose: 'lantern', x: 1150, y: 2665, texture: 'lantern_01', radius: 100, flameY: 70 },
  { id: 'ep_lantern_2', kind: 'ep_heat', purpose: 'lantern', x: 1365, y: 2335, texture: 'lantern_01', radius: 100, flameY: 70 },

  // Морозный лес: святилище на вершине
  // нарисованный кристалл святилища: объект без собственной картинки (ghost), только свет и действие
  { id: 'ep_crystal', kind: 'ep_crystal', ...frostwoodPoint(818, 152), ghost: { w: 110, h: 150 }, radius: 210 },
];

/** Украшения и препятствия эпизода (вместо объектов главы, которые здесь не создаются). */
export const EPISODE_DECOR = [
  { id: 'ep_roots', kind: 'decor', x: 400, y: 4120, texture: 'corrupted_roots_01', collide: { w: 210, h: 70 }, radius: 140,
    say: 'Чёрные корни. Западную тропу они держат крепко — но сейчас мне на север, к стене.' },
  { id: 'ep_altar', kind: 'decor', x: 1250, y: 2215, texture: 'lunar_altar_01', collide: { w: 120, h: 36 }, radius: 130,
    say: 'Лунный алтарь. Сегодня он тихий, как перед снегом.' },
];
