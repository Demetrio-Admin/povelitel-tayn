import { CITY_POSITIONS, CITY_ROOMS, cityPoint } from '../config/city.plan.js';
import { roomPoint } from '../config/city.rooms.js';
import { borPoint, CITY_ACTORS } from './regions.js';
import { QUEST_DIALOGUE } from './dialogue.js';

const F = borPoint;
const C = cityPoint;
const R = (key, x, y) => roomPoint(key, x, y, CITY_ROOMS);
const P = id => CITY_POSITIONS[id];
const battle = (where, label, pack, level, intro = '', after = '') => ({ where, label, pack, level, intro, after });
const spell = (where, label, texture, gift, after = '', more = {}) => ({ where, label, texture, gift, after, ...more });
const talk = (where, label, texture, after, extra = {}) => ({ where, label, texture, after, ...extra });
const action = (where, label, texture, after = '', extra = {}) => ({ where, label, texture, after, ...extra });
const rewards = (coins = 0, items = {}, shards = {}, sapphires = 0, more = {}) => ({ coins, items, shards, sapphires, ...more });
const story = (id, title, needs, steps, reward, order) => ({ id, title, needs, steps, reward, order, kind: 'story' });
const side = (id, title, needs, steps, reward) => ({ id, title, needs, steps, reward, kind: 'side' });
const hunt = (id, title, needs, steps, reward) => ({ id, title, needs, steps, reward, kind: 'hunt' });
const herb='moon_herb', resin='tree_resin', frost='frost_herb', dust='rune_dust';
const wick='lunar_wick', heart='cold_heart';
const life='potion_life_small', warm='potion_warm';
const foxCamp=F(93,412), grove=F(414,109);
const keeper=F(676,187), lamp={x:774,y:682};
const court= C(1910,2895), bridge=P('frost_barrier'), water=P('fq_water');
const bank=C(2125,4310), bench=P('archive_document');
const gateCamp=CITY_ACTORS.grom, north=C(2050,905);
const region1 = [
  story('first_anomaly','Первая аномалия',['workbench'],[
    {...battle({x:844,y:1075},'Искроцап и Колючник','t1_duo_anomaly',4),arena:['light']},
    spell({x:923,y:1105},'Огненная аномалия','fire_circle_01','fire'),
  ],rewards(80,{}, {crimson_burst:10},0,{equip:'crimson_burst'}),6),
  story('green_page','Зелёная страница',['first_anomaly'],[
    action(F(183,329),'Лунная трава на полянке','moon_herb_01','',{take:{[herb]:4}}),
    action(F(207,314),'Смоляной пень','resin_log_01','',{take:{[resin]:2}}),
    action(F(189,289),'Посвящение дара','magic_book_01','',{practiceColor:true}),
  ],rewards(100,{[life]:1},{fire:5}),7),
  story('bridge_beacon','Маячок у мостика',['green_page'],[
    spell(F(235,340),'Валун на первом маячке','heavy_boulder_01','telekinesis'),
  ],rewards(120,{[resin]:3},{lunar_veil:5}),8),
  story('birch_ambush','Берёзовая засада',['bridge_beacon'],[
    battle(F(393,134),'Чащобник и два Колючника','t1_trio_birch',12),
  ],rewards(160,{[herb]:3},{crimson_burst:5}),9),
  story('brook_flame','Огонёк у ручья',['birch_ambush'],[
    spell(F(330,199),'Третий маячок подо льдом','forest_node_broken','fire'),
    action(grove,'Лунный алтарь','lunar_flame_01'),
  ],rewards(200,{mirra_lantern_restored:1},{seal:5},15),10),
  story('outpost','Застава перед трактом',['brook_flame'],[
    battle(F(604,228),'Передовая охрана','t1_duo_outpost',16),
    action(F(630,212),'Гром у заставы','npc_goran','',{needsTactical:true}),
  ],rewards(180,{[warm]:1,[resin]:4}),11),
  story('treegazer','Вековой Древогляд',['outpost'],[
    battle(keeper,'Вековой Древогляд','t1_boss_treegazer',20),
  ],rewards(400,{[wick]:2,recipe_amulet_forest:1},{seal:10},50),12),
  side('birch_cat','Рыжий кот на берёзе',[],[
    battle(F(95,368),'Колючник у берёзы','t1_solo_thorn',2,'','Кот спрыгивает с берёзы. Теперь он будет ждать у крыльца.'),
  ],rewards(70,{}, {resin_thread:5})),
  side('rolling_barrel','Убежавшая бочка смолы',[],[
    battle(F(152,274),'Два Искроцапа у бочки','t1_duo_barrel',5),
  ],rewards(80,{[resin]:3},{stone_call:5})),
  side('lost_hare','Заблудившийся зайчонок',[],[
    battle(F(210,360),'Морозун у мостика','t1_solo_imp',4,'','Зайчонок выскакивает из кустов и убегает в рощу.'),
  ],rewards(60,{[herb]:4})),
  side('veda_cauldron','Сбежавший котёл Веды',[],[
    battle(F(160,365),'Искроцапы у котла','t1_duo_barrel',6),
  ],rewards(90,{[resin]:4},{lunar_veil:5})),
  side('moon_bed','Лунные грядки',['workbench'],[
    action({x:481,y:765},'Лунная грядка','city_walk_herbbed','',{cost:{[herb]:4}}),
  ],rewards(70,{}, {resin_thread:3})),
  side('resin_fence','Смоляной забор',['moon_bed'],[
    action({x:461,y:822},'Укрепить ограду','horizon_hearth_fence','',{cost:{[resin]:3}}),
  ],rewards(90,{}, {stone_call:3})),
  side('apothecary_garden','Аптекарский уголок',['resin_fence'],[
    action({x:493,y:637},'Аптекарская грядка','city_walk_flowerbed','',{cost:{[herb]:4,[resin]:2}}),
  ],rewards(120,{[herb]:6,[resin]:5},{lunar_veil:10})),
  side('ancient_cache','Тайник у Древних Ворот',[],[
    spell(F(83,137),'Камень перед Древними Воротами','heavy_boulder_01','telekinesis'),
    battle(F(109,148),'Морозун у тайника','t1_solo_imp',10),
  ],rewards(100,{}, {seal:5},10)),
  side('horseshoe','Пропавшая подкова Грома',[],[
    talk(foxCamp,'Гром','npc_goran'),
    battle(F(471,122),'Искроцап у дупла','t1_solo_grab',8),
    talk(foxCamp,'Вернуть подкову Грому','npc_goran'),
  ],rewards(110,{}, {fire:5})),
  hunt('bor_crown_1','Корона Бора I · Угольный Цап',[],[
    battle(F(197,108),'Угольный Цап','t1_elite_ember',9),
  ],rewards(180,{[wick]:1},{fire:8})),
  hunt('bor_crown_2','Корона Бора II · Репей и Чертополох',['bor_crown_1'],[
    battle(F(387,381),'Репей и Чертополох','t1_elite_burrs',15),
  ],rewards(220,{[wick]:1},{resin_thread:8})),
  hunt('bor_crown_3','Корона Бора III · Король Бурелома',['bor_crown_2'],[
    battle(F(614,328),'Король Бурелома','t1_elite_king',20),
  ],rewards(0,{[wick]:1},{crimson_burst:10})),
  hunt('wand_light','Новый свет палочки',[],[
    talk(foxCamp,'Гром · свет палочки','npc_goran','',{milestone:'wand15'}),
  ],rewards(200,{}, {},10)),
  hunt('first_star','Первая звезда дара',[],[
    talk(foxCamp,'Гром · две звезды','npc_goran','',{milestone:'star2'}),
  ],rewards(150,{[resin]:3})),
  hunt('full_tide','Полный Лунный прилив',[],[
    talk(foxCamp,'Гром · двадцать побед','npc_goran','',{milestone:'tide20'}),
  ],rewards(200,{}, {},15)),
];
const region2 = [
  story('fountain','Фонтан на площади',[],[
    battle(C(1580,3674),'Отряд у фонтана','t2_duo_plaza',21),
  ],rewards(260,{[frost]:4},{fire:5}),1),
  story('klara','Встреча с Кларой',['fountain'],[
    talk(P('npc_ilaria'),'Архивариус Клара','npc_ilaria','',{learn:'seal'}),
  ],rewards(180,{[frost]:3}),2),
  story('pavement','Иней на мостовой',['klara'],[
    battle(C(1769,3669),'Инеевый Скупщик у ящика','t2_solo_collector',23),
    spell(C(1842,3679),'Покрытый инеем ящик','crate_01','telekinesis'),
    spell(C(1859,3663),'Доска с оттиском','rune_slab_01','seal'),
  ],rewards(240,{[dust]:3},{seal_crack:5}),3),
  story('archive','Записи Архива',['pavement'],[
    spell(bench,'Ведомость Архива','magic_book_01','seal'),
  ],rewards(220,{[frost]:4}),4),
  story('warehouse_a','Дело Склада А',['archive'],[
    battle(P('wh_collector_1'),'Два Скупщика на Складе А','t2_duo_warehouse_a',25),
    action(R('warehouse_a',425,1020),'Клетка складского кота','crate_01','Кот выпрыгнул. Под клеткой накладная с пометкой «Остудить канал».'),
  ],rewards(300,{[frost]:4},{seal_crack:5}),5),
  story('warehouse_b','Дело Склада Б',['archive'],[
    battle(P('wh_elite'),'Старший Скупщик на Складе Б','t2_solo_senior',26),
    spell(R('warehouse_b',510,1054),'Ящики с клеймом Общества','crate_01','telekinesis','За ящиками лежит ледяная страница Гримуара.'),
  ],rewards(340,{[dust]:3},{ice:10}),6),
  story('cold_truth','Холодная правда',['warehouse_a','warehouse_b'],[
    talk(P('npc_severin'),'Август Град','npc_severin'),
    battle(court,'Голем и Морозун во дворе Общества','t2_duo_society',28),
  ],rewards(360,{[frost]:4},{ice_shatter:5}),7),
  story('bridge_wall','Стена на мосту',['cold_truth'],[
    spell(bridge,'Ледяная стена на мосту','ice_wall_01','fire'),
  ],rewards(280,{[frost]:3},{frost_prism:5}),8),
  story('cellar_house','Дом с погребом',['bridge_wall'],[
    battle(P('fq_critter'),'Морозун у погреба','t2_solo_imp',31),
    spell(P('fq_cellar'),'Ящики на дверях погреба','crate_01','telekinesis'),
  ],rewards(320,{[frost]:4,[dust]:3}),9),
  story('rescue_house','Дом за ледяной дверью',['cellar_house'],[
    battle(P('fq_collector'),'Отряд у ледяной двери','t2_duo_plaza',32),
    spell(P('fq_door'),'Швы ледяного замка','frozen_door_01','seal'),
  ],rewards(380,{}, {ice:5},0,{companion:'robin'}),10),
  story('flood','Затопленный пролом',['rescue_house'],[
    spell(water,'Вода в проломе','water_patch_01','ice'),
    battle(P('fq_training'),'Стая Северного двора','t2_trio_quarter',34),
  ],rewards(420,{[dust]:4},{ice_shatter:5}),11),
  story('lab_seal','Печать на склоне',['flood'],[
    spell(P('lab_seal'),'Нестабильная печать лаборатории','rune_sigil_01','ice'),
    battle(P('vol_1'),'Остуженные Тихон и Мирон','t2_volunteers',35),
  ],rewards(440,{[frost]:4},{stone_shell:5}),12),
  story('lab_journal','Журнал подвала',['lab_seal'],[
    battle(P('lab_construct'),'Студёный Голем','t2_solo_golem',37),
    spell(P('lab_journal'),'Лабораторный журнал','magic_book_01','seal'),
  ],rewards(460,{[warm]:1,[dust]:4},{storm:5}),13),
  story('august','Дуэль в Зале',['lab_journal'],[
    spell(P('final_ward'),'Пелена у Зала Дуэлей','astral_ward_01','seal'),
    battle(P('final_severin'),'Август Град','t2_boss_august',40),
    spell(P('final_letters'),'Зашифрованные письма','magic_book_01','seal'),
  ],rewards(750,{[heart]:2,recipe_amulet_frost:1},{storm:15},60),14),
  side('martha_pies','Пироги тётушки Марфы',[],[
    battle(C(1310,4475),'Искроцап с корзинкой','t1_solo_grab',21),
  ],rewards(180,{[warm]:1},{fire:5})),
  side('archive_cat','Кот на перилах Архива',['fountain'],[
    battle(C(1430,2710),'Морозун у перил','t2_solo_imp',23),
  ],rewards(190,{}, {spark_seed:5})),
  side('asya_lamp','Вечерний фонарь Аси',['fountain'],[
    spell(C(1740,3445),'Погасший фонарь Аси','city_lamp_01','fire'),
  ],rewards(150,{[frost]:3},{lunar_veil:5})),
  side('bank_key','Пропавший ключ Агаты',[],[
    talk(P('npc_banker'),'Агата','npc_banker'),
    battle(bank,'Скупщик у Банка','t2_solo_collector',24),
    talk(P('npc_banker'),'Вернуть ключ Агате','npc_banker'),
  ],rewards(260,{}, {},15)),
  side('boris_cart','Тележка Бориса',[],[
    battle(C(1355,4970),'Скупщики у тележки','t2_side_cart',24),
  ],rewards(280,{[dust]:5,recipe_amulet_market:1},{stone_call:5})),
  side('coven_flowers','Цветы для круга Ядвиги',[],[
    talk(P('npc_rowena'),'Ядвига','npc_rowena','',{cost:{[frost]:6,[dust]:3}}),
  ],rewards(260,{}, {stone_shell:5})),
  side('garden_scroll','Забытый свиток в саду',[],[
    battle(C(1620,2730),'Два Морозуна у свитка','t2_side_garden',25),
  ],rewards(250,{}, {veil_rend:10})),
  side('duel_lesson_1','Урок Феликса I · Против щита',['klara'],[
    battle(P('npc_duelist'),'Спарринг против щита','t2_duel_shield',25),
  ],rewards(280,{}, {seal_crack:5})),
  side('duel_lesson_2','Урок Феликса II · Против холода',['duel_lesson_1','rescue_house'],[
    battle(P('npc_duelist'),'Морозный дуэлянт','t2_duel_frost',33),
  ],rewards(320,{}, {ice_shatter:5},10)),
  side('north_workshop','Мастерская Тихона и Мирона',['lab_seal'],[
    spell(north,'Завал у мастерской','heavy_boulder_01','telekinesis'),
    battle(C(2134,872),'Голем в сарае','t2_elite_golem',35),
  ],rewards(400,{}, {stone_shell:10})),
  hunt('town_crown_1','Корона Светлодола I · Ледолом',[],[
    battle(C(1760,2340),'Ледолом с Набережной','t2_elite_golem',26),
  ],rewards(380,{[heart]:1},{ice:8})),
  hunt('town_crown_2','Корона Светлодола II · Братья-Скупцы',['town_crown_1'],[
    battle(C(2380,3240),'Братья-Скупцы','t2_elite_collectors',32),
  ],rewards(440,{[heart]:1},{seal_crack:8})),
  hunt('town_crown_3','Корона Светлодола III · Свора',['town_crown_2','flood'],[
    battle(C(1860,690),'Свора Замёрзшего Двора','t2_elite_yard',39),
  ],rewards(500,{[heart]:1},{storm:10})),
  hunt('blue_ritual','Синяя ступень',[],[
    talk(gateCamp,'Гром · синий ритуал','npc_goran','',{milestone:'blue'}),
  ],rewards(350,{[dust]:4})),
  hunt('two_builds','Два набора мастера',[],[
    talk(gateCamp,'Гром · наборы мастера','npc_goran','',{milestone:'build2'}),
  ],rewards(300,{}, {},10)),
  hunt('first_chest','Первый Сундук Гримуара',[],[
    talk(gateCamp,'Гром · Сундук Гримуара','npc_goran','',{milestone:'chest'}),
  ],rewards(300,{}, {spark_seed:5})),
];

export const QUESTS = [
  ...region1.map(quest => ({ ...quest, act: 1 })),
  ...region2.map(quest => ({ ...quest, act: 2 })),
].map(quest => ({
  ...quest,
  steps: quest.steps.map((step, index) => ({ ...step, ...QUEST_DIALOGUE[quest.id]?.[index] })),
}));
export const QUEST_BY_ID = Object.fromEntries(QUESTS.map(q => [q.id, q]));
export const PROLOGUE = [
  ['lantern_intro','Не трожь фонарь!','upgrade'],
  ['wand_intro','Искра в палочке','frost'],
  ['fox_intro','Тепло у калитки','veda'],
  ['camp_intro','Привал Грома','hunt'],
  ['workbench','Оживший верстак',null],
];
