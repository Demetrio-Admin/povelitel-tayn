-- Bulk trading and combat with pending loot. Apply after v0.31; repeatable.
begin;
create or replace function public._game_rules() returns jsonb language sql immutable as $r$ select '{"balanceMigration":{"event":"balance_v30_applied","coins":{"unlock_telekinesis_1":50,"lunar_quest_complete":100,"chapter_1_complete":30,"ch2_city_arrived":20,"ch2_met_ilaria":40,"ch2_trace_found":20,"ch2_archive_read":20,"ch2_met_severin":20,"ch2_cargo_reported":30,"ch2_frost_wave":30,"ch2_rescue_done":40,"ch2_ice_trained":40,"ch2_quarter_cleared":40,"ch2_brittle_done":30,"ch2_lab_reported":40,"ch2_severin_confronted":20,"ch2_coven_ready":40,"chapter_2_complete":180},"sapphires":{"ch2_quarter_cleared":1,"ch2_coven_ready":1}},"recipes":{"elixir_life":{"result":"elixir_life","amount":1,"needs":{"moon_herb":2,"forest_mushroom":1},"requires":[],"crafted":null,"blockedBy":[]},"elixir_mana":{"result":"elixir_mana","amount":1,"needs":{"moon_herb":1,"rune_dust":1},"requires":[],"crafted":null,"blockedBy":[]},"resin_flask":{"result":"resin_flask","amount":1,"needs":{"tree_resin":2,"rune_dust":1},"requires":[],"crafted":null,"blockedBy":[]},"lunar_wick":{"result":"lunar_wick","amount":1,"needs":{"moon_herb":1,"tree_resin":1,"rune_dust":1,"lunar_flame":3},"requires":["lunar_quest_start"],"crafted":"lunar_wick_crafted","blockedBy":["lunar_wick_crafted","lunar_quest_complete"]},"revealing_compound":{"result":"revealing_compound","amount":1,"needs":{"moon_herb":1,"forest_mushroom":1,"rune_dust":1},"requires":["lunar_quest_complete"],"crafted":"revealing_compound_crafted","blockedBy":["revealing_compound_crafted","gate_marks_revealed"]},"restoration_bundle":{"result":"restoration_bundle","amount":1,"needs":{"moon_herb":2,"tree_resin":2,"rune_dust":2,"lunar_shard":1,"rare_core":1},"requires":["lunar_quest_complete"],"crafted":"restoration_bundle_crafted","blockedBy":["restoration_bundle_crafted","chapter_1_complete"]},"warm_potion":{"result":"warm_potion","amount":1,"needs":{"moon_herb":1,"frost_herb":1,"forest_mushroom":1},"requires":["ch2_nerys_met"],"crafted":"warm_potion_crafted","blockedBy":[]},"stabilizing_potion":{"result":"stabilizing_potion","amount":1,"needs":{"frost_herb":2,"rune_dust":1,"lunar_shard":1},"requires":["ch2_lab_open"],"crafted":null,"blockedBy":[]},"brittle_flask":{"result":"brittle_flask","amount":1,"needs":{"ice_crystal":1,"tree_resin":1,"rune_dust":1},"requires":["unlock_ice_2"],"crafted":"brittle_flask_crafted","blockedBy":[]},"crystal_guard":{"result":"crystal_guard","amount":1,"needs":{"ice_crystal":1,"forest_mushroom":1,"tree_resin":1},"requires":["ch2_quarter_cleared"],"crafted":null,"blockedBy":[]},"reinforced_resin":{"result":"reinforced_resin","amount":1,"needs":{"tree_resin":2,"crimson_ember":1,"frost_herb":1},"requires":["ch2_cargo_found"],"crafted":null,"blockedBy":[]},"astral_lens":{"result":"astral_lens","amount":1,"needs":{"rune_dust":2,"lunar_shard":1,"ice_crystal":1},"requires":["ch2_cargo_reported"],"crafted":null,"blockedBy":[]},"amulet_frost":{"result":"amulet_frost","amount":1,"needs":{"lunar_shard":4,"rune_dust":4,"ice_crystal":3,"frost_shard":1,"coins":250},"requires":["ch2_quarter_cleared"],"crafted":"amulet_frost_crafted","blockedBy":["amulet_frost_crafted"]}},"uses":{"lunar_wick":{"requires":["lunar_quest_start"],"blockedBy":["lunar_quest_complete"],"events":["lunar_quest_complete"],"reward":{"heroXP":50,"coins":100,"schoolXP":{"telekinesis":40},"items":{"lunar_shard":3},"topUp":{"school":{"telekinesis":150},"items":{"lunar_shard":5,"coins":195}}}},"revealing_compound":{"requires":["guardian_defeated"],"blockedBy":["gate_marks_revealed"],"events":["gate_marks_revealed"],"reward":{"heroXP":30}},"restoration_bundle":{"requires":["chapter_trial_defeated","unlock_seal_1"],"blockedBy":["chapter_1_complete"],"mana":20,"events":["chapter_1_complete"],"reward":{"heroXP":100,"coins":60,"schoolXP":{"seal":40}}}},"firstCraft":{"event":"first_craft_complete","reward":{"heroXP":15}},"migration":{"event":"mig_v10","guardian":"forest_guardian_01","item":"rare_core","notIf":["restoration_bundle_crafted","chapter_1_complete"]},"vitals":{"hpRegenPerSec":1,"manaRegenWorld":0.5,"manaRegenHouse":2,"house":{"x":640,"y":4880,"w":520,"h":420},"defeatHpFraction":0.2,"staleCombatSec":900},"potions":{"elixir_life":{"kind":"heal","amount":0.45},"elixir_mana":{"kind":"mana","amount":0.6}},"world":{"glade_rock":{"kind":"cast","mark":"moved","mana":12,"ability":"telekinesis","minLevel":1,"blockedBy":[],"school":{"telekinesis":6},"events":["first_world_interaction"],"requires":[],"requiresEnemy":[]},"glade_rock_reward":{"kind":"loot","mark":"collected","reward":{"coins":20},"parent":{"id":"glade_rock","state":"moved"}},"moon_plant":{"kind":"loot","mark":"collected","reward":{"items":{"moon_herb":1}},"mana":4,"ability":"telekinesis","minLevel":1,"school":{"telekinesis":6},"events":["first_world_interaction"],"requires":[],"requiresEnemy":[]},"glade_cache":{"kind":"loot","mark":"opened","reward":{"items":{"coins":15,"tree_resin":1}},"requires":[],"requiresEnemy":[]},"corrupted_roots":{"kind":"cast","mark":"destroyed","mana":16,"ability":"fire","minLevel":1,"blockedBy":[],"school":{"fire":6},"events":["fire_gate_open"],"path":"west_forest","requires":[],"requiresEnemy":[]},"trail_cache":{"kind":"loot","mark":"opened","reward":{"items":{"coins":20,"forest_mushroom":1}},"requires":[],"requiresEnemy":[]},"flame_a":{"kind":"loot","mark":"collected","reward":{"items":{"lunar_flame":1}},"mana":4,"ability":"telekinesis","minLevel":1,"school":{"telekinesis":6},"events":[],"requires":["lunar_quest_start"],"requiresEnemy":[]},"altar_stone":{"kind":"cast","mark":"moved","mana":12,"ability":"telekinesis","minLevel":1,"blockedBy":[],"school":{"telekinesis":6},"events":[],"requires":[],"requiresEnemy":[]},"altar_stone_reward":{"kind":"loot","mark":"collected","reward":{"items":{"lunar_flame":1}},"parent":{"id":"altar_stone","state":"moved"}},"flame_c":{"kind":"loot","mark":"collected","reward":{"items":{"lunar_flame":1}},"requires":["lunar_quest_start"],"requiresEnemy":["lunar_guard"]},"heavy_boulder":{"kind":"cast","mark":"moved","mana":20,"ability":"telekinesis","minLevel":2,"blockedBy":[],"school":{"telekinesis":6},"events":["heavy_path_open"],"path":"fire_circle_path","requires":[],"requiresEnemy":[]},"ritual_torch":{"kind":"cast","mark":"burning","mana":16,"ability":"fire","minLevel":1,"blockedBy":[],"school":{"fire":6},"events":[],"requires":[],"requiresEnemy":[]},"dry_bush":{"kind":"cast","mark":"destroyed","mana":16,"ability":"fire","minLevel":1,"blockedBy":[],"school":{"fire":6},"events":[],"requires":[],"requiresEnemy":[]},"dry_bush_reward":{"kind":"loot","mark":"collected","reward":{"items":{"crimson_ember":1}},"parent":{"id":"dry_bush","state":"destroyed"}},"moonstone":{"kind":"loot","mark":"collected","reward":{"items":{"moonstone":1}},"requires":[],"requiresEnemy":[]},"west_chest":{"kind":"loot","mark":"opened","reward":{"items":{"coins":40,"lunar_shard":2,"rune_dust":1},"heroXP":15},"requires":[],"requiresEnemy":[]},"ancient_gate":{"kind":"cast","mana":20,"ability":"seal","minLevel":1,"blockedBy":["ancient_gate_open"],"school":{"seal":6},"events":["ancient_gate_open"],"path":"node_glade","requires":["guardian_defeated","gate_marks_revealed","unlock_seal_1","seal_training_complete"],"requiresEnemy":[]},"sapphire_trail_cache":{"kind":"loot","mark":"opened","reward":{"sapphires":1},"requires":["unlock_telekinesis_1"],"requiresEnemy":[]},"sapphire_oldwood_cache":{"kind":"loot","mark":"opened","reward":{"sapphires":1},"requires":["guardian_defeated"],"requiresEnemy":[]},"house_trunk":{"kind":"loot","mark":"looted","reward":{"items":{"forest_mushroom":1,"tree_resin":1}},"requires":[],"requiresEnemy":[]},"herb_g1":{"kind":"gather","item":"moon_herb","amount":1,"respawnSec":150,"mana":4,"requires":[],"requiresEnemy":[]},"herb_g2":{"kind":"gather","item":"moon_herb","amount":1,"respawnSec":150,"mana":4,"requires":[],"requiresEnemy":[]},"herb_g3":{"kind":"gather","item":"moon_herb","amount":1,"respawnSec":150,"mana":4,"requires":[],"requiresEnemy":[]},"herb_t1":{"kind":"gather","item":"moon_herb","amount":1,"respawnSec":150,"mana":4,"requires":[],"requiresEnemy":[]},"resin_t1":{"kind":"gather","item":"tree_resin","amount":1,"respawnSec":200,"mana":4,"requires":[],"requiresEnemy":[]},"mush_t1":{"kind":"gather","item":"forest_mushroom","amount":1,"respawnSec":200,"mana":4,"requires":[],"requiresEnemy":[]},"bramble_t1":{"kind":"cast","mark":"destroyed","mana":16,"ability":"fire","minLevel":1,"blockedBy":[],"school":{"fire":6},"events":[],"requires":[],"requiresEnemy":[]},"bramble_t1_reward":{"kind":"loot","mark":"collected","reward":{"items":{"tree_resin":2}},"parent":{"id":"bramble_t1","state":"destroyed"}},"rune_sigil":{"kind":"gather","item":"rune_dust","amount":1,"respawnSec":240,"mana":4,"requires":[],"requiresEnemy":[]},"rune_slab":{"kind":"cast","mark":"moved","mana":8,"ability":"telekinesis","minLevel":1,"blockedBy":[],"school":{"telekinesis":6},"events":[],"requires":[],"requiresEnemy":[]},"rune_slab_reward":{"kind":"loot","mark":"collected","reward":{"items":{"rune_dust":2}},"parent":{"id":"rune_slab","state":"moved"}},"herb_a1":{"kind":"gather","item":"moon_herb","amount":1,"respawnSec":150,"mana":4,"requires":[],"requiresEnemy":[]},"resin_a1":{"kind":"gather","item":"tree_resin","amount":1,"respawnSec":200,"mana":4,"requires":[],"requiresEnemy":[]},"crystal_a1":{"kind":"gather","item":"lunar_shard","amount":1,"respawnSec":420,"mana":4,"requires":[],"requiresEnemy":[]},"mush_a1":{"kind":"gather","item":"forest_mushroom","amount":1,"respawnSec":200,"mana":4,"requires":[],"requiresEnemy":[]},"mush_j1":{"kind":"gather","item":"forest_mushroom","amount":1,"respawnSec":200,"mana":4,"requires":[],"requiresEnemy":[]},"resin_j1":{"kind":"gather","item":"tree_resin","amount":1,"respawnSec":200,"mana":4,"requires":[],"requiresEnemy":[]},"hollow_cache":{"kind":"loot","mark":"opened","reward":{"items":{"forest_mushroom":2,"rune_dust":1},"coins":10},"requires":[],"requiresEnemy":[]},"guard_cache":{"kind":"loot","mark":"opened","reward":{"items":{"rune_dust":1}},"requires":[],"requiresEnemy":["lunar_guard"]},"dust_stash":{"kind":"stash","guard":"rootling_02","items":{"rune_dust":2},"requires":[],"requiresEnemy":[]},"approach_cache":{"kind":"loot","mark":"opened","reward":{"items":{"rune_dust":2}},"requires":[],"requiresEnemy":["rootling_05"]},"seal_sigil":{"kind":"cast","mana":20,"ability":"seal","minLevel":1,"blockedBy":["seal_training_complete"],"school":{"seal":6},"events":["seal_training_complete"],"requires":["gate_marks_revealed"],"requiresEnemy":[]},"sapphire_city_cache_1":{"kind":"loot","mark":"opened","reward":{"sapphires":1},"requires":["ch2_city_arrived"],"requiresEnemy":[]},"sapphire_city_cache_2":{"kind":"loot","mark":"opened","reward":{"sapphires":1},"requires":["ch2_quarter_cleared"],"requiresEnemy":[]},"frostherb_r1":{"kind":"gather","item":"frost_herb","amount":1,"respawnSec":240,"mana":4,"requires":["ch2_start"],"requiresEnemy":[]},"frostherb_r2":{"kind":"gather","item":"frost_herb","amount":1,"respawnSec":240,"mana":4,"requires":["ch2_start"],"requiresEnemy":[]},"resin_r1":{"kind":"gather","item":"tree_resin","amount":1,"respawnSec":240,"mana":4,"requires":[],"requiresEnemy":[]},"plaza_trace":{"kind":"cast","mana":20,"ability":"seal","minLevel":1,"blockedBy":["ch2_trace_astral"],"school":{"seal":6},"events":["ch2_trace_astral"],"requires":["ch2_met_ilaria"],"requiresEnemy":[]},"plaza_debris":{"kind":"cast","mark":"moved","mana":8,"ability":"telekinesis","minLevel":1,"blockedBy":[],"school":{"telekinesis":6},"events":["ch2_trace_debris"],"requires":["ch2_met_ilaria"],"requiresEnemy":[]},"plaza_debris_reward":{"kind":"loot","mark":"collected","reward":{"items":{"frost_herb":2}},"parent":{"id":"plaza_debris","state":"moved"}},"archive_document":{"kind":"cast","mana":20,"ability":"seal","minLevel":1,"blockedBy":["ch2_archive_read"],"school":{"seal":6},"events":["ch2_archive_read"],"requires":["ch2_trace_found"],"requiresEnemy":[]},"wh_cargo":{"kind":"cast","mark":"moved","mana":12,"ability":"telekinesis","minLevel":1,"blockedBy":[],"school":{"telekinesis":6},"events":["ch2_cargo_found"],"requires":[],"requiresEnemy":["wh_elite"]},"wh_cargo_reward":{"kind":"loot","mark":"collected","reward":{"items":{"ice_crystal":1}},"parent":{"id":"wh_cargo","state":"moved"}},"wh_equipment":{"kind":"cast","mana":20,"ability":"seal","minLevel":1,"blockedBy":["ch2_serials_read"],"school":{"seal":6},"events":["ch2_serials_read"],"requires":["ch2_cargo_found"],"requiresEnemy":[]},"frost_barrier":{"kind":"cast","mark":"destroyed","mana":16,"ability":"fire","minLevel":1,"blockedBy":[],"school":{"fire":6},"events":["ch2_quarter_open"],"requires":["ch2_frost_wave"],"requiresEnemy":[]},"ice_construct":{"kind":"cast","mark":"destroyed","mana":16,"ability":"fire","minLevel":1,"blockedBy":[],"school":{"fire":6},"events":["ch2_construct_unstable"],"requires":["ch2_quarter_open"],"requiresEnemy":[]},"fq_door":{"kind":"cast","mana":20,"ability":"seal","minLevel":1,"blockedBy":["ch2_rescue_door"],"school":{"seal":6},"events":["ch2_rescue_door"],"requires":[],"requiresEnemy":["fq_collector"]},"fq_cellar":{"kind":"cast","mark":"moved","mana":12,"ability":"telekinesis","minLevel":1,"blockedBy":[],"school":{"telekinesis":6},"events":["ch2_rescue_cellar"],"requires":[],"requiresEnemy":["fq_critter"]},"fq_cellar_reward":{"kind":"loot","mark":"collected","reward":{"items":{"frost_herb":1}},"parent":{"id":"fq_cellar","state":"moved"}},"fq_water":{"kind":"cast","mark":"frozen","mana":14,"ability":"ice","minLevel":1,"blockedBy":[],"school":{"ice":6},"events":["ch2_water_frozen"],"requires":[],"requiresEnemy":[]},"lab_seal":{"kind":"cast","mark":"frozen","mana":14,"ability":"ice","minLevel":1,"blockedBy":[],"school":{"ice":6},"events":["ch2_lab_open"],"requires":["ch2_lab_found"],"requiresEnemy":[]},"lab_herb_1":{"kind":"gather","item":"frost_herb","amount":1,"respawnSec":240,"mana":4,"requires":["ch2_lab_open"],"requiresEnemy":[]},"lab_herb_2":{"kind":"gather","item":"frost_herb","amount":1,"respawnSec":240,"mana":4,"requires":["ch2_lab_open"],"requiresEnemy":[]},"lab_chest":{"kind":"loot","mark":"opened","reward":{"items":{"rune_dust":2,"lunar_shard":2,"frost_herb":2}},"requires":["ch2_lab_open"],"requiresEnemy":[]},"lab_journal":{"kind":"cast","mana":20,"ability":"seal","minLevel":1,"blockedBy":["ch2_lab_journal"],"school":{"seal":6},"events":["ch2_lab_journal"],"requires":[],"requiresEnemy":["lab_construct"]},"final_debris":{"kind":"cast","mark":"moved","mana":20,"ability":"telekinesis","minLevel":2,"blockedBy":[],"school":{"telekinesis":6},"events":["ch2_fin_tk"],"requires":["ch2_final_start"],"requiresEnemy":[]},"final_ice_wall":{"kind":"cast","mark":"destroyed","mana":16,"ability":"fire","minLevel":1,"blockedBy":[],"school":{"fire":6},"events":["ch2_fin_fire"],"requires":["ch2_final_start"],"requiresEnemy":[]},"final_rift":{"kind":"cast","mark":"frozen","mana":14,"ability":"ice","minLevel":1,"blockedBy":[],"school":{"ice":6},"events":["ch2_fin_ice"],"requires":["ch2_final_start"],"requiresEnemy":[]},"final_ward":{"kind":"cast","mana":20,"ability":"seal","minLevel":1,"blockedBy":["ch2_fin_seal"],"school":{"seal":6},"events":["ch2_fin_seal"],"requires":["ch2_final_start"],"requiresEnemy":[]},"final_letters":{"kind":"cast","mana":20,"ability":"seal","minLevel":1,"blockedBy":["ch2_letters_read"],"school":{"seal":6},"events":["ch2_letters_read"],"requires":[],"requiresEnemy":["final_severin"]},"fw_herb_1":{"kind":"gather","item":"frost_herb","amount":1,"respawnSec":300,"mana":4,"requires":["chapter_2_complete"],"requiresEnemy":[]},"fw_herb_2":{"kind":"gather","item":"frost_herb","amount":1,"respawnSec":300,"mana":4,"requires":["chapter_2_complete"],"requiresEnemy":[]},"fw_herb_3":{"kind":"gather","item":"frost_herb","amount":1,"respawnSec":300,"mana":4,"requires":["chapter_2_complete"],"requiresEnemy":[]},"fw_crystal_1":{"kind":"gather","item":"ice_crystal","amount":1,"respawnSec":900,"mana":4,"requires":["chapter_2_complete"],"requiresEnemy":[]},"fw_crystal_2":{"kind":"gather","item":"ice_crystal","amount":1,"respawnSec":900,"mana":4,"requires":["chapter_2_complete"],"requiresEnemy":[]},"fw_cache":{"kind":"stash","guard":"fw_alpha","items":{"frost_shard":1,"ice_crystal":1},"requires":["chapter_2_complete"],"requiresEnemy":[]},"gy_dust_1":{"kind":"gather","item":"rune_dust","amount":1,"respawnSec":300,"mana":4,"requires":["chapter_2_complete"],"requiresEnemy":[]},"gy_dust_2":{"kind":"gather","item":"rune_dust","amount":1,"respawnSec":300,"mana":4,"requires":["chapter_2_complete"],"requiresEnemy":[]},"gy_mush_1":{"kind":"gather","item":"forest_mushroom","amount":1,"respawnSec":300,"mana":4,"requires":["chapter_2_complete"],"requiresEnemy":[]},"gy_mush_2":{"kind":"gather","item":"forest_mushroom","amount":1,"respawnSec":300,"mana":4,"requires":["chapter_2_complete"],"requiresEnemy":[]},"gy_shard_1":{"kind":"gather","item":"lunar_shard","amount":1,"respawnSec":900,"mana":4,"requires":["chapter_2_complete"],"requiresEnemy":[]},"gy_cache":{"kind":"stash","guard":"gy_warden","items":{"frost_shard":1,"lunar_shard":2},"requires":["chapter_2_complete"],"requiresEnemy":[]}},"events":{"prologue_seen":{"requires":[],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"mirra_taught_alchemy":{"requires":[],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"fire_required_01":{"requires":[],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"heavy_blocked_01":{"requires":[],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"unlock_telekinesis_1":{"requires":[],"unlock":{"telekinesis":1},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"lunar_quest_start":{"requires":["unlock_telekinesis_1"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"unlock_fire_1":{"requires":["heavy_path_open"],"unlock":{"fire":1},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"unlock_seal_1":{"requires":["gate_marks_revealed"],"unlock":{"seal":1},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_start":{"requires":["chapter_1_complete"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_city_arrived":{"requires":["ch2_start"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_met_ilaria":{"requires":["ch2_plaza_cleared"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_trace_found":{"requires":["ch2_trace_astral","ch2_trace_debris"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_met_severin":{"requires":["ch2_archive_read"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"city_merchant_open":{"requires":["ch2_city_arrived"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_cargo_start":{"requires":["ch2_met_severin"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_cargo_reported":{"requires":["ch2_cargo_found","ch2_serials_read"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_severin_asked":{"requires":["ch2_cargo_reported"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_frost_wave":{"requires":["ch2_lab_critter"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_nerys_met":{"requires":["ch2_construct_unstable"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_rescue_done":{"requires":["ch2_rescue_door","ch2_rescue_cellar"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"unlock_ice_1":{"requires":["ch2_rescue_done","warm_potion_crafted"],"unlock":{"ice":1},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_ice_trained":{"requires":["ch2_training_done"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_choice_start":{"requires":["ch2_ice_trained"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_quarter_cleared":{"requires":["ch2_ice_guardian_defeated","ch2_deep_1","ch2_deep_2"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":1},"unlock_ice_2":{"requires":["ch2_quarter_cleared"],"unlock":{"ice":2},"blockedBy":[],"consume":{"coins":500},"branch":{},"marks":[],"sapphires":0},"ch2_brittle_done":{"requires":["ch2_brittle_1","ch2_brittle_2","brittle_flask_crafted"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_lab_found":{"requires":["ch2_brittle_done"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_stabilized":{"requires":["ch2_vol_1","ch2_vol_2"],"unlock":{},"blockedBy":[],"consume":{"stabilizing_potion":2},"branch":{},"marks":[],"sapphires":0},"ch2_lab_reported":{"requires":["ch2_stabilized","ch2_lab_journal"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_view_danger":{"requires":["ch2_lab_reported"],"unlock":{},"blockedBy":["ch2_severin_confronted"],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_view_methods":{"requires":["ch2_lab_reported"],"unlock":{},"blockedBy":["ch2_severin_confronted"],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_view_market":{"requires":["ch2_lab_reported"],"unlock":{},"blockedBy":["ch2_severin_confronted"],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_view_unsure":{"requires":["ch2_lab_reported"],"unlock":{},"blockedBy":["ch2_severin_confronted"],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_severin_confronted":{"requires":["ch2_lab_reported"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_coven_met":{"requires":["ch2_severin_confronted"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_coven_supplies":{"requires":["ch2_coven_met"],"unlock":{},"blockedBy":[],"consume":{"crystal_guard":1,"frost_herb":2},"branch":{},"marks":[],"sapphires":0},"ch2_coven_ready":{"requires":["ch2_unstable_1","ch2_unstable_2","ch2_coven_supplies"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":1},"ch2_final_start":{"requires":["ch2_coven_ready"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_ice3_frost":{"requires":["ch2_fin_tk","ch2_fin_fire","ch2_fin_ice","ch2_fin_seal"],"unlock":{"ice":3},"blockedBy":["ch2_ice3"],"consume":{"coins":1500},"branch":{"ice":"frost"},"marks":["ch2_ice3"],"sapphires":0},"ch2_ice3_shard":{"requires":["ch2_fin_tk","ch2_fin_fire","ch2_fin_ice","ch2_fin_seal"],"unlock":{"ice":3},"blockedBy":["ch2_ice3"],"consume":{"coins":1500},"branch":{"ice":"shard"},"marks":["ch2_ice3"],"sapphires":0},"ch2_epilogue":{"requires":["ch2_letters_read"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"chapter_2_complete":{"requires":["ch2_epilogue"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":["title_frost_survivor"],"sapphires":5}},"eventRewards":{"unlock_telekinesis_1":{"coins":50},"first_world_interaction":{"heroXP":10},"lunar_quest_complete":{"heroXP":50,"coins":100,"items":{"lunar_shard":3},"schoolXP":{"telekinesis":40},"topUp":{"school":{"telekinesis":150},"items":{"lunar_shard":5}}},"telekinesis_2_complete":{"heroXP":30},"heavy_path_open":{"heroXP":20},"unlock_fire_1":{"heroXP":30},"fire_gate_open":{"heroXP":20,"schoolXP":{"fire":20}},"unlock_seal_1":{"heroXP":60},"ch2_city_arrived":{"heroXP":220,"coins":80},"ch2_met_ilaria":{"heroXP":200,"coins":90,"items":{"frost_herb":1}},"ch2_trace_found":{"heroXP":300,"coins":100,"items":{"frost_herb":2,"rune_dust":1}},"ch2_archive_read":{"heroXP":320,"coins":110},"ch2_met_severin":{"heroXP":340,"coins":100,"items":{"warm_potion":1}},"ch2_cargo_reported":{"heroXP":270,"coins":150,"items":{"frost_herb":2}},"ch2_frost_wave":{"heroXP":280,"coins":120},"ch2_nerys_met":{"heroXP":60},"ch2_rescue_done":{"heroXP":300,"coins":180,"items":{"moon_herb":1,"frost_herb":1,"forest_mushroom":1}},"unlock_ice_1":{"heroXP":60},"ch2_ice_trained":{"heroXP":240,"coins":100},"ch2_quarter_cleared":{"heroXP":340,"coins":200,"items":{"ice_crystal":2}},"unlock_ice_2":{"heroXP":60,"items":{"ice_crystal":1,"tree_resin":1,"rune_dust":1}},"ch2_brittle_done":{"heroXP":240,"coins":100},"ch2_stabilized":{"heroXP":120},"ch2_lab_reported":{"heroXP":300,"coins":220,"items":{"frost_shard":1,"lunar_shard":2}},"ch2_severin_confronted":{"heroXP":380,"coins":100},"ch2_coven_met":{"heroXP":60},"ch2_coven_ready":{"heroXP":300,"coins":220,"items":{"ice_crystal":2}},"ch2_epilogue":{"heroXP":250},"chapter_2_complete":{"topUp":{"heroXP":7900},"heroXP":300,"coins":330,"items":{"frost_shard":1}}},"quests":{"sq_herbs":{"start":"sq_herbs_start","done":"sq_herbs_done","requires":null,"requiresAll":[],"sapphires":0,"objectives":[{"type":"item","item":"moon_herb","count":3}],"consume":{"moon_herb":3},"reward":{"heroXP":15,"coins":25,"items":{"elixir_life":1}}},"sq_mushrooms":{"start":"sq_mushrooms_start","done":"sq_mushrooms_done","requires":"sq_herbs_done","requiresAll":["fire_gate_open"],"sapphires":0,"objectives":[{"type":"item","item":"forest_mushroom","count":2}],"consume":{"forest_mushroom":2},"reward":{"heroXP":15,"coins":35,"items":{"elixir_mana":1}}},"sq_resin":{"start":"sq_resin_start","done":"sq_resin_done","requires":"sq_mushrooms_done","requiresAll":[],"sapphires":0,"objectives":[{"type":"item","item":"tree_resin","count":3}],"consume":{"tree_resin":3},"reward":{"heroXP":15,"coins":45,"items":{"elixir_life":1}}},"sq_veda_stock":{"start":"sq_veda_stock_start","done":"sq_veda_stock_done","requires":"sq_resin_done","requiresAll":["chapter_1_complete"],"sapphires":1,"objectives":[{"type":"item","item":"moon_herb","count":1},{"type":"item","item":"forest_mushroom","count":1},{"type":"item","item":"tree_resin","count":2}],"consume":{"moon_herb":1,"forest_mushroom":1,"tree_resin":2},"reward":{"heroXP":20,"coins":65}},"sq_hunter":{"start":"sq_hunter_start","done":"sq_hunter_done","requires":null,"requiresAll":[],"sapphires":0,"objectives":[{"type":"enemy","id":"scavenger_02"}],"consume":{},"reward":{"heroXP":25,"coins":40,"items":{"tree_resin":2,"resin_flask":1,"amulet_focus":1}}},"sq_dust":{"start":"sq_dust_start","done":"sq_dust_done","requires":"lunar_quest_start","requiresAll":[],"sapphires":0,"objectives":[{"type":"item","item":"rune_dust","count":1}],"consume":{"rune_dust":1},"reward":{"heroXP":20,"items":{"lunar_shard":1,"elixir_mana":1,"amulet_lunar":1},"schoolXP":{"telekinesis":15}}}},"research":{"telekinesis_2":{"ability":"telekinesis","toLevel":2,"branch":null,"locked":false,"heroLevel":3,"abilityLevel":1,"event":"lunar_quest_complete","schoolXP":150,"items":{"lunar_shard":5,"moon_herb":2,"rune_dust":1,"coins":150},"sapphires":0,"durationMs":300000,"startEvent":"telekinesis_2_start","completeEvent":"telekinesis_2_complete"},"fire_2":{"ability":"fire","toLevel":2,"branch":null,"locked":false,"heroLevel":6,"abilityLevel":1,"event":null,"schoolXP":180,"items":{"crimson_ember":6,"coins":2000},"sapphires":200,"durationMs":900000,"startEvent":null,"completeEvent":null},"telekinesis_3_lord":{"ability":"telekinesis","toLevel":3,"branch":"lord","locked":false,"heroLevel":7,"abilityLevel":2,"event":null,"schoolXP":250,"items":{"lunar_shard":8,"rune_dust":3,"coins":10000},"sapphires":750,"durationMs":3600000,"startEvent":null,"completeEvent":null},"telekinesis_3_breaker":{"ability":"telekinesis","toLevel":3,"branch":"breaker","locked":false,"heroLevel":7,"abilityLevel":2,"event":null,"schoolXP":250,"items":{"lunar_shard":8,"rune_dust":3,"coins":10000},"sapphires":750,"durationMs":3600000,"startEvent":null,"completeEvent":null},"seal_2":{"ability":"seal","toLevel":2,"branch":null,"locked":false,"heroLevel":7,"abilityLevel":1,"event":null,"schoolXP":100,"items":{"lunar_shard":6,"coins":2000},"sapphires":200,"durationMs":1800000,"startEvent":null,"completeEvent":null},"fire_3_arsonist":{"ability":"fire","toLevel":3,"branch":"arsonist","locked":false,"heroLevel":8,"abilityLevel":2,"event":null,"schoolXP":300,"items":{"crimson_ember":10,"coins":10000},"sapphires":750,"durationMs":5400000,"startEvent":null,"completeEvent":null},"fire_3_blaster":{"ability":"fire","toLevel":3,"branch":"blaster","locked":false,"heroLevel":8,"abilityLevel":2,"event":null,"schoolXP":300,"items":{"crimson_ember":10,"coins":10000},"sapphires":750,"durationMs":5400000,"startEvent":null,"completeEvent":null},"seal_3_seer":{"ability":"seal","toLevel":3,"branch":"seer","locked":false,"heroLevel":8,"abilityLevel":2,"event":null,"schoolXP":300,"items":{"lunar_shard":10,"rune_dust":4,"coins":10000},"sapphires":750,"durationMs":7200000,"startEvent":null,"completeEvent":null},"seal_3_piercer":{"ability":"seal","toLevel":3,"branch":"piercer","locked":false,"heroLevel":8,"abilityLevel":2,"event":null,"schoolXP":300,"items":{"lunar_shard":10,"rune_dust":4,"coins":10000},"sapphires":750,"durationMs":7200000,"startEvent":null,"completeEvent":null}},"build":{"respecCoins":150,"branches":{"telekinesis":{"lord":{"fromLevel":3},"breaker":{"fromLevel":3}},"fire":{"arsonist":{"fromLevel":3},"blaster":{"fromLevel":3}},"seal":{"seer":{"fromLevel":3},"piercer":{"fromLevel":3}},"ice":{"frost":{"fromLevel":3},"shard":{"fromLevel":3}}},"slots":{"base":3,"extraAtLevel":null},"amuletSlots":2,"amulets":["amulet_focus","amulet_forest","amulet_lunar","amulet_frost"],"gifts":["telekinesis","fire","seal","ice"],"amuletUpgrades":[{"coins":120,"items":{"tree_resin":2,"rune_dust":1}},{"coins":220,"items":{"ice_crystal":2,"rune_dust":2}},{"coins":400,"items":{"frost_shard":2,"lunar_shard":3}}]},"spawnStart":{"scavenger_01":{"event":"combat_intro_01","requires":null},"lunar_guard":{"event":"lunar_guard_01","requires":"lunar_quest_start"},"forest_guardian_01":{"event":"forest_guardian_01","requires":null},"scavenger_02":{"event":"hunter_threat_01","requires":"sq_hunter_start"}},"sapphires":{"speedup":{"chunkMs":900000,"price":1,"maxCutPct":0.75,"minLeftMs":60000,"dailyChunks":24},"respec":5,"presetPrice":30,"presetMax":3,"welcome":3,"welcomeEvent":"ch2_city_arrived"},"bag":{"initial":100,"increment":50,"price":100,"max":1000000000,"version":29,"items":["moon_herb","lunar_shard","forest_mushroom","tree_resin","rune_dust","frost_herb","ice_crystal","frost_shard","cold_heart","elixir_life","elixir_mana","resin_flask","warm_potion","stabilizing_potion","brittle_flask","crystal_guard","reinforced_resin","astral_lens","crimson_ember","moonstone"]},"shop":{"requires":"city_merchant_open","buy":{"moon_herb":18,"forest_mushroom":20,"tree_resin":16,"rune_dust":28,"lunar_shard":45,"frost_herb":22,"ice_crystal":55},"sell":{"moon_herb":5,"forest_mushroom":6,"tree_resin":5,"rune_dust":9,"lunar_shard":14,"frost_herb":7,"ice_crystal":18},"maxQty":1000000},"daily":{"requires":"ch2_quarter_cleared","offers":5,"picks":3,"dayMs":86400000,"order":["herbs_alchemist","archive_crystal","warm_test","guard_resin","society_dust","healer_elixirs","coven_mushrooms","hunt_collectors","hunt_critter","hunt_rootlings","construct_test","guardian_hunt","hunt_wolves","hunt_wisps"],"pool":{"herbs_alchemist":{"goal":{"type":"deliver","items":{"frost_herb":4}},"reward":{"heroXP":40,"coins":30,"items":{"moon_herb":1}},"requires":null},"archive_crystal":{"goal":{"type":"deliver","items":{"ice_crystal":1}},"reward":{"heroXP":50,"coins":25,"items":{"rune_dust":1}},"requires":null},"warm_test":{"goal":{"type":"deliver","items":{"warm_potion":1}},"reward":{"heroXP":45,"coins":35,"items":{"ice_crystal":1}},"requires":null},"guard_resin":{"goal":{"type":"deliver","items":{"tree_resin":3}},"reward":{"heroXP":35,"coins":25,"items":{"forest_mushroom":1}},"requires":null},"society_dust":{"goal":{"type":"deliver","items":{"rune_dust":2}},"reward":{"heroXP":40,"coins":30,"items":{"lunar_shard":1}},"requires":null},"healer_elixirs":{"goal":{"type":"deliver","items":{"elixir_life":2}},"reward":{"heroXP":50,"coins":40},"requires":null},"coven_mushrooms":{"goal":{"type":"deliver","items":{"forest_mushroom":3}},"reward":{"heroXP":35,"coins":25,"items":{"frost_herb":1}},"requires":null},"hunt_collectors":{"goal":{"type":"wins","spawns":["wh_collector_1","wh_collector_2","fq_deep_1","fq_deep_2"],"count":2},"reward":{"heroXP":60,"coins":40,"items":{"ice_crystal":1}},"requires":null},"hunt_critter":{"goal":{"type":"wins","spawns":["fq_critter"],"count":1},"reward":{"heroXP":40,"coins":25,"items":{"frost_herb":2}},"requires":null},"hunt_rootlings":{"goal":{"type":"wins","spawns":["rootling_01","rootling_02","rootling_03"],"count":2},"reward":{"heroXP":45,"coins":30,"items":{"tree_resin":2}},"requires":null},"construct_test":{"goal":{"type":"wins","spawns":["lab_construct"],"count":1},"reward":{"heroXP":60,"coins":40,"items":{"ice_crystal":2}},"requires":"ch2_lab_open"},"guardian_hunt":{"goal":{"type":"wins","spawns":["fq_guardian"],"count":1},"reward":{"heroXP":60,"coins":40,"items":{"ice_crystal":1}},"requires":null},"hunt_wolves":{"goal":{"type":"wins","spawns":["fw_wolf_1","fw_wolf_2","fw_wolf_3","fw_wolf_4"],"count":3},"reward":{"heroXP":60,"coins":40,"items":{"ice_crystal":1}},"requires":"chapter_2_complete"},"hunt_wisps":{"goal":{"type":"wins","spawns":["gy_wisp_1","gy_wisp_2"],"count":2},"reward":{"heroXP":55,"coins":35,"items":{"rune_dust":2}},"requires":"chapter_2_complete"}}},"covens":{"requires":"ch2_coven_ready","maxMembers":20,"goal":400,"minGiven":20,"dailyPoints":10,"maxGive":99,"points":{"moon_herb":1,"forest_mushroom":1,"tree_resin":1,"frost_herb":2,"rune_dust":2,"lunar_shard":3,"ice_crystal":5},"reward":{"coins":120,"items":{"ice_crystal":2,"frost_shard":1}}},"duel":{"requires":"chapter_2_complete","attemptsPerDay":8,"baseRating":1000,"k":32,"dayMs":86400000,"seasonStartMs":1791158400000,"seasonMs":2419200000,"matchWindow":200,"reward":{"victory":{"coins":30,"heroXP":20},"defeat":{"coins":10}}},"ratings":{"top":50,"onlineSec":100,"levels":{"forest_scavenger":2,"young_scavenger":1,"frost_critter":9,"frost_collector":10,"frost_collector_elite":11,"ice_guardian":12,"volunteer":12,"experimental_construct":13,"severin_boss":15,"frost_wolf":13,"frost_alpha":15,"grave_wisp":13,"grave_hound":14,"barrow_warden":15,"rootling":5,"forest_guardian":6,"node_guardian":8},"rank":{"forest_scavenger":200,"young_scavenger":100,"frost_critter":900,"frost_collector":1000,"frost_collector_elite":1110,"ice_guardian":1210,"volunteer":1200,"experimental_construct":1310,"severin_boss":1522,"frost_wolf":1300,"frost_alpha":1520,"grave_wisp":1301,"grave_hound":1400,"barrow_warden":1521,"rootling":500,"forest_guardian":610,"node_guardian":820},"power":{"forest_scavenger":160,"young_scavenger":110,"frost_critter":440,"frost_collector":520,"frost_collector_elite":760,"ice_guardian":780,"volunteer":600,"experimental_construct":850,"severin_boss":1500,"frost_wolf":650,"frost_alpha":1300,"grave_wisp":560,"grave_hound":700,"barrow_warden":1400,"rootling":230,"forest_guardian":420,"node_guardian":900},"spawns":{"scavenger_01":"forest_scavenger","lunar_guard":"young_scavenger","forest_guardian_01":"forest_guardian","scavenger_02":"young_scavenger","rootling_01":"rootling","rootling_02":"rootling","rootling_03":"rootling","rootling_04":"rootling","rootling_05":"rootling","node_trial":"node_guardian","plaza_critter":"frost_critter","road_scavenger":"young_scavenger","wh_collector_1":"frost_collector","wh_collector_2":"frost_collector","wh_elite":"frost_collector_elite","lab_critter":"frost_critter","fq_critter":"frost_critter","fq_collector":"frost_collector","fq_training":"frost_critter","fq_deep_1":"frost_collector","fq_deep_2":"frost_collector","fq_guardian":"ice_guardian","yard_brittle_1":"frost_collector","yard_brittle_2":"frost_collector","vol_1":"volunteer","vol_2":"volunteer","lab_construct":"experimental_construct","unstable_1":"frost_collector","unstable_2":"frost_collector","final_critter":"frost_critter","final_collector":"frost_collector","final_construct":"experimental_construct","final_severin":"severin_boss","fw_wolf_1":"frost_wolf","fw_wolf_2":"frost_wolf","fw_wolf_3":"frost_wolf","fw_wolf_4":"frost_wolf","fw_alpha":"frost_alpha","gy_wisp_1":"grave_wisp","gy_hound_1":"grave_hound","gy_wisp_2":"grave_wisp","gy_hound_2":"grave_hound","gy_warden":"barrow_warden"}},"combatPotions":["elixir_life","elixir_mana","resin_flask","warm_potion","stabilizing_potion","brittle_flask","crystal_guard"]}'::jsonb $r$;

