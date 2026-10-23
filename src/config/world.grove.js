// v0.38.0 — глава III «Безымянная роща» (docs/design/chapter-3-story-v0.1.md). Отдельная локация на общем холсте координат:
// свободная полоса между городом (до x 8480) и помещениями города (с x 10200). С юга на север: Сухая балка → Стеклянная опушка
// (ручей Звонец и стеклянная плотина у брода) → Сад под колпаками (корни Ракиты) → Корни Ракиты (стеклянная стена) →
// Сердце рощи (трещина от молнии, кокон с ростком, завеса Ивы, Ракита).
// Стекло — застывшее время: Огонь берёт его только там, где вещам вернули имя; Лёд делает толстое стекло хрупким (дальше бьёт
// Телекинез) и держит трескающийся мост; Астрал читает эхо и рвёт завесы. Всё, что делает игрок, — обычные операции сервера
// (world / event / combat), без новых правил на сервере.

export const GROVE_RECT = { x: 8600, y: 600, w: 1500, h: 5400 };
const G = (lx, ly) => ({ x: GROVE_RECT.x + lx, y: GROVE_RECT.y + ly });

/** Прибытие с карты мира — у указателя в Сухой балке. */
export const GROVE_START = G(380, 5150);
const OPENED = 'ch3_leaf_read';          // роща найдена (стеклянный лист прочитан)
export const GROVE_AWAKE = 'ch3_name_vetla';   // имя духу вернули: стекло тает, роща оживает

// Зоны с севера на юг. Безопасная точка закрытой части — перед её проходом (не за ним).
export const GROVE_ZONES = [
  { id: 'GH', name: 'Сердце рощи', ...G(100, 100), w: 1300, h: 1200, safePoint: G(750, 1420) },
  { id: 'GR', name: 'Корни Ракиты', ...G(100, 1300), w: 1300, h: 950, safePoint: G(750, 2350) },
  { id: 'GG', name: 'Сад под колпаками', ...G(100, 2250), w: 1300, h: 950, safePoint: G(750, 3330) },
  { id: 'GE', name: 'Стеклянная опушка', ...G(100, 3200), w: 1300, h: 1200, safePoint: G(750, 4300) },
  { id: 'GB', name: 'Сухая балка', ...G(100, 4400), w: 1300, h: 900, safePoint: GROVE_START },
];

/** v0.38.0: «пришёл в место» — первый вход в Сухую балку (ExplorationScene.updateZone; условия проверяет сервер). */
export const GROVE_ZONE_EVENTS = { GB: { event: 'ch3_grove_arrived', requires: [OPENED] } };

export const GROVE_GROUND = [
  { tex: 'dry_ground_01', ...G(100, 4400), w: 1300, h: 900 },
];

// Коллизии. 'trees' — стеклянная чаща (деревья-заполнители — decorData.groveForestDecor), 'ruin' с tex — стеклянные заросли и корни,
// 'stream' и 'rift' — невидимые блоки под рисунком ручья и трещины (рисунок — декор пола). Новые блоки — только в конец списка.
const line = (kind, ly, h, gapFrom, gapTo, more = {}) => [
  { kind, ...G(100, ly), w: gapFrom - 100, h, ...more },
  { kind, ...G(gapTo, ly), w: 1400 - gapTo, h, ...more },
];
export const GROVE_COLLIDERS = [
  // края локации — стеклянная чаща
  { kind: 'trees', ...G(0, 0), w: 100, h: 5400 },
  { kind: 'trees', ...G(1400, 0), w: 100, h: 5400 },
  { kind: 'trees', ...G(100, 0), w: 1300, h: 100 },
  { kind: 'trees', ...G(100, 5300), w: 1300, h: 100 },
  // ручей Звонец: брод (640–860) перегородила стеклянная плотина
  ...line('stream', 3170, 60, 640, 860),
  // корни Ракиты: проход (650–850) держат стеклянные корни
  ...line('ruin', 2210, 50, 650, 850, { tex: 'glass_roots_tile', noOutline: true }),
  // толстая стеклянная стена перед сердцем: проход (660–840) — Лёд, потом Телекинез
  ...line('ruin', 1260, 50, 660, 840, { tex: 'glass_thicket_tile', noOutline: true }),
  // трещина от молнии: мост (680–820)
  ...line('rift', 970, 60, 680, 820),
  // завеса Ивы: проход (680–820)
  ...line('ruin', 730, 50, 680, 820, { tex: 'glass_thicket_tile', noOutline: true }),
  // стеклянные рощицы внутри зон — тропа петляет между ними
  { kind: 'trees', ...G(100, 4380), w: 360, h: 140 },
  { kind: 'trees', ...G(1060, 4300), w: 340, h: 160 },
  { kind: 'trees', ...G(100, 3600), w: 120, h: 340 },
  { kind: 'trees', ...G(1280, 3560), w: 120, h: 300 },
  { kind: 'trees', ...G(100, 2600), w: 140, h: 260 },
  { kind: 'trees', ...G(1240, 2820), w: 160, h: 220 },
  { kind: 'trees', ...G(100, 1560), w: 200, h: 220 },
  { kind: 'trees', ...G(1300, 1700), w: 100, h: 300 },
  { kind: 'trees', ...G(100, 160), w: 260, h: 300 },
  { kind: 'trees', ...G(1140, 160), w: 260, h: 300 },
];

/** Проходы рощи: закрыты, пока их не открыл сюжет (для проверок проходимости), и что за ними. */
export const GROVE_GATE_IDS = ['ge_dam', 'gr_roots', 'gh_wall', 'gh_wall_block', 'gh_bridge', 'gh_ward'];
/** Что должно оставаться недостижимым, пока проходы рощи закрыты (проверка проходимости): за плотиной — сад, за корнями — Мирра и эхо,
 *  за стеной, мостом и завесой — кокон, страж и сердце. */
export const GROVE_BEHIND_GATES = ['npc_iva_garden', 'gg_jar_bird', 'gr_echo_vetla', 'npc_mirra_grove', 'gh_cocoon', 'gh_guardian', 'gh_reflection', 'npc_iva_heart'];

// Квесты 2–3 идут в городском Архиве (помещение city_archive, его прямоугольник — city.plan.js): Северин под надзором Иларии и
// стеклянный лист из последнего письма.
const ARCHIVE = { x: 11800, y: 200 };
const archive = (lx, ly) => ({ x: ARCHIVE.x + lx, y: ARCHIVE.y + ly });

const GROVE_OBJECT_LIST = [
  { id: 'npc_severin_archive', kind: 'npc', npc: 'severin', ...archive(620, 1060), texture: 'npc_severin', collide: { w: 32, h: 14 }, radius: 130, requiresEvent: 'ch3_start' },
  { id: 'ch3_glass_leaf', kind: 'seal_sigil', ...archive(600, 730), texture: 'glass_leaf_token', litTexture: 'glass_leaf_token', litTint: 0xe8f6ff, radius: 110,
    requiresEvent: 'ch3_severin_talk', doneEvent: 'ch3_leaf_read', hint: 'Стеклянный лист',
    doneTitle: 'Стеклянный лист', doneButton: 'К карте мира',
    doneText: 'Астрал коснулся листа — и он вздохнул. Ветер в ивах, смех ручья, женский голос: «Не бойтесь. Я вас сохраню». А потом — тишина, такая полная, что заложило уши.\n\n'
      + 'Лист тянется на северо-запад, к роще, которой нет на картах. Теперь она есть на вашей: «Безымянная роща».' },

  // ---- выход на карту мира (один на локацию)
  { id: 'exit_grove', kind: 'exit', ...G(250, 5210), texture: 'signpost_01', collide: { w: 24, h: 10 }, radius: 110, hint: 'Карта мира' },

  // ---- Сухая балка: лагерь Нэрис, ивовая кора, тайник
  { id: 'npc_nerys_grove', kind: 'npc', npc: 'nerys', ...G(1060, 4880), texture: 'npc_nerys', collide: { w: 30, h: 14 }, radius: 140, requiresEvent: OPENED },
  { id: 'grove_camp_cauldron', kind: 'alchemy', ...G(1210, 4950), texture: 'cauldron_01', collide: { w: 66, h: 26 }, radius: 120, requiresEvent: OPENED },
  { id: 'gb_bark_1', kind: 'gather', res: 'willow_bark', amount: 1, respawnSec: 300, ...G(230, 4930), texture: 'willow_bark_node', radius: 90, requiresEvent: OPENED },
  { id: 'gb_bark_2', kind: 'gather', res: 'willow_bark', amount: 1, respawnSec: 300, ...G(1280, 4620), texture: 'willow_bark_node', radius: 90, requiresEvent: OPENED },
  { id: 'gb_bark_3', kind: 'gather', res: 'willow_bark', amount: 1, respawnSec: 300, ...G(560, 4560), texture: 'willow_bark_node', radius: 90, requiresEvent: OPENED },
  { id: 'gb_cache', kind: 'chest', ...G(1300, 5170), texture: 'chest_01', openTexture: 'chest_01_open', collide: { w: 50, h: 24 }, radius: 100,
    requiresEvent: OPENED, reward: { items: { willow_bark: 2, elixir_life: 1 }, coins: 60 }, hint: 'Старый тайник' },

  // ---- Стеклянная опушка: Безымянная, эхо у ручья, искры и листья, плотина у брода
  { id: 'npc_nameless_edge', kind: 'npc', npc: 'nameless', ...G(640, 4060), texture: 'npc_nameless', collide: { w: 30, h: 14 }, radius: 140,
    requiresEvent: 'ch3_nerys_met', hideEvent: 'ch3_iva_met' },
  { id: 'ge_echo_stream', kind: 'seal_sigil', ...G(420, 3330), texture: 'grove_echo_01', litTexture: 'grove_echo_lit', radius: 120,
    requiresEvent: 'ch3_nameless_met', doneEvent: 'ch3_echo_stream', hint: 'Эхо у ручья',
    lockedText: 'Серебряный отпечаток над водой: две девочки у ручья. Не шевелятся.',
    doneTitle: 'Эхо: ручей', doneButton: 'Дальше',
    doneText: 'Астрал оживил отпечаток. Две девочки на берегу пускают кораблики из коры. «Звонец сегодня звонкий — к дождю», — смеётся светловолосая.\n\n'
      + '«Ива, хватит болтать, бабушка ждёт», — тянет её за рукав вторая.\n\nМирра? Совсем девчонка…' },
  { id: 'ge_spark_1', kind: 'gather', res: 'memory_spark', amount: 1, respawnSec: 900, ...G(1240, 3420), texture: 'memory_spark_node', radius: 90, requiresEvent: 'ch3_nameless_met' },
  { id: 'ge_spark_2', kind: 'gather', res: 'memory_spark', amount: 1, respawnSec: 900, ...G(300, 4180), texture: 'memory_spark_node', radius: 90, requiresEvent: 'ch3_nameless_met' },
  { id: 'ge_leaf_1', kind: 'gather', res: 'glass_leaf', amount: 1, respawnSec: 300, ...G(960, 4210), texture: 'glass_leaf_node', radius: 90, requiresEvent: OPENED },
  { id: 'ge_leaf_2', kind: 'gather', res: 'glass_leaf', amount: 1, respawnSec: 300, ...G(1180, 3940), texture: 'glass_leaf_node', radius: 90, requiresEvent: OPENED },
  { id: 'ge_leaf_3', kind: 'gather', res: 'glass_leaf', amount: 1, respawnSec: 300, ...G(330, 3520), texture: 'glass_leaf_node', radius: 90, requiresEvent: OPENED },
  { id: 'ge_dam', kind: 'fire', ...G(750, 3230), texture: 'glass_dam_01', collide: { w: 220, h: 60 }, radius: 140, burnSec: 1.6,
    waitEvent: 'ch3_name_stream', destroyEvent: 'ch3_dam_open', hint: 'Стеклянная плотина',
    lockedText: 'Плотина из стекла перегородила брод. Огонь соскальзывает: ручей не помнит себя — и не меняется.',
    doneText: 'Стекло потекло, как вода, — и стало водой. Звонец снова бежит по камням, а брод свободен.' },

  // ---- Сад под колпаками: колпаки (Огонь — тонкое стекло), Ива, её котёл, эхо у корней, корни Ракиты
  { id: 'npc_iva_garden', kind: 'npc', npc: 'iva', ...G(760, 2640), texture: 'npc_iva', collide: { w: 30, h: 14 }, radius: 140,
    requiresEvent: 'ch3_dam_open', hideEvent: 'ch3_iva_met' },
  { id: 'gg_jar_bird', kind: 'fire', ...G(430, 2800), texture: 'glass_jar_bird', collide: { w: 56, h: 22 }, radius: 120, burnSec: 1.0,
    requiresEvent: 'ch3_dam_open', destroyEvent: 'ch3_jar_bird', hint: 'Колпак с малиновкой',
    doneText: 'Колпак лопнул от жара. Малиновка встряхнулась — и вылетела, не оглянувшись.',
    reveal: { spawnPickup: { item: 'memory_spark', amount: 1, texture: 'icon_memory_spark' } } },
  { id: 'gg_jar_fox', kind: 'fire', ...G(1080, 2780), texture: 'glass_jar_fox', collide: { w: 64, h: 22 }, radius: 120, burnSec: 1.0,
    requiresEvent: 'ch3_dam_open', destroyEvent: 'ch3_jar_fox', hint: 'Колпак с лисёнком',
    doneText: 'Стекло осело тёплой лужицей. Лисёнок чихнул, огляделся — и юркнул в траву.',
    reveal: { spawnPickup: { item: 'memory_spark', amount: 1, texture: 'icon_memory_spark' } } },
  { id: 'gg_cauldron', kind: 'alchemy', ...G(880, 2500), texture: 'cauldron_01', collide: { w: 66, h: 26 }, radius: 120, requiresEvent: 'ch3_iva_met', hint: 'Остывший котёл Ивы' },
  { id: 'gg_spark_1', kind: 'gather', res: 'memory_spark', amount: 1, respawnSec: 900, ...G(300, 3060), texture: 'memory_spark_node', radius: 90, requiresEvent: 'ch3_dam_open' },
  { id: 'gg_leaf_1', kind: 'gather', res: 'glass_leaf', amount: 1, respawnSec: 300, ...G(1300, 2620), texture: 'glass_leaf_node', radius: 90, requiresEvent: 'ch3_dam_open' },
  // v0.40: Сад Ветлы — четыре грядки (проявляются по грамотам, см. recipes.js garden_*); долгий возврат урожая, без боя и без монет
  { id: 'gg_bed_leaf', kind: 'gather', res: 'glass_leaf', amount: 2, respawnSec: 21600, ...G(680, 2760), texture: 'garden_bed_leaf', radius: 100, requiresEvent: 'garden_planted' },
  { id: 'gg_bed_bark', kind: 'gather', res: 'willow_bark', amount: 2, respawnSec: 21600, ...G(800, 2760), texture: 'garden_bed_bark', radius: 100, requiresEvent: 'garden_grown_2' },
  { id: 'gg_bed_spark', kind: 'gather', res: 'memory_spark', amount: 1, respawnSec: 43200, ...G(680, 2870), texture: 'garden_bed_spark', radius: 100, requiresEvent: 'garden_grown_3' },
  { id: 'gg_bed_moon', kind: 'gather', res: 'lunar_shard', amount: 1, respawnSec: 86400, ...G(800, 2870), texture: 'garden_bed_moon', radius: 100, requiresEvent: 'garden_grown_3' },
  { id: 'gg_leaf_2', kind: 'gather', res: 'glass_leaf', amount: 1, respawnSec: 300, ...G(620, 3040), texture: 'glass_leaf_node', radius: 90, requiresEvent: 'ch3_dam_open' },
  { id: 'gg_cache', kind: 'chest', ...G(1320, 2350), texture: 'chest_01', openTexture: 'chest_01_open', collide: { w: 50, h: 24 }, radius: 100,
    requiresEvent: 'ch3_iva_met', reward: { sapphires: 10 }, hint: 'Сундучок под стеклом' },
  { id: 'npc_nameless_garden', kind: 'npc', npc: 'nameless', ...G(1000, 2350), texture: 'npc_nameless', collide: { w: 30, h: 14 }, radius: 140,
    requiresEvent: 'ch3_iva_met', hideEvent: 'ch3_name_willow' },
  { id: 'gg_echo_willow', kind: 'seal_sigil', ...G(500, 2330), texture: 'grove_echo_01', litTexture: 'grove_echo_lit', radius: 120,
    requiresEvent: 'ch3_iva_met', doneEvent: 'ch3_echo_willow', hint: 'Эхо у корней',
    doneTitle: 'Эхо: Ракита', doneButton: 'Дальше',
    doneText: 'Старуха в тёмном платке гладит кору огромной ивы. «Ракита старше меня, старше деревни, — говорит она девочкам. — Пока Ракита помнит своё имя, роща стоит».\n\n'
      + 'Светловолосая девочка прижимается щекой к коре: «Я не дам тебе упасть, Ракита. Никогда».' },
  { id: 'gr_roots', kind: 'fire', ...G(750, 2260), texture: 'glass_roots_01', collide: { w: 200, h: 50 }, radius: 140, burnSec: 1.6,
    waitEvent: 'ch3_name_willow', destroyEvent: 'ch3_roots_open', hint: 'Стеклянные корни',
    lockedText: 'Стеклянные корни перекрыли тропу к сердцу рощи. Огонь соскальзывает: Ракита не помнит себя.',
    doneText: 'Корни отогрелись и ушли в землю — тёмные, живые, как в лесу Мирры. Тропа к сердцу открыта.' },

  // ---- Корни Ракиты: Мирра, эхо последнего мига
  { id: 'npc_mirra_grove', kind: 'npc', npc: 'mirra', ...G(600, 1720), texture: 'npc_mirra', collide: { w: 30, h: 14 }, radius: 130,
    requiresEvent: 'ch3_needle_3', hideEvent: 'ch3_guardian_defeated' },
  { id: 'gr_echo_vetla', kind: 'seal_sigil', ...G(900, 1420), texture: 'grove_echo_01', litTexture: 'grove_echo_lit', radius: 120,
    requiresEvent: 'ch3_mirra_met', doneEvent: 'ch3_echo_vetla', hint: 'Эхо последнего мига',
    doneTitle: 'Эхо: последний миг', doneButton: 'Дальше',
    doneText: 'Белая вспышка. Ракита горит. Юная Ива стоит в огне и прижимает ладони к серебряной тени:\n\n'
      + '«Ветла, не бойся! Я тебя не отдам — ни огню, ни времени!»\n\nТень что-то кричит в ответ, но звук обрывается. Стекло. Тишина.' },
  { id: 'gr_leaf_1', kind: 'gather', res: 'glass_leaf', amount: 1, respawnSec: 300, ...G(260, 1460), texture: 'glass_leaf_node', radius: 90, requiresEvent: 'ch3_roots_open' },
  { id: 'gr_spark_1', kind: 'gather', res: 'memory_spark', amount: 1, respawnSec: 900, ...G(1240, 2120), texture: 'memory_spark_node', radius: 90, requiresEvent: 'ch3_roots_open' },

  // ---- Четыре замка: стеклянная стена (Лёд → Телекинез), мост над трещиной (Лёд), кокон с ростком (Огонь), завеса Ивы (Астрал)
  { id: 'gh_wall', kind: 'ice', ...G(750, 1310), texture: 'glass_wall_01', frozenTexture: 'glass_wall_frost', walkable: true, collide: { w: 180, h: 50 }, radius: 140,
    requiresEvent: 'ch3_mirra_met', doneEvent: 'ch3_wall_brittle', hint: 'Стеклянная стена',
    lockedText: 'Толстое стекло: ни Огонь, ни Телекинез его не берут. Холод сделал бы его хрупким.',
    doneText: 'Стекло помутнело и пошло трещинами. Теперь — Телекинез!' },
  { id: 'gh_wall_block', kind: 'telekinesis', mode: 'push', weight: 'heavy', ...G(750, 1312), texture: 'glass_block_cracked', collide: { w: 170, h: 46 },
    target: G(960, 1420), radius: 150, requiresEvent: 'ch3_wall_brittle', doneEvent: 'ch3_lock_wall', hint: 'Хрупкое стекло' },
  { id: 'gh_bridge', kind: 'ice', ...G(750, 1030), texture: 'glass_bridge_01', frozenTexture: 'glass_bridge_frozen_01', walkable: true, collide: { w: 150, h: 60 }, radius: 140,
    requiresEvent: 'ch3_mirra_met', doneEvent: 'ch3_lock_bridge', hint: 'Стеклянный мост',
    lockedText: 'Мост над трещиной от молнии дрожит и звенит. Шагнёшь — рассыплется. Лёд удержал бы его.',
    doneText: 'Лёд стянул трещины — мост держит. Лёд держит, а не ломает.' },
  { id: 'gh_cocoon', kind: 'fire', ...G(1080, 900), texture: 'glass_cocoon_01', collide: { w: 70, h: 24 }, radius: 120, burnSec: 1.2,
    requiresEvent: 'ch3_mirra_met', destroyEvent: 'ch3_lock_sapling', hint: 'Стеклянный кокон',
    doneText: 'Стекло осыпалось — внутри живой росток ивы. Тонкий, зелёный: вырос уже после пожара и сорок лет ждал под стеклом.' },
  { id: 'gh_ward', kind: 'seal_sigil', ...G(750, 780), texture: 'iva_ward_01', litTexture: 'iva_ward_01', collide: { w: 140, h: 50 }, opens: true, radius: 140,
    requiresEvent: 'ch3_mirra_met', waitEvent: 'ch3_lock_sapling', doneEvent: 'ch3_lock_ward', hint: 'Завеса Ивы',
    lockedText: 'Завеса Ивы тянет силу из стеклянного кокона неподалёку. Пока кокон цел, Астралу её не пробить.',
    doneTitle: 'Завеса пала', doneButton: 'Вперёд',
    doneText: 'Астрал нашёл в завесе живую нить — ту, что шла от ростка. Нить порвана, и завеса осыпалась стеклянной пылью. Впереди — сердце рощи.' },

  // ---- Сердце рощи: Ива, Мирра, Ветла
  { id: 'npc_iva_heart', kind: 'npc', npc: 'iva', ...G(520, 520), texture: 'npc_iva', collide: { w: 30, h: 14 }, radius: 140,
    requiresEvent: 'ch3_iva_met', hideEvent: GROVE_AWAKE },
  { id: 'npc_iva_old', kind: 'npc', npc: 'iva_old', ...G(520, 520), texture: 'npc_iva_old', collide: { w: 30, h: 14 }, radius: 140, requiresEvent: GROVE_AWAKE },
  { id: 'npc_mirra_heart', kind: 'npc', npc: 'mirra', ...G(1000, 560), texture: 'npc_mirra', collide: { w: 30, h: 14 }, radius: 130,
    requiresEvent: 'ch3_guardian_defeated', hideEvent: 'chapter_3_complete' },
  { id: 'npc_nameless_heart', kind: 'npc', npc: 'nameless', ...G(860, 420), texture: 'npc_nameless', radius: 140,
    requiresEvent: 'ch3_name_willow', hideEvent: GROVE_AWAKE },
  { id: 'npc_vetla', kind: 'npc', npc: 'vetla', ...G(860, 420), texture: 'npc_vetla', radius: 140, requiresEvent: GROVE_AWAKE },
];
export const GROVE_INTERACTIVES = GROVE_OBJECT_LIST;