create or replace function public.player_action(action jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  pr player_progress%rowtype;
  op text; aid text; mx_hp numeric; mx_mana numeric; cur numeric; price numeric; coins numeric; res jsonb;
  rules jsonb; r jsonb; u jsonb; m jsonb; k text; v jsonb; missing jsonb; first boolean; prev jsonb; core boolean;
  wid text; od jsonb; now_ms numeric; lft numeric; wins numeric; claimed numeric; locked boolean;
  ab text; lvl int; curid text; opt jsonb; ev text;
  wl player_wallet%rowtype; sp jsonb; dur numeric; fullms numeric; started numeric; maxcut numeric; dday numeric; used numeric; avail numeric; cut numeric; steps numeric; price2 numeric; slot int;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public._require_game_access();
  if action is null or jsonb_typeof(action) <> 'object' then raise exception 'bad_action' using errcode = '22023'; end if;
  select * into pr from player_progress where user_id = uid for update;
  if not found then raise exception 'no_player' using errcode = 'P0002'; end if;
  op := action ->> 'op';
  aid := case when jsonb_typeof(action -> 'id') = 'string' and char_length(action ->> 'id') between 8 and 64 then action ->> 'id' end;
  if aid is not null and op in ('bag_expand','research_start') and exists (select 1 from sapphire_ledger where user_id=uid and ref=(case when op='bag_expand' then 'bag:' else 'research:' end)||aid) then
    return _snapshot(uid)||jsonb_build_object('action',jsonb_build_object('ok',true,'duplicate',true,'capacity',_bag(uid)->'capacity'));
  end if;
  if aid is not null and pr.recent_syncs ? aid then
    -- повтор: сохранённый результат первой попытки (или просто «повтор» для действий до v0.10)
    select e -> 'result' into prev from jsonb_array_elements(pr.recent_actions) e where e ->> 'id' = aid limit 1;
    return _snapshot(uid) || jsonb_build_object('action', coalesce(prev || '{"duplicate": true}'::jsonb, jsonb_build_object('ok', null, 'reason', 'duplicate')));
  end if;
  if aid is not null then
    pr.recent_syncs := (select coalesce(jsonb_agg(e order by i), '[]'::jsonb) from (
      select e, i from jsonb_array_elements(pr.recent_syncs || to_jsonb(aid)) with ordinality as t(e, i) order by i desc limit 20) z);
  end if;
  pr := _advance(pr);   -- v0.12.0: восстановление HP и маны до «сейчас», затем действие
  select max_hp, max_mana into mx_hp, mx_mana from game_hero_levels where level = pr.hero_level;
  if mx_hp is null then select max_hp, max_mana into mx_hp, mx_mana from game_hero_levels order by level desc limit 1; end if;
  rules := _game_rules();
  if op in ('bag_expand','bag_discard','bag_claim') then
    od:=_bag(uid); r:=rules->'bag';
    if pr.combat_since is not null then res:=jsonb_build_object('ok',false,'reason','combat');
    elsif op='bag_expand' then
      price:=(r->>'price')::numeric;
      if (od->>'capacity')::numeric > (r->>'max')::numeric-(r->>'increment')::numeric then res:=jsonb_build_object('ok',false,'reason','max');
      elsif _sapphires(uid)<price then res:=jsonb_build_object('ok',false,'reason','sapphires','need',price);
      else
        perform _sapphire_add(uid,-price::bigint,'bag','bag_expand',case when aid is not null then 'bag:'||aid end);
        od:=jsonb_set(od,'{capacity}',to_jsonb((od->>'capacity')::numeric+(r->>'increment')::numeric));
        perform _bag_write(uid,od);
        res:=jsonb_build_object('ok',true,'capacity',od->'capacity','price',price);
      end if;
    else
      k:=action->>'item'; cur:=_num(action->'qty');
      if not coalesce((r->'items') ? k,false) or cur is null or cur<1 or cur<>trunc(cur) or cur>1000000000 then res:=jsonb_build_object('ok',false,'reason','bad');
      elsif op='bag_claim' or action->'pending'='true'::jsonb then
        if coalesce((od->'pending'->>k)::numeric,0)<cur then res:=jsonb_build_object('ok',false,'reason','missing');
        else
          if op='bag_claim' then perform _inv_add(uid,k,cur); end if;
          od:=jsonb_set(od,array['pending',k],to_jsonb((od->'pending'->>k)::numeric-cur));
          if (od->'pending'->>k)::numeric=0 then od:=od #- array['pending',k]; end if;
          perform _bag_write(uid,od); res:=jsonb_build_object('ok',true,'item',k,'qty',cur);
        end if;
      elsif _inv(uid,k)<cur then res:=jsonb_build_object('ok',false,'reason','missing');
      else perform _inv_add(uid,k,-cur); res:=jsonb_build_object('ok',true,'item',k,'qty',cur); end if;
    end if;
  elsif op = 'heal' then
    cur := _clamp(coalesce(pr.hp::numeric, mx_hp), 0, mx_hp);
    price := ceil((mx_hp - cur) / 10.0 - 1e-9);
    select quantity into coins from player_inventory where user_id = uid and item_id = 'coins';
    coins := coalesce(coins, 0);
    if pr.combat_since is not null then res := jsonb_build_object('ok', false, 'reason', 'combat', 'price', 0);
    elsif price <= 0 then res := jsonb_build_object('ok', false, 'reason', 'full', 'price', 0);
    elsif coins < price then res := jsonb_build_object('ok', false, 'reason', 'coins', 'price', price);
    else
      update player_inventory set quantity = quantity - price where user_id = uid and item_id = 'coins';
      pr.hp := mx_hp;
      res := jsonb_build_object('ok', true, 'price', price);
    end if;
  elsif op = 'drink' then
    -- зелье из сумки вне боя: настой жизни / лунный эликсир возвращают долю максимума; при полном запасе не тратятся
    u := case when jsonb_typeof(action -> 'item') = 'string' then rules -> 'potions' -> (action ->> 'item') end;
    if u is null then res := jsonb_build_object('ok', false, 'reason', 'unknown');
    elsif pr.combat_since is not null then res := jsonb_build_object('ok', false, 'reason', 'combat');
    elsif _inv(uid, action ->> 'item') < 1 then res := jsonb_build_object('ok', false, 'reason', 'none');
    elsif u ->> 'kind' = 'heal' then
      cur := _clamp(coalesce(pr.hp::numeric, mx_hp), 0, mx_hp);
      if cur >= mx_hp then res := jsonb_build_object('ok', false, 'reason', 'full', 'kind', 'heal');
      else
        perform _inv_add(uid, action ->> 'item', -1);
        price := round(mx_hp * (u ->> 'amount')::numeric);
        pr.hp := least(mx_hp, cur + price);
        res := jsonb_build_object('ok', true, 'kind', 'heal', 'amount', pr.hp - cur);
      end if;
    else
      cur := _clamp(coalesce(pr.mana::numeric, mx_mana), 0, mx_mana);
      if cur >= mx_mana then res := jsonb_build_object('ok', false, 'reason', 'full', 'kind', 'mana');
      else
        perform _inv_add(uid, action ->> 'item', -1);
        price := round(mx_mana * (u ->> 'amount')::numeric);
        pr.mana := least(mx_mana, cur + price);
        res := jsonb_build_object('ok', true, 'kind', 'mana', 'amount', pr.mana - cur);
      end if;
    end if;
  elsif op = 'world' then
    -- v0.13.0: сбор узла, находка, запас или магия в мире (правила _game_rules().world; зеркало worldAct в playerModel.js).
    -- Порядок проверок: неизвестный объект → бой → закрыто → уже сделано / ещё не выросло → мана.
    wid := case when jsonb_typeof(action -> 'obj') = 'string' then action ->> 'obj' end;
    r := case when wid is not null then rules -> 'world' -> wid end;
    now_ms := (extract(epoch from pr.vitals_at) * 1000)::bigint;
    if r is null then res := jsonb_build_object('ok', false, 'reason', 'unknown');
    elsif pr.combat_since is not null then res := jsonb_build_object('ok', false, 'reason', 'combat');
    else
      locked := exists (select 1 from jsonb_array_elements_text(r -> 'requires') e where not _has_event(uid, e))
        or exists (select 1 from jsonb_array_elements_text(r -> 'requiresEnemy') e where not exists (select 1 from player_world where user_id = uid and kind = 'enemy' and key = e))
        or (r ? 'parent' and coalesce((select data ->> 'state' from player_world where user_id = uid and kind = 'object' and key = r #>> '{parent,id}'), '') <> r #>> '{parent,state}')
        or (r ? 'ability' and not exists (select 1 from player_abilities where user_id = uid and ability_id = r ->> 'ability' and unlocked and level >= coalesce((r ->> 'minLevel')::int, 1)));
      select data into od from player_world where user_id = uid and kind = 'object' and key = wid;
      if locked then res := jsonb_build_object('ok', false, 'reason', 'locked');
      -- v0.18.0: дар для действия должен стоять в слоте (JS: equippedNow)
      elsif r ? 'ability' and not (_build_slots_now(uid, pr.hero_level,
              coalesce((select case when jsonb_typeof(data) = 'object' then data end from player_world where user_id = uid and kind = 'object' and key = 'player_build'), '{}'::jsonb),
              rules -> 'build') ? (r ->> 'ability')) then res := jsonb_build_object('ok', false, 'reason', 'benched');
      elsif exists (select 1 from jsonb_array_elements_text(coalesce(r -> 'blockedBy', '[]'::jsonb)) e where _has_event(uid, e)) then res := jsonb_build_object('ok', false, 'reason', 'done');
      elsif r ->> 'kind' in ('loot', 'cast') and r ? 'mark' and od ->> 'state' = r ->> 'mark' then res := jsonb_build_object('ok', false, 'reason', 'done');
      elsif r ->> 'kind' = 'gather' and od ->> 'state' = 'picked'
        and (coalesce(_num(od -> 't'), 0) + (r ->> 'respawnSec')::numeric * 1000 - now_ms) > 0 then
        lft := ceil((coalesce(_num(od -> 't'), 0) + (r ->> 'respawnSec')::numeric * 1000 - now_ms) / 1000);
        res := jsonb_build_object('ok', false, 'reason', 'wait', 'left', lft);
      else
        if r ->> 'kind' = 'stash' then
          select data into u from player_world where user_id = uid and kind = 'object' and key = 'rep:' || (r ->> 'guard');
          wins := coalesce(_num(u -> 'wins'), case when exists (select 1 from player_world where user_id = uid and kind = 'enemy' and key = r ->> 'guard') then 1 else 0 end);
          claimed := coalesce(_num(od -> 'claimed'), 0);
        end if;
        if r ->> 'kind' = 'stash' and wins <= 0 then res := jsonb_build_object('ok', false, 'reason', 'locked');
        elsif r ->> 'kind' = 'stash' and wins <= claimed then res := jsonb_build_object('ok', false, 'reason', 'done');
        elsif r ? 'mana' and _clamp(coalesce(pr.mana::numeric, mx_mana), 0, mx_mana) < (r ->> 'mana')::numeric then
          res := jsonb_build_object('ok', false, 'reason', 'mana', 'mana', (r ->> 'mana')::numeric);
        else
          if r ? 'mana' then pr.mana := _clamp(coalesce(pr.mana::numeric, mx_mana), 0, mx_mana) - (r ->> 'mana')::numeric; end if;
          if r ->> 'kind' = 'gather' then
            perform _inv_add(uid, r ->> 'item', (r ->> 'amount')::numeric);
            insert into player_world (user_id, kind, key, data) values (uid, 'object', wid, jsonb_build_object('state', 'picked', 't', now_ms))
              on conflict (user_id, kind, key) do update set data = excluded.data;
          elsif r ->> 'kind' = 'loot' then
            pr := _grant(uid, pr, r -> 'reward');
            if coalesce((r -> 'reward' ->> 'sapphires')::bigint, 0) > 0 then perform _sapphire_add(uid, (r -> 'reward' ->> 'sapphires')::bigint, 'reward', wid, 'world:' || wid); end if;
            insert into player_world (user_id, kind, key, data) values (uid, 'object', wid, jsonb_build_object('state', r ->> 'mark'))
              on conflict (user_id, kind, key) do update set data = excluded.data;
          elsif r ->> 'kind' = 'stash' then
            pr := _grant(uid, pr, jsonb_build_object('items', r -> 'items'));
            insert into player_world (user_id, kind, key, data) values (uid, 'object', wid, coalesce(od, '{}'::jsonb) || jsonb_build_object('claimed', wins))
              on conflict (user_id, kind, key) do update set data = excluded.data;
          elsif r ? 'mark' then
            insert into player_world (user_id, kind, key, data) values (uid, 'object', wid, jsonb_build_object('state', r ->> 'mark'))
              on conflict (user_id, kind, key) do update set data = excluded.data;
          end if;
          -- v0.15.0: опыт дара за применение в мире, события и путь, которые открывает успех (с наградами событий)
          for k, v in select * from jsonb_each(coalesce(r -> 'school', '{}'::jsonb)) loop
            if (v #>> '{}')::numeric > 0 then
              pr.school_xp := jsonb_set(pr.school_xp, array[k], to_jsonb(_clamp(coalesce((pr.school_xp ->> k)::numeric, 0) + (v #>> '{}')::numeric, 0, 1000000000)));
            end if;
          end loop;
          for ev in select * from jsonb_array_elements_text(coalesce(r -> 'events', '[]'::jsonb)) loop pr := _set_event(uid, pr, ev, rules); end loop;
          if r ? 'path' then perform _open_path(uid, r ->> 'path'); end if;
          res := jsonb_build_object('ok', true, 'kind', r ->> 'kind', 'id', wid, 'mana', coalesce((r ->> 'mana')::numeric, 0));
        end if;
      end if;
    end if;
  elsif op = 'combat_start' then
    -- с этого момента восстановление стоит, а лечение и зелья из сумки закрыты; повтор не сдвигает начало.
    -- v0.14.0: сервер запоминает состояние героя — по нему Edge Function combat потом проигрывает запись боя.
    -- Клиент называет только место боя (spawn) и врага; допустимость пары проверяет проигрыш (cloud/combatVerify.js).
    if not coalesce(_valid_id(action ->> 'spawn'), false) or not coalesce(_valid_id(action ->> 'enemy'), false) then
      res := jsonb_build_object('ok', false, 'reason', 'bad_spawn');
    else
      if pr.combat_since is null then pr.combat_since := pr.vitals_at; end if;
      cur := _clamp(coalesce(pr.hp::numeric, mx_hp), 0, mx_hp);
      price := _clamp(coalesce(pr.mana::numeric, mx_mana), 0, mx_mana);
      pr.combat_ctx := jsonb_build_object(
        'balanceVersion', case when action->'balanceVersion'='30'::jsonb then 30 else 29 end,
        'spawn', action ->> 'spawn', 'enemy', action ->> 'enemy', 'level', pr.hero_level,
        'abilities', (select jsonb_object_agg(a, jsonb_build_object('level', coalesce(pa.level, 0), 'unlocked', coalesce(pa.unlocked, false)))
                        from unnest(array['telekinesis', 'fire', 'seal', 'ice']) a left join player_abilities pa on pa.user_id = uid and pa.ability_id = a),
        'hp', cur, 'mana', price,
        'potions', (select jsonb_object_agg(p, _inv(uid, p)) from jsonb_array_elements_text(rules -> 'combatPotions') p),   -- v0.19.0: список из правил
        'build', (select data from player_world where user_id = uid and kind = 'object' and key = 'player_build'));
      -- v0.15.0: событие «встреча началась» (combat_intro_01 и др.) ставит сервер, если место боя уже открыто
      u := rules -> 'spawnStart' -> (action ->> 'spawn');
      if u is not null and (u ->> 'requires' is null or _has_event(uid, u ->> 'requires')) then pr := _set_event(uid, pr, u ->> 'event', rules); end if;
      res := jsonb_build_object('ok', true, 'hp', cur, 'mana', price);
    end if;
  elsif op = 'combat_end' then
    -- итог боя без проверки записи — только отступление (перезагрузка посреди боя): HP не ниже 20% максимума, мана как была.
    -- Победа и поражение с v0.14.0 принимаются только через combat_apply (Edge Function combat), пока сервер запомнил состояние боя.
    -- Без запомненного состояния (бой начат до обновления) работает прежнее правило: остаток маны сообщает клиент.
    if pr.combat_since is null then res := jsonb_build_object('ok', false, 'reason', 'no_combat');
    elsif coalesce(action ->> 'outcome', '') not in ('victory', 'defeat', 'retreat') then res := jsonb_build_object('ok', false, 'reason', 'bad_outcome');
    elsif action ->> 'outcome' <> 'retreat' and pr.combat_ctx is not null then res := jsonb_build_object('ok', false, 'reason', 'verify');
    else
      cur := _clamp(coalesce(pr.hp::numeric, mx_hp), 0, mx_hp);
      price := greatest(1, ceil(mx_hp * (rules -> 'vitals' ->> 'defeatHpFraction')::numeric - 1e-9));
      if action ->> 'outcome' = 'victory' then pr.hp := mx_hp;
      elsif action ->> 'outcome' = 'defeat' then pr.hp := price;
      else pr.hp := greatest(cur, price);
      end if;
      if action ->> 'outcome' <> 'retreat' and _num(action -> 'mana') is not null then pr.mana := _clamp(_num(action -> 'mana'), 0, mx_mana); end if;
      pr.combat_since := null;
      pr.combat_ctx := null;
      res := jsonb_build_object('ok', true, 'outcome', action ->> 'outcome');
    end if;
  elsif op = 'event' then
    -- v0.15.0: сюжетное событие по действию игрока (rules.events: условия, дар, награда EVENT_REWARDS). Зеркало eventAct.
    ev := case when jsonb_typeof(action -> 'key') = 'string' then action ->> 'key' end;
    r := case when ev is not null then rules -> 'events' -> ev end;
    if r is null then res := jsonb_build_object('ok', false, 'reason', 'unknown');
    elsif _has_event(uid, ev) then res := jsonb_build_object('ok', false, 'reason', 'already');
    elsif exists (select 1 from jsonb_array_elements_text(coalesce(r -> 'blockedBy', '[]')) e where _has_event(uid, e)) then res := jsonb_build_object('ok', false, 'reason', 'done');
    elsif exists (select 1 from jsonb_array_elements_text(r -> 'requires') e where not _has_event(uid, e)) then res := jsonb_build_object('ok', false, 'reason', 'locked');
    elsif exists (select 1 from jsonb_each(coalesce(r -> 'consume', '{}')) c where _inv(uid, c.key) < (c.value #>> '{}')::numeric) then res := jsonb_build_object('ok', false, 'reason', 'missing');
    else
      -- v0.22.0: предметы, которые забирает событие; ветка дара; сопутствующие события; сапфиры (один раз, ref event:<ключ>)
      for k, v in select * from jsonb_each(coalesce(r -> 'consume', '{}')) loop perform _inv_add(uid, k, -(v #>> '{}')::numeric); end loop;
      pr := _set_event(uid, pr, ev, rules);
      for k, v in select * from jsonb_each(r -> 'unlock') loop perform _unlock_ability(uid, k, (v #>> '{}')::int); end loop;
      for k, v in select * from jsonb_each(coalesce(r -> 'branch', '{}')) loop perform _set_branch(uid, k, v #>> '{}'); end loop;
      for k in select * from jsonb_array_elements_text(coalesce(r -> 'marks', '[]')) loop pr := _set_event(uid, pr, k, rules); end loop;
      if coalesce((r ->> 'sapphires')::bigint, 0) > 0 then perform _sapphire_add(uid, (r ->> 'sapphires')::bigint, 'reward', ev, 'event:' || ev); end if;
      res := jsonb_build_object('ok', true, 'key', ev);
    end if;
  elsif op = 'quest_accept' then
    r := case when jsonb_typeof(action -> 'quest') = 'string' then rules -> 'quests' -> (action ->> 'quest') end;
    if r is null then res := jsonb_build_object('ok', false, 'reason', 'unknown');
    elsif _has_event(uid, r ->> 'done') or _has_event(uid, r ->> 'start') then res := jsonb_build_object('ok', false, 'reason', 'already');
    elsif (r ->> 'requires' is not null and not _has_event(uid, r ->> 'requires')) or exists (select 1 from jsonb_array_elements_text(coalesce(r -> 'requiresAll', '[]'::jsonb)) e where not _has_event(uid, e)) then res := jsonb_build_object('ok', false, 'reason', 'locked');
    else
      perform _add_event(uid, r ->> 'start');
      res := jsonb_build_object('ok', true, 'id', action ->> 'quest');
    end if;
  elsif op = 'quest_turn_in' then
    r := case when jsonb_typeof(action -> 'quest') = 'string' then rules -> 'quests' -> (action ->> 'quest') end;
    if r is null then res := jsonb_build_object('ok', false, 'reason', 'unknown');
    elsif _has_event(uid, r ->> 'done') then res := jsonb_build_object('ok', false, 'reason', 'already');
    elsif not _has_event(uid, r ->> 'start') then res := jsonb_build_object('ok', false, 'reason', 'not_started');
    elsif exists (select 1 from jsonb_array_elements(r -> 'objectives') o where not (
        case o ->> 'type'
          when 'item' then _inv(uid, o ->> 'item') >= (o ->> 'count')::numeric
          when 'enemy' then exists (select 1 from player_world where user_id = uid and kind = 'enemy' and key = o ->> 'id')
          else _has_event(uid, o ->> 'key') end)) then res := jsonb_build_object('ok', false, 'reason', 'not_ready');
    elsif exists (select 1 from jsonb_each(r -> 'consume') where _inv(uid, key) < (value #>> '{}')::numeric) then res := jsonb_build_object('ok', false, 'reason', 'missing');
    else
      for k, v in select * from jsonb_each(r -> 'consume') loop perform _inv_add(uid, k, -(v #>> '{}')::numeric); end loop;
      perform _add_event(uid, r ->> 'done');
      pr := _grant(uid, pr, r -> 'reward');
      if coalesce((r ->> 'sapphires')::bigint, 0) > 0 then perform _sapphire_add(uid, (r ->> 'sapphires')::bigint, 'reward', action ->> 'quest', 'quest:' || (action ->> 'quest')); end if;
      res := jsonb_build_object('ok', true, 'id', action ->> 'quest');
    end if;
  elsif op = 'research_start' then
    -- v0.15.0: изучение дара — условия, цена и таймер по времени сервера (rules.research). Зеркало researchStart.
    ev := case when jsonb_typeof(action -> 'upgrade') = 'string' then action ->> 'upgrade' end;
    u := case when ev is not null then rules -> 'research' -> ev end;
    if u is null then res := jsonb_build_object('ok', false, 'reason', 'unknown');
    else
      ab := u ->> 'ability';
      lvl := coalesce((select level from player_abilities where user_id = uid and ability_id = ab), 0);
      now_ms := (extract(epoch from pr.vitals_at) * 1000)::bigint;
      if (u ->> 'locked')::boolean then res := jsonb_build_object('ok', false, 'reason', 'locked');
      elsif lvl >= (u ->> 'toLevel')::int then res := jsonb_build_object('ok', false, 'reason', 'done');
      elsif pr.research is not null then res := jsonb_build_object('ok', false, 'reason', case when pr.research ->> 'upgradeId' = ev then 'in_progress' else 'busy' end);
      elsif u ->> 'event' is not null and not _has_event(uid, u ->> 'event') then res := jsonb_build_object('ok', false, 'reason', 'event');
      elsif not (pr.hero_level >= (u ->> 'heroLevel')::int and lvl >= (u ->> 'abilityLevel')::int
          and coalesce((pr.school_xp ->> ab)::numeric, 0) >= (u ->> 'schoolXP')::numeric
          and not exists (select 1 from jsonb_each(u -> 'items') where _inv(uid, key) < (value #>> '{}')::numeric)) then
        res := jsonb_build_object('ok', false, 'reason', 'missing');
      elsif pr.combat_since is not null then res:=jsonb_build_object('ok',false,'reason','combat');
      elsif _sapphires(uid)<coalesce((u->>'sapphires')::numeric,0) then res:=jsonb_build_object('ok',false,'reason','sapphires','need',u->'sapphires');
      else
        if coalesce((u->>'sapphires')::numeric,0)>0 then perform _sapphire_add(uid,-(u->>'sapphires')::bigint,'research','research:'||ev,case when aid is not null then 'research:'||aid end); end if;
        pr.school_xp := jsonb_set(pr.school_xp, array[ab], to_jsonb(coalesce((pr.school_xp ->> ab)::numeric, 0) - (u ->> 'schoolXP')::numeric));
        for k, v in select * from jsonb_each(u -> 'items') loop perform _inv_add(uid, k, -(v #>> '{}')::numeric); end loop;
        pr.research := jsonb_build_object('upgradeId', ev, 'startedAt', now_ms, 'durationMs', (u ->> 'durationMs')::numeric);
        if u ->> 'startEvent' is not null then pr := _set_event(uid, pr, u ->> 'startEvent', rules); end if;
        res := jsonb_build_object('ok', true, 'upgrade', ev);
      end if;
    end if;
  elsif op = 'research_finish' then
    if pr.research is null then res := jsonb_build_object('ok', false, 'reason', 'none');
    else
      ev := pr.research ->> 'upgradeId';
      u := rules -> 'research' -> ev;
      now_ms := (extract(epoch from pr.vitals_at) * 1000)::bigint;
      if u is null then res := jsonb_build_object('ok', false, 'reason', 'unknown');
      else
        lft := coalesce(_num(pr.research -> 'startedAt'), 0) + coalesce(_num(pr.research -> 'durationMs'), (u ->> 'durationMs')::numeric) - now_ms;
        if lft > 0 then res := jsonb_build_object('ok', false, 'reason', 'wait', 'left', ceil(lft / 1000));
        else
          perform _unlock_ability(uid, u ->> 'ability', (u ->> 'toLevel')::int);
          if u ->> 'branch' is not null then perform _set_branch(uid, u ->> 'ability', u ->> 'branch'); end if;
          pr.research := null;
          if u ->> 'completeEvent' is not null then pr := _set_event(uid, pr, u ->> 'completeEvent', rules); end if;
          res := jsonb_build_object('ok', true, 'upgrade', ev, 'events', case when u ->> 'completeEvent' is not null then jsonb_build_array(u ->> 'completeEvent') else '[]'::jsonb end);
        end if;
      end if;
    end if;
  elsif op = 'respec' then
    -- v0.15.0: смена ветки дара за монеты (rules.build). Зеркало respec.
    ab := case when jsonb_typeof(action -> 'ability') = 'string' and _valid_id(action ->> 'ability') then action ->> 'ability' end;
    ev := case when jsonb_typeof(action -> 'branch') = 'string' and _valid_id(action ->> 'branch') then action ->> 'branch' end;
    m := rules -> 'build';
    opt := case when ab is not null and ev is not null then m -> 'branches' -> ab -> ev end;
    lvl := coalesce((select level from player_abilities where user_id = uid and ability_id = ab), 0);
    select data -> 'branches' ->> ab into curid from player_world where user_id = uid and kind = 'object' and key = 'player_build';
    u := case when curid is not null and _valid_id(curid) and ab is not null then m -> 'branches' -> ab -> curid end;
    if opt is null or u is null or lvl < (u ->> 'fromLevel')::int or lvl < (opt ->> 'fromLevel')::int then res := jsonb_build_object('ok', false, 'reason', 'unavailable');
    elsif pr.combat_since is not null then res := jsonb_build_object('ok', false, 'reason', 'combat');
    elsif curid = ev then res := jsonb_build_object('ok', false, 'reason', 'same');
    elsif action ->> 'pay' = 'sapphires' and jsonb_typeof(action -> 'pay') = 'string' then
      -- v0.17.0: смена ветки за сапфиры (rules.sapphires.respec)
      price2 := (rules -> 'sapphires' ->> 'respec')::numeric;
      if _sapphires(uid) < price2 then res := jsonb_build_object('ok', false, 'reason', 'sapphires', 'need', price2);
      else
        perform _sapphire_add(uid, -price2::bigint, 'respec', ab || ':' || ev, null);
        perform _set_branch(uid, ab, ev);
        res := jsonb_build_object('ok', true, 'price', price2, 'currency', 'sapphires');
      end if;
    elsif _inv(uid, 'coins') < (m ->> 'respecCoins')::numeric then res := jsonb_build_object('ok', false, 'reason', 'coins', 'need', (m ->> 'respecCoins')::numeric);
    else
      perform _inv_add(uid, 'coins', -(m ->> 'respecCoins')::numeric);
      perform _set_branch(uid, ab, ev);
      res := jsonb_build_object('ok', true, 'price', (m ->> 'respecCoins')::numeric);
    end if;
  elsif op = 'build_set' then
    -- v0.16.0: слоты даров и амулеты (rules.build). Зеркало buildSet; проверки — _build_reason.
    m := rules -> 'build';
    curid := _build_reason(uid, pr.hero_level, pr.combat_since is not null, action -> 'slots', action -> 'amulets', m);
    if curid is not null then res := jsonb_build_object('ok', false, 'reason', curid);
    else
      od := '{}'::jsonb;
      if jsonb_typeof(action -> 'slots') = 'array' then od := od || jsonb_build_object('slots', action -> 'slots'); end if;
      if jsonb_typeof(action -> 'amulets') = 'array' then od := od || jsonb_build_object('amulets', action -> 'amulets'); end if;
      perform _merge_build(uid, od);
      res := jsonb_build_object('ok', true);
    end if;
  elsif op = 'build_preset' then
    -- v0.16.0: пресет билда: слоты и амулеты (ветки за монеты не трогает). v0.17.0: номер пресета slot (1 — бесплатный, следующие — за сапфиры).
    -- Зеркало buildPreset.
    ev := case when jsonb_typeof(action -> 'mode') = 'string' then action ->> 'mode' end;
    m := rules -> 'build';
    select data into od from player_world where user_id = uid and kind = 'object' and key = 'player_build';
    od := case when jsonb_typeof(od) = 'object' then od else '{}'::jsonb end;
    cut := case when action -> 'slot' is null or jsonb_typeof(action -> 'slot') = 'null' then 1
                when jsonb_typeof(action -> 'slot') = 'number' then (action ->> 'slot')::numeric end;
    k := case when cut = 1 then 'preset' when cut between 2 and 99 and cut = trunc(cut) then 'preset' || cut::int end;
    if ev is null or ev not in ('save', 'load') then res := jsonb_build_object('ok', false, 'reason', 'bad');
    elsif cut is null or cut <> trunc(cut) or cut < 1 or cut > (rules -> 'sapphires' ->> 'presetMax')::numeric then res := jsonb_build_object('ok', false, 'reason', 'bad');
    elsif pr.combat_since is not null then res := jsonb_build_object('ok', false, 'reason', 'combat');
    elsif cut > _preset_slots(od, rules) then res := jsonb_build_object('ok', false, 'reason', 'locked');
    elsif ev = 'save' then
      perform _merge_build(uid, jsonb_build_object(k, jsonb_build_object(
        'slots', _build_slots_now(uid, pr.hero_level, od, m),
        'amulets', coalesce((select jsonb_agg(e order by i) from jsonb_array_elements_text(_str_items(od -> 'amulets')) with ordinality t(e, i) where (m -> 'amulets') ? e), '[]'::jsonb))));
      res := jsonb_build_object('ok', true);
    elsif jsonb_typeof(od -> k) <> 'object' or od -> k is null then res := jsonb_build_object('ok', false, 'reason', 'empty');
    else
      perform _merge_build(uid, jsonb_build_object('slots', _str_items(od -> k -> 'slots'), 'amulets', _str_items(od -> k -> 'amulets')));
      res := jsonb_build_object('ok', true);
    end if;
  elsif op = 'research_speedup' then
    -- v0.17.0: ускорить изучение за сапфиры (rules.sapphires.speedup). Зеркало researchSpeedup.
    sp := rules -> 'sapphires' -> 'speedup';
    steps := case when jsonb_typeof(action -> 'chunks') = 'number' then (action ->> 'chunks')::numeric end;
    if steps is null or steps <> trunc(steps) or steps < 1 or steps > 96 then res := jsonb_build_object('ok', false, 'reason', 'bad');
    elsif pr.research is null or jsonb_typeof(pr.research) <> 'object' then res := jsonb_build_object('ok', false, 'reason', 'none');
    else
      now_ms := (extract(epoch from pr.vitals_at) * 1000)::bigint;
      started := coalesce(_num(pr.research -> 'startedAt'), 0);
      u := case when jsonb_typeof(pr.research -> 'upgradeId') = 'string' then rules -> 'research' -> (pr.research ->> 'upgradeId') end;
      dur := coalesce(_num(pr.research -> 'durationMs'), (u ->> 'durationMs')::numeric, 0);
      fullms := coalesce(_num(pr.research -> 'fullMs'), dur);
      maxcut := dur - greatest(fullms - floor(fullms * (sp ->> 'maxCutPct')::numeric), now_ms - started + (sp ->> 'minLeftMs')::numeric);
      select * into wl from player_wallet where user_id = uid for update;
      dday := floor(now_ms / 86400000.0);
      used := case when coalesce(_num(wl.daily -> 'd'), -1) = dday then coalesce(_num(wl.daily -> 'n'), 0) else 0 end;
      avail := (sp ->> 'dailyChunks')::numeric - used;
      if maxcut <= 0 then res := jsonb_build_object('ok', false, 'reason', 'limit');
      elsif avail <= 0 then res := jsonb_build_object('ok', false, 'reason', 'daily');
      else
        cut := least(least(steps, avail) * (sp ->> 'chunkMs')::numeric, maxcut);
        steps := ceil(cut / (sp ->> 'chunkMs')::numeric);
        price2 := steps * (sp ->> 'price')::numeric;
        if coalesce(wl.sapphires, 0) < price2 then res := jsonb_build_object('ok', false, 'reason', 'sapphires', 'need', price2);
        else
          pr.research := pr.research || jsonb_build_object('durationMs', dur - cut, 'fullMs', fullms);
          perform _sapphire_add(uid, -price2::bigint, 'speedup', pr.research ->> 'upgradeId', null);
          update player_wallet set daily = jsonb_build_object('d', dday, 'n', used + steps) where user_id = uid;
          res := jsonb_build_object('ok', true, 'cutMs', cut, 'price', price2, 'leftMs', started + dur - cut - now_ms);
        end if;
      end if;
    end if;
  elsif op = 'preset_unlock' then
    -- v0.17.0: ещё один пресет билда за сапфиры. Зеркало presetUnlock.
    select data into od from player_world where user_id = uid and kind = 'object' and key = 'player_build';
    od := case when jsonb_typeof(od) = 'object' then od else '{}'::jsonb end;
    slot := _preset_slots(od, rules);
    price2 := (rules -> 'sapphires' ->> 'presetPrice')::numeric;
    if slot >= (rules -> 'sapphires' ->> 'presetMax')::int then res := jsonb_build_object('ok', false, 'reason', 'max');
    elsif _sapphires(uid) < price2 then res := jsonb_build_object('ok', false, 'reason', 'sapphires', 'need', price2);
    else
      perform _sapphire_add(uid, -price2::bigint, 'preset', 'preset' || (slot + 1), null);
      perform _merge_build(uid, jsonb_build_object('presetSlots', slot + 1));
      res := jsonb_build_object('ok', true, 'slots', slot + 1, 'price', price2);
    end if;
  elsif op = 'shop_buy' or op = 'shop_sell' then
    -- v0.19.0: торговец (rules.shop). Зеркало shopBuy / shopSell.
    m := rules -> 'shop';
    steps := case when action -> 'qty' is null or jsonb_typeof(action -> 'qty') = 'null' then 1
                  when jsonb_typeof(action -> 'qty') = 'number' then (action ->> 'qty')::numeric end;
    ev := case when jsonb_typeof(action -> 'item') = 'string' then action ->> 'item' end;
    price2 := case when ev is not null then _num(m -> (case when op = 'shop_buy' then 'buy' else 'sell' end) -> ev) end;
    if steps is null or steps <> trunc(steps) or steps < 1 or steps > (m ->> 'maxQty')::numeric then res := jsonb_build_object('ok', false, 'reason', 'bad');
    elsif price2 is null then res := jsonb_build_object('ok', false, 'reason', 'unknown');
    elsif not _has_event(uid, m ->> 'requires') then res := jsonb_build_object('ok', false, 'reason', 'locked');
    elsif pr.combat_since is not null then res := jsonb_build_object('ok', false, 'reason', 'combat');
    elsif op = 'shop_buy' then
      if _inv(uid, 'coins') < price2 * steps then res := jsonb_build_object('ok', false, 'reason', 'coins', 'need', price2 * steps);
      else
        perform _inv_add(uid, 'coins', -(price2 * steps));
        perform _inv_add(uid, ev, steps);
        res := jsonb_build_object('ok', true, 'item', ev, 'qty', steps, 'cost', price2 * steps);
      end if;
    else
      if _inv(uid, ev) < steps then res := jsonb_build_object('ok', false, 'reason', 'missing');
      else
        perform _inv_add(uid, ev, -steps);
        perform _inv_add(uid, 'coins', price2 * steps);
        res := jsonb_build_object('ok', true, 'item', ev, 'qty', steps, 'gain', price2 * steps);
      end if;
    end if;
  elsif op = 'daily_take' or op = 'daily_done' then
    -- v0.23.0: доска поручений (rules.daily). Зеркало dailyTake / dailyDone; состояние — объект мира 'daily' { d, taken, done }.
    m := rules -> 'daily';
    ev := case when jsonb_typeof(action -> 'offer') = 'string' then action ->> 'offer' end;
    r := case when ev is not null then m -> 'pool' -> ev end;
    now_ms := (extract(epoch from pr.vitals_at) * 1000)::bigint;
    dday := floor(now_ms / (m ->> 'dayMs')::numeric);
    select data into od from player_world where user_id = uid and kind = 'object' and key = 'daily';
    if jsonb_typeof(od) = 'object' and jsonb_typeof(od -> 'd') = 'number' and (od ->> 'd')::numeric = dday then
      sp := (select coalesce(jsonb_object_agg(t.key, t.value), '{}'::jsonb) from jsonb_each(case when jsonb_typeof(od -> 'taken') = 'object' then od -> 'taken' else '{}'::jsonb end) t
              where (m -> 'pool') ? t.key and jsonb_typeof(t.value) = 'number' and abs((t.value #>> '{}')::numeric) < 1e15);
      u := (select coalesce(jsonb_agg(e order by o), '[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(od -> 'done') = 'array' then od -> 'done' else '[]'::jsonb end) with ordinality q(e, o)
             where jsonb_typeof(e) = 'string' and sp ? (e #>> '{}'));
    else sp := '{}'::jsonb; u := '[]'::jsonb; end if;
    if r is null then res := jsonb_build_object('ok', false, 'reason', 'unknown');
    elsif op = 'daily_take' then
      if not _has_event(uid, m ->> 'requires') then res := jsonb_build_object('ok', false, 'reason', 'locked');
      elsif not (ev = any(_daily_offers(dday::bigint, m -> 'order', (m ->> 'offers')::int))) then res := jsonb_build_object('ok', false, 'reason', 'unknown');
      elsif sp ? ev then res := jsonb_build_object('ok', false, 'reason', 'already');
      elsif (select count(*) from jsonb_object_keys(sp)) >= (m ->> 'picks')::int then res := jsonb_build_object('ok', false, 'reason', 'limit');
      elsif r ->> 'requires' is not null and not _has_event(uid, r ->> 'requires') then res := jsonb_build_object('ok', false, 'reason', 'locked');
      else
        sp := sp || jsonb_build_object(ev, case when r -> 'goal' ->> 'type' = 'wins' then _daily_wins(uid, r -> 'goal' -> 'spawns') else 0 end);
        insert into player_world (user_id, kind, key, data) values (uid, 'object', 'daily', jsonb_build_object('d', dday, 'taken', sp, 'done', u))
          on conflict (user_id, kind, key) do update set data = excluded.data;
        res := jsonb_build_object('ok', true, 'offer', ev);
      end if;
    else
      if not (sp ? ev) then res := jsonb_build_object('ok', false, 'reason', 'not_taken');
      elsif u @> jsonb_build_array(ev) then res := jsonb_build_object('ok', false, 'reason', 'already');
      elsif r -> 'goal' ->> 'type' = 'deliver' and exists (select 1 from jsonb_each(r -> 'goal' -> 'items') e where _inv(uid, e.key) < (e.value #>> '{}')::numeric) then
        res := jsonb_build_object('ok', false, 'reason', 'missing');
      elsif r -> 'goal' ->> 'type' = 'wins' and _daily_wins(uid, r -> 'goal' -> 'spawns') - (sp ->> ev)::numeric < (r -> 'goal' ->> 'count')::numeric then
        res := jsonb_build_object('ok', false, 'reason', 'progress');
      else
        if r -> 'goal' ->> 'type' = 'deliver' then
          for k, v in select * from jsonb_each(r -> 'goal' -> 'items') loop perform _inv_add(uid, k, -(v #>> '{}')::numeric); end loop;
        end if;
        u := u || jsonb_build_array(ev);
        insert into player_world (user_id, kind, key, data) values (uid, 'object', 'daily', jsonb_build_object('d', dday, 'taken', sp, 'done', u))
          on conflict (user_id, kind, key) do update set data = excluded.data;
        pr := _grant(uid, pr, r -> 'reward');
        -- v0.25.0: поручение приносит очки ковену игрока (если миграция ковенов установлена)
        if to_regprocedure('public._coven_add_points(uuid,integer)') is not null then
          perform public._coven_add_points(uid, (rules -> 'covens' ->> 'dailyPoints')::int);
        end if;
        res := jsonb_build_object('ok', true, 'offer', ev);
      end if;
    end if;
  elsif op = 'duel_start' then
    -- v0.26.0: вызов на Дуэль (rules.duel). Попытка списывается сразу. Соперник — ближайший по рейтингу герой, прошедший главу II
    -- (не сам игрок); если таких нет — «Тень дуэлянта», слепок самого игрока. Зеркало duelStart (в JS — всегда тень).
    m := rules -> 'duel';
    now_ms := (extract(epoch from pr.vitals_at) * 1000)::bigint;
    if not _has_event(uid, m ->> 'requires') then res := jsonb_build_object('ok', false, 'reason', 'locked');
    elsif pr.combat_since is not null then res := jsonb_build_object('ok', false, 'reason', 'combat');
    else
      select data into od from player_world where user_id = uid and kind = 'object' and key = 'duel';
      sp := _duel_state(od, now_ms, m);
      if (sp ->> 'used')::numeric >= (m ->> 'attemptsPerDay')::numeric then res := jsonb_build_object('ok', false, 'reason', 'attempts');
      else
        sp := sp || jsonb_build_object('used', (sp ->> 'used')::numeric + 1);
        insert into player_world (user_id, kind, key, data) values (uid, 'object', 'duel', sp)
          on conflict (user_id, kind, key) do update set data = excluded.data;
        select _duel_snapshot(c.uid2, c.nick, false, c.rating) into u from (
          select p.user_id uid2, f.nickname nick,
                 (_duel_state((select w.data from player_world w where w.user_id = p.user_id and w.kind = 'object' and w.key = 'duel'), now_ms, m) ->> 'rating')::numeric rating
            from player_progress p join profiles f on f.id = p.user_id
           where p.user_id <> uid and f.nickname is not null
             and exists (select 1 from player_quests q where q.user_id = p.user_id and q.quest_id = m ->> 'requires')) c
          order by case when abs(c.rating - (sp ->> 'rating')::numeric) <= (m ->> 'matchWindow')::numeric then 0 else 1 end,
                   abs(c.rating - (sp ->> 'rating')::numeric) + random() * 60
          limit 1;
        if u is null then u := _duel_snapshot(uid, 'Тень дуэлянта', true, (sp ->> 'rating')::numeric); end if;
        pr.combat_since := pr.vitals_at;
        cur := _clamp(coalesce(pr.hp::numeric, mx_hp), 0, mx_hp);
        price := _clamp(coalesce(pr.mana::numeric, mx_mana), 0, mx_mana);
        pr.combat_ctx := jsonb_build_object(
        'balanceVersion', case when action->'balanceVersion'='30'::jsonb then 30 else 29 end,
          'spawn', 'duel', 'enemy', 'duel_mage', 'level', pr.hero_level,
          'abilities', (select jsonb_object_agg(a, jsonb_build_object('level', coalesce(pa.level, 0), 'unlocked', coalesce(pa.unlocked, false)))
                          from unnest(array['telekinesis', 'fire', 'seal', 'ice']) a left join player_abilities pa on pa.user_id = uid and pa.ability_id = a),
          'hp', cur, 'mana', price,
          'potions', (select jsonb_object_agg(p, _inv(uid, p)) from jsonb_array_elements_text(rules -> 'combatPotions') p),
          'build', (select data from player_world where user_id = uid and kind = 'object' and key = 'player_build'),
          'duel', jsonb_build_object('opponent', u, 'rating', sp -> 'rating', 'season', sp -> 'season'));
        res := jsonb_build_object('ok', true, 'opponent', u, 'rating', sp -> 'rating', 'left', (m ->> 'attemptsPerDay')::numeric - (sp ->> 'used')::numeric);
      end if;
    end if;
  elsif op = 'coven_give' then
    -- v0.25.0: материалы в недельную цель ковена (функции — supabase/migrations/20261007_covens.sql). Без ковена — 'no_coven' (как JS-зеркало).
    if to_regprocedure('public._coven_give(uuid,text,jsonb,jsonb)') is null then res := jsonb_build_object('ok', false, 'reason', 'no_coven');
    else res := public._coven_give(uid, case when jsonb_typeof(action -> 'item') = 'string' then action ->> 'item' end, action -> 'qty', rules); end if;
  elsif op = 'coven_claim' then
    -- v0.25.0: награда недели ковена (один раз за неделю, если цель набрана и есть личный вклад)
    if to_regprocedure('public._coven_claim(uuid,jsonb)') is null then res := jsonb_build_object('ok', false, 'reason', 'no_coven');
    else
      res := public._coven_claim(uid, rules);
      if (res ->> 'ok')::boolean then pr := _grant(uid, pr, rules -> 'covens' -> 'reward'); end if;
    end if;
  elsif op = 'amulet_upgrade' then
    -- v0.19.0: улучшение амулета +1…+3 (rules.build.amuletUpgrades). Зеркало amuletUpgrade.
    m := rules -> 'build';
    ev := case when jsonb_typeof(action -> 'amulet') = 'string' then action ->> 'amulet' end;
    select data into od from player_world where user_id = uid and kind = 'object' and key = 'player_build';
    od := case when jsonb_typeof(od) = 'object' then od else '{}'::jsonb end;
    v := case when jsonb_typeof(od -> 'amuletLevels') = 'object' then od -> 'amuletLevels' else '{}'::jsonb end;
    cut := case when ev is not null and jsonb_typeof(v -> ev) = 'number' and (v ->> ev)::numeric = trunc((v ->> ev)::numeric) and (v ->> ev)::numeric > 0
                then least((v ->> ev)::numeric, jsonb_array_length(m -> 'amuletUpgrades')) else 0 end;
    if ev is null or not ((m -> 'amulets') ? ev) then res := jsonb_build_object('ok', false, 'reason', 'unknown');
    elsif _inv(uid, ev) < 1 then res := jsonb_build_object('ok', false, 'reason', 'locked');
    elsif pr.combat_since is not null then res := jsonb_build_object('ok', false, 'reason', 'combat');
    elsif cut >= jsonb_array_length(m -> 'amuletUpgrades') then res := jsonb_build_object('ok', false, 'reason', 'max');
    else
      u := m -> 'amuletUpgrades' -> cut::int;
      r := jsonb_build_object('coins', u -> 'coins') || (u -> 'items');
      if exists (select 1 from jsonb_each(r) e where _inv(uid, e.key) < (e.value #>> '{}')::numeric) then res := jsonb_build_object('ok', false, 'reason', 'missing');
      else
        for k in select jsonb_object_keys(r) loop perform _inv_add(uid, k, -((r ->> k)::numeric)); end loop;
        perform _merge_build(uid, jsonb_build_object('amuletLevels', v || jsonb_build_object(ev, cut + 1)));
        res := jsonb_build_object('ok', true, 'amulet', ev, 'level', cut + 1);
      end if;
    end if;
  elsif op = 'bank_welcome' then
    -- v0.17.0: приветственные сапфиры, один раз. Зеркало bankWelcome.
    insert into player_wallet (user_id) values (uid) on conflict (user_id) do nothing;
    select * into wl from player_wallet where user_id = uid for update;
    if not _has_event(uid, rules -> 'sapphires' ->> 'welcomeEvent') then res := jsonb_build_object('ok', false, 'reason', 'locked');
    elsif wl.welcome then res := jsonb_build_object('ok', false, 'reason', 'already');
    else
      perform _sapphire_add(uid, (rules -> 'sapphires' ->> 'welcome')::bigint, 'welcome', 'кошелёк открыт', 'welcome');
      update player_wallet set welcome = true where user_id = uid;
      res := jsonb_build_object('ok', true, 'amount', (rules -> 'sapphires' ->> 'welcome')::numeric);
    end if;
  elsif op = 'starter_kit' then
    if exists (select 1 from player_quests where user_id = uid and quest_id = 'mirra_starter_kit') then
      res := jsonb_build_object('ok', false, 'reason', 'already');
    else
      insert into player_quests (user_id, quest_id) values (uid, 'mirra_starter_kit');
      insert into player_inventory (user_id, item_id, quantity) values (uid, 'elixir_life', 1), (uid, 'elixir_mana', 1)
        on conflict (user_id, item_id) do update set quantity = least(player_inventory.quantity + 1, 1000000000);
      res := jsonb_build_object('ok', true);
    end if;
  elsif op = 'craft' then
    r := case when jsonb_typeof(action -> 'recipe') = 'string' then rules -> 'recipes' -> (action ->> 'recipe') end;
    if r is null then res := jsonb_build_object('ok', false, 'reason', 'unknown');
    elsif exists (select 1 from jsonb_array_elements_text(r -> 'requires') e where not _has_event(uid, e)) then res := jsonb_build_object('ok', false, 'reason', 'locked');
    elsif exists (select 1 from jsonb_array_elements_text(r -> 'blockedBy') e where _has_event(uid, e)) then res := jsonb_build_object('ok', false, 'reason', 'done');
    else
      select coalesce(jsonb_agg(key order by key collate "C"), '[]'::jsonb) into missing
        from jsonb_each(r -> 'needs') where _inv(uid, key) < (value #>> '{}')::numeric;
      if jsonb_array_length(missing) > 0 then res := jsonb_build_object('ok', false, 'reason', 'missing', 'missing', missing);
      else
        for k, v in select * from jsonb_each(r -> 'needs') loop perform _inv_add(uid, k, -(v #>> '{}')::numeric); end loop;
        perform _inv_add(uid, r ->> 'result', (r ->> 'amount')::numeric);
        if r ->> 'crafted' is not null then perform _add_event(uid, r ->> 'crafted'); end if;
        first := not _has_event(uid, rules -> 'firstCraft' ->> 'event');
        if first then
          perform _add_event(uid, rules -> 'firstCraft' ->> 'event');
          pr := _grant(uid, pr, rules -> 'firstCraft' -> 'reward');
        end if;
        res := jsonb_build_object('ok', true, 'recipe', action ->> 'recipe', 'result', r ->> 'result', 'amount', (r ->> 'amount')::numeric, 'firstCraft', first);
      end if;
    end if;
  elsif op = 'use' then
    u := case when jsonb_typeof(action -> 'item') = 'string' then rules -> 'uses' -> (action ->> 'item') end;
    if u is null then res := jsonb_build_object('ok', false, 'reason', 'unknown');
    elsif exists (select 1 from jsonb_array_elements_text(u -> 'blockedBy') e where _has_event(uid, e)) then res := jsonb_build_object('ok', false, 'reason', 'done');
    elsif exists (select 1 from jsonb_array_elements_text(u -> 'requires') e where not _has_event(uid, e)) then res := jsonb_build_object('ok', false, 'reason', 'locked');
    elsif _inv(uid, action ->> 'item') < 1 then res := jsonb_build_object('ok', false, 'reason', 'missing');
    elsif u ? 'mana' and _clamp(coalesce(pr.mana::numeric, mx_mana), 0, mx_mana) < (u ->> 'mana')::numeric then
      res := jsonb_build_object('ok', false, 'reason', 'mana', 'mana', (u ->> 'mana')::numeric);
    else
      if u ? 'mana' then pr.mana := _clamp(coalesce(pr.mana::numeric, mx_mana), 0, mx_mana) - (u ->> 'mana')::numeric; end if;
      perform _inv_add(uid, action ->> 'item', -1);
      for k in select * from jsonb_array_elements_text(u -> 'events') loop perform _add_event(uid, k); end loop;
      pr := _grant(uid, pr, u -> 'reward');
      res := jsonb_build_object('ok', true, 'item', action ->> 'item', 'events', u -> 'events');
    end if;
  elsif op = 'migrate_v10' then
    m := rules -> 'migration';
    if _has_event(uid, m ->> 'event') then res := jsonb_build_object('ok', false, 'reason', 'already');
    else
      perform _add_event(uid, m ->> 'event');
      core := exists (select 1 from player_world where user_id = uid and kind = 'enemy' and key = m ->> 'guardian')
        and _inv(uid, m ->> 'item') <= 0
        and not exists (select 1 from jsonb_array_elements_text(m -> 'notIf') e where _has_event(uid, e));
      if core then perform _inv_add(uid, m ->> 'item', 1); end if;
      res := jsonb_build_object('ok', true, 'core', case when core then 1 else 0 end);
    end if;
  else
    res := jsonb_build_object('ok', false, 'reason', 'unknown');
  end if;
  if aid is not null then
    pr.recent_actions := (select coalesce(jsonb_agg(e order by i), '[]'::jsonb) from (
      select e, i from jsonb_array_elements(pr.recent_actions || jsonb_build_array(jsonb_build_object('id', aid, 'result', res))) with ordinality as t(e, i)
      order by i desc limit 20) z);
  end if;
  update player_progress set hp = pr.hp, mana = pr.mana, hero_xp = pr.hero_xp, hero_level = pr.hero_level, school_xp = pr.school_xp, research = pr.research,
    vitals_at = pr.vitals_at, combat_since = pr.combat_since, combat_ctx = pr.combat_ctx,
    recent_syncs = pr.recent_syncs, recent_actions = pr.recent_actions, rev = pr.rev + 1, updated_at = now() where user_id = uid;
  return _snapshot(uid) || jsonb_build_object('action', res);
exception when sqlstate 'P2901' then
  return _snapshot(uid) || jsonb_build_object('action',jsonb_build_object('ok',false,'reason','bag_full'));
end $$;

revoke all on function public.player_action(jsonb) from public, anon;
grant execute on function public.player_action(jsonb) to authenticated;
commit;