const GROVE_ENEMY_LIST = [
  // квест 5: стеклянные горностаи в балке
  { id: 'gb_stoat_1', enemy: 'glass_stoat', ...G(560, 4760), radius: 120, requiresEvent: 'ch3_nerys_met', defeatEvent: 'ch3_ravine_1', repeatSec: 600 },
  { id: 'gb_stoat_2', enemy: 'glass_stoat', ...G(1000, 4560), radius: 120, requiresEvent: 'ch3_nerys_met', defeatEvent: 'ch3_ravine_2', repeatSec: 600 },
  // квест 7: эхо у ручья — роняют искры памяти
  { id: 'ge_echo_1', enemy: 'echo_wisp', ...G(1100, 3700), radius: 120, requiresEvent: 'ch3_echo_stream', repeatSec: 600 },
  { id: 'ge_echo_2', enemy: 'echo_wisp', ...G(320, 3840), radius: 120, requiresEvent: 'ch3_echo_stream', repeatSec: 600 },
  // сад: стеклянные волчицы (охота, не обязательна)
  { id: 'gg_wolf_1', enemy: 'glass_wolf', ...G(260, 2470), radius: 120, requiresEvent: 'ch3_iva_met', repeatSec: 600 },
  { id: 'gg_wolf_2', enemy: 'glass_wolf', ...G(1300, 3080), radius: 120, requiresEvent: 'ch3_iva_met', repeatSec: 600 },
  // квест 12: игольники тянутся к корням один за другим
  { id: 'gr_needle_1', enemy: 'needle', ...G(400, 2000), radius: 120, requiresEvent: 'ch3_roots_open', defeatEvent: 'ch3_needle_1', repeatSec: 900 },
  { id: 'gr_needle_2', enemy: 'needle', ...G(1120, 1940), radius: 120, requiresEvent: 'ch3_needle_1', defeatEvent: 'ch3_needle_2', repeatSec: 900 },
  { id: 'gr_needle_elite', enemy: 'needle_elite', ...G(1140, 1540), radius: 130, requiresEvent: 'ch3_needle_2', defeatEvent: 'ch3_needle_3', repeatSec: 1200 },
  // квест 14: Стеклянный страж у сердца; квест 15: Отражение Ивы
  { id: 'gh_guardian', enemy: 'glass_guardian', ...G(750, 640), radius: 140, requiresEvent: 'ch3_lock_ward', defeatEvent: 'ch3_guardian_defeated' },
  { id: 'gh_reflection', enemy: 'iva_reflection', ...G(750, 450), radius: 130, requiresEvent: 'ch3_iva_refused', defeatEvent: 'ch3_reflection_defeated' },
];
export const GROVE_ENEMIES = GROVE_ENEMY_LIST;

/** Места рощи, которые генератор декора не трогает (проходы и сцены). */
export const GROVE_KEEP_CLEAR = [{ ...GROVE_RECT }];

// Декор рощи. until — виден, пока не случилось событие; requires — появляется после события (ExplorationScene.placePropView).
const glassTrees = [
  [220, 4300], [1300, 4200], [180, 3960], [1330, 3480], [560, 3880], [880, 3560], [1180, 3300], [250, 3380],
  [190, 3100], [1320, 3150], [400, 2560], [1150, 2400], [560, 2960], [960, 2980], [260, 2320], [1300, 2500],
  [230, 2050], [1300, 1580], [300, 1420], [1220, 1380], [180, 1150], [1330, 1100], [300, 880], [1250, 760], [400, 420], [1110, 420],
];
export const GROVE_DECOR = [
  // ручей Звонец и трещина от молнии — рисунок пола поверх невидимых блоков
  { id: 'grove_stream_glass', k: 'grove_stream_glass', ...G(750, 3240), floor: true, until: 'ch3_name_stream' },
  { id: 'grove_stream_water', k: 'grove_stream_water', ...G(750, 3240), floor: true, requires: 'ch3_name_stream' },
  { id: 'grove_rift', k: 'grove_rift', ...G(750, 1035), floor: true },
  // стеклянные ивы, а после финала — живые
  ...glassTrees.map(([x, y], i) => ({ id: `grove_glass_${i}`, k: i % 2 ? 'glass_willow_02' : 'glass_willow_01', ...G(x, y), flip: i % 3 === 0, until: GROVE_AWAKE })),
  ...glassTrees.map(([x, y], i) => ({ id: `grove_live_${i}`, k: i % 2 ? 'tree_willow_02' : 'tree_willow_01', ...G(x, y), flip: i % 3 === 0, requires: GROVE_AWAKE })),
  // Ракита: стеклянная — и обгоревший ствол с ростками после имени
  { id: 'grove_rakita_glass', k: 'grove_rakita_glass', ...G(750, 330), until: GROVE_AWAKE },
  { id: 'grove_rakita_alive', k: 'grove_rakita_alive', ...G(750, 330), requires: GROVE_AWAKE },
  { id: 'grove_sprout', k: 'willow_sprout_01', ...G(1080, 902), requires: 'ch3_lock_sapling' },
  // Сухая балка: сухие деревья, лагерь Нэрис
  ...[[160, 5120], [520, 5240], [900, 5150], [1340, 4920], [760, 4440], [420, 4700]].map(([x, y], i) => ({ id: `grove_dry_${i}`, k: 'dead_tree_grey_01', ...G(x, y) })),
  { id: 'grove_campfire', k: 'campfire_01', ...G(1140, 5040), light: 130 },
  { id: 'grove_camp_crate', k: 'city_crate', ...G(1330, 4990) },
  { id: 'grove_camp_barrel', k: 'city_barrel', ...G(990, 4990) },
  { id: 'grove_camp_lantern', k: 'lantern_01', ...G(950, 4890), light: 150 },
  // Сад под колпаками: дом Ивы и колпаки с цветами
  { id: 'grove_iva_hut', k: 'iva_hut', ...G(1130, 2560) },
  ...[[300, 2700], [610, 2560], [1240, 2700], [900, 2880]].map(([x, y], i) => ({ id: `grove_jar_${i}`, k: 'glass_jar_flower', ...G(x, y), until: GROVE_AWAKE })),
  { id: 'grove_jar_bird_base', k: 'glass_jar_empty', ...G(430, 2800), floor: true, requires: 'ch3_jar_bird' },
  { id: 'grove_jar_fox_base', k: 'glass_jar_empty', ...G(1080, 2780), floor: true, requires: 'ch3_jar_fox' },
];
