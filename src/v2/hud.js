import { UIScene } from '../scenes/UIScene.js';
import { VIEW } from '../config/game.config.js';
import { UI } from '../config/ui.config.js';
import { campaign, objective, saveCampaign } from './campaign.js';
import { tideStatus, wandSeconds } from './episode.js';
import { GIFT_RULES, ECONOMY, MOBS_41 } from '../config/horizon/rules.js';
import { services } from '../services.js';
import { MSG } from '../state/EventBus.js';
import { QUESTS, PROLOGUE } from './quests.js';
import { nextRegionOpen, questDone, questStep, townOpen } from './actProgress.js';
import { actLocationAt } from './regions.js';
import { AMULETS_41, TIERS_41, POTIONS_41, amuletOffer, award, blessHunt, colorOffer, craftPotion, dayAt,
  expandSatchel, finishRitual, forgeAmulet, gearSpace, itemLabel, itemList, levelCost, levelTrack,
  openChest, starGift, startColor, trade } from './progression.js';

export class HorizonUIScene extends UIScene {
  create() {
    super.create();
    this.introHint = this.add.text(VIEW.width / 2, 180, 'Нажми на Мирру, чтобы подойти', {
      fontFamily: UI.font, fontSize: UI.type.small, color: '#ffecd2', backgroundColor: '#362720',
      padding: { x: 18, y: 10 }, align: 'center', wordWrap: { width: 475 },
    }).setOrigin(0.5, 0).setDepth(5800).setVisible(false);
    this.viewport?.assign(this.introHint, 'top');
  }

  update(time, delta) {
    super.update(time, delta);
    this.introHint?.setVisible(this.mode === 'exploration' && !this.modal && campaign().step === 'intro');
  }

  choose(title, text, choices, page=0, back) {
    const pageSize=4, first=Math.max(0,page)*pageSize;
    const buttons=choices.slice(first,first+pageSize);
    if (choices.length>pageSize) buttons.push({
      label:page+1<Math.ceil(choices.length/pageSize)?'Ещё ›':'‹ С начала',
      onClick:()=>this.choose(title,text,choices,page+1<Math.ceil(choices.length/pageSize)?page+1:0,back),
    });
    buttons.push({label:back?'Назад':'Закрыть',cancel:true,onClick:back});
    this.openModal({title,text,vertical:true,buttons});
  }

  commit(next, reopen, error='Пока не хватает ресурсов или уровня охоты.') {
    if (next) {
      saveCampaign(next);
      const scene=this.scene.get('ExplorationScene');
      scene.refreshAll();
    } else this.toast(error);
    if (reopen) reopen();
  }

  openJournal(tab='story',page=0) {
    const p=campaign(), current=objective();
    const tier=actLocationAt(services.state.data.player)?.id.startsWith('city')?2:1;
    const tasks=QUESTS.filter(q=>q.act===tier && q.kind===tab);
    const choices=tasks.filter(q=>questStep(p,q)).map(q=>({label:q.title,onClick:()=>{
      const latest=campaign();
      saveCampaign({...latest,tracked:q.id});
      this.toast('Цель · '+q.title);
    }}));
    const prologue=tier===1 && tab==='story'?PROLOGUE.map(([id,title])=>(questDone(p,id)?'✓ ':'○ ')+title):[];
    const { remaining, tide }=tideStatus(p,Date.now());
    const huntStatus=tab==='hunt' && p.step==='hunt'
      ? '\n'+tide.key+(remaining?' · '+remaining+'/'+tide.threshold:'')+' · ×'+tide.value : '';
    const lines=tasks.map(q=>{
      const done=questDone(p,q.id);
      const open=questStep(p,q);
      return (done?'✓ ':open?'○ ':'· ')+q.title+(q.id==='warehouse_a'||q.id==='warehouse_b'?'  '+(p.tasks[q.id]||0)+'/'+q.steps.length:'');
    });
    const perPage=page*4;
    const buttons=choices.slice(perPage,perPage+4);
    if (choices.length>4) buttons.push({label:'Другие цели ›',onClick:()=>this.openJournal(tab,(page+1)%Math.ceil(choices.length/4))});
    buttons.push({label:'Закрыть',cancel:true});
    this.openModal({
      title:tier===2?'Светлодол под инеем':'Янтарный Бор',
      text:current.title+' · '+current.text+huntStatus+'\n\n'+[...prologue,...lines].join('\n'),
      vertical:true,buttons,
      topTabs:[['story','Сюжет'],['side','Истории'],['hunt','Мастерство']].map(([key,label])=>({
        label, selected:key===tab,onClick:()=>this.openJournal(key),
      })),
    });
  }

  openMap() {
    const p=campaign();
    const choices=[
      {label:'Очаг Мирры',onClick:()=>this.guideRegion('v2_hearth_route','Путь к Очагу Мирры отмечен на карте.')},
      {label:'Янтарный Бор',onClick:()=>this.guideRegion('v2_bor_route','Выход в Янтарный Бор отмечен на карте.')},
    ];
    if (townOpen(p)) choices.push({label:'Светлодол',onClick:()=>this.guideRegion('v2_town_route','Иди по восточному тракту Янтарного Бора.')});
    this.choose('Карта мира',[
      'Очаг Мирры · двор и мастерская',
      'Янтарный Бор · 3600 × 2400',
      townOpen(p)?'Светлодол · 2880 × 5760':'Светлодол · Древогляд или 21-й уровень охоты',
      nextRegionOpen(p)?'Хрустальная Чаща · след Крона уходит на север':'Хрустальная Чаща · Август или 41-й уровень охоты',
    ].join('\n'),choices);
  }
  guideRegion(id,text) {
    const scene=this.scene.get('ExplorationScene');
    const target=scene.objects.find(o=>o.id===id) || scene.objects.find(o=>o.cfg.portal && o.isAvailable());
    if (target) scene.trackedHunt=target.id;
    this.toast(text);
  }

  openActService(id) {
    switch (id) {
      case 'hearth-forge': this.openWorkshop(); break;
      case 'cauldron': this.openCauldron(); break;
      case 'bor-camp': this.openActCamp(1); break;
      case 'town-camp': this.openActCamp(2); break;
      case 'trader': this.openTrader(); break;
      case 'agenda': this.openActBoard(); break;
      case 'vault': this.openActBank(); break;
      case 'coven': this.openActCoven(); break;
      case 'duel': this.openActDuel(); break;
      case 'asya': this.openModal({title:'Ася-Фонарщица',text:questDone(campaign(),'fountain')?'Фонтан поёт! Когда вырасту, у меня будет такая же быстрая палочка.':'Мой фонарик погас! Морозун всё заморозил.'}); break;
    }
  }

  openActCamp(tier) {
    const p=campaign(), {remaining,tide}=tideStatus(p,Date.now());
    const choices=[
      {label:'Выследить отряд',onClick:()=>{
        const scene=this.scene.get('ExplorationScene');
        const targets=scene.objects.filter(o=>o.cfg.field && o.isAvailable());
        targets.sort((a,b)=>Math.hypot(a.x-scene.player.x,a.y-scene.player.y)-Math.hypot(b.x-scene.player.x,b.y-scene.player.y));
        if (targets.length) {
          scene.trackedHunt=targets[0].id;
          this.toast('Гром отметил след на тропе.');
        } else this.toast('Гром ждёт свежих следов.');
      }},
      {label:'Короны и мастерство',onClick:()=>this.openJournal('hunt')},
      {label:'Бестиарий',onClick:()=>this.openModal({title:'Бестиарий',text:Object.entries(p.bestiary)
        .map(([id,count])=>(MOBS_41[id]?.name || {spark:'Искроцап',frost:'Морозун',thorn:'Колючник'}[id] || id)+' · '+count).join('\n') || 'Пока записей нет.'})},
      {label:'Карта мира',onClick:()=>this.openMap()},
      {label:'Благословение охоты · 120 сапфиров',onClick:()=>this.choose('Благословение охоты','Удваивает монеты и материалы от охоты на 24 часа.',[
        {label:'Благословить охоту',onClick:()=>this.commit(blessHunt(campaign(),Date.now()),()=>this.openActCamp(tier))},
      ])},
    ];
    this.choose('Привал Грома','Охота · уровень '+p.huntLevel+'\n'+tide.key+' · ×'+tide.value+(remaining?' · '+remaining+'/'+tide.threshold:''),choices);
  }

  openBag() {
    const p=campaign();
    if (this.mode==='combat') {
      const fight=this.scene.get('CombatScene');
      const doses=Object.values(POTIONS_41).filter(row=>(p.inv[row.id]||0)>(fight.battle.usedPotions[row.id]||0) && row.category!=='pre_combat');
      this.choose('Зелья в сумке','Восстановительные '+fight.battle.healsUsed+'/'+3+' · тактические '+fight.battle.tacticalsUsed+'/'+2,
        doses.map(row=>({label:row.name,onClick:()=>{if (!fight.dose(row.id)) this.toast('Пока нельзя выпить это зелье.');}})));
      return;
    }
    const rows=Object.fromEntries(Object.entries(p.inv).filter(([id,n])=>n>0 && id!=='coins'));
    this.choose('Сумка · '+gearSpace(p)+'/'+p.satchel,itemList(rows)||'В сумке пусто.',[
      {label:'Дары и боевой набор',onClick:()=>this.openGifts()},
      {label:'Спутники',onClick:()=>this.openActCompanions()},
      {label:'Амулеты',onClick:()=>this.openActAmulets()},
      {label:'Расширить · 100 сапфиров',onClick:()=>this.commit(expandSatchel(campaign()),()=>this.openBag())},
    ]);
  }

  openWorkshop() {
    const p=campaign();
    this.choose('Мастерская Мирры','Палочка · '+p.wandLevel+' · '+wandSeconds(p.wandRank)+' с\nЗакалка · '+p.vigor,[
      {label:'Усилить палочку · '+levelCost(p.wandLevel),onClick:()=>this.commit(levelTrack(campaign(),'wand'),()=>this.openWorkshop())},
      {label:'Закалка · '+levelCost(p.vigor),onClick:()=>this.commit(levelTrack(campaign(),'vigor'),()=>this.openWorkshop())},
      {label:'Гримуар',onClick:()=>this.openGifts()},
      {label:'Алхимия',onClick:()=>this.openCauldron()},
      {label:'Амулеты',onClick:()=>this.openActAmulets()},
    ]);
  }
  openCauldron(page=0) {
    const p=campaign();
    const available=Object.values(POTIONS_41).filter(row=>row.enabled || (townOpen(p)&&row.tier==='tier_2'));
    this.choose('Котёл алхимии','Настои восстанавливают долю здоровья или маны. Тактические склянки имеют общий откат.',
      available.map(row=>({label:row.name,onClick:()=>this.choose(row.name,itemList(row.recipe_json),[
        {label:'Сварить',primary:true,onClick:()=>this.commit(craftPotion(campaign(),row.id),()=>this.openCauldron(page))},
      ],0,()=>this.openCauldron(page))})),page);
  }
  openGifts(page=0) {
    const p=campaign();
    const buds=Object.entries(p.gifts).map(([id,g])=>({label:GIFT_RULES[id].name+' · '+g.stars+'★',onClick:()=>this.openGift(id,page)}));
    buds.push({label:'Боевые наборы',onClick:()=>this.openActPresets()});
    buds.push({label:'Каталог и осколки',onClick:()=>this.openModal({
      title:'Гримуар · '+Object.keys(p.gifts).length+'/40',text:Object.values(GIFT_RULES).map(g=>g.name+' · '+(p.giftShards[g.id]||0)).join('\n'),
    })});
    this.choose('Гримуар',p.loadout.map(id=>GIFT_RULES[id].name).join(' · '),buds,page,()=>this.openBag());
  }
  openGift(id,page=0) {
    const p=campaign(), gift=p.gifts[id], def=GIFT_RULES[id], color=colorOffer(gift), ritual=p.rituals[id];
    const names={white:'Белая',green:'Зелёная',blue:'Синяя',purple:'Фиолетовая',orange:'Оранжевая',gold:'Золотая'};
    const roles={nagovor:'Наговор',zhatva:'Жатва',volya:'Воля',obereg:'Оберег'};
    const changes=[
      {label:'Выбрать боевой слот',onClick:()=>this.choose('Слоты · '+def.name,'Выбери, где будет этот дар.',[0,1,2].map(slot=>({
        label:(slot+1)+'. '+(GIFT_RULES[p.loadout[slot]]?.name||'Свободный'),
        onClick:()=>{
          const state=campaign(), loadout=[...state.loadout];
          const previous=loadout.indexOf(id);
          if (previous>=0) loadout[previous]=loadout[slot];
          loadout[slot]=id;
          this.commit({...state,loadout:loadout.filter(Boolean)},()=>this.openGift(id,page));
        },
      })))},
      {label:'Уровень · '+levelCost(gift.rank)+' монет',onClick:()=>this.commit(levelTrack(campaign(),id),()=>this.openGift(id,page))},
      {label:'Поднять звезду',onClick:()=>this.commit(starGift(campaign(),id),()=>this.openGift(id,page),'Нужны осколки этого дара и монеты.')},
    ];
    if (ritual) changes.push({label:ritual.at<=Date.now()?'Завершить ритуал':'Ускорить ритуал',onClick:()=>this.ritualConfirm(id,'gift',()=>this.openGift(id,page))});
    else if (color) changes.push({label:'Посвящение · '+names[color.step],onClick:()=>this.choose('Ритуал посвящения',itemList(color.cost)+(color.ritual_min?' · '+color.ritual_min+' мин':''),[
      {label:'Начать',primary:true,onClick:()=>this.commit(startColor(campaign(),id,Date.now()),()=>this.openGift(id,page))},
    ])});
    this.choose(def.name,roles[def.role]+' · '+gift.rank+' ур. · '+gift.stars+'★ · '+names[gift.color]+'\nОсколки · '+(p.giftShards[id]||0)
      +'\n'+def.mana+' маны · откат '+def.cd_sec+' с',changes,0,()=>this.openGifts(page));
  }
  ritualConfirm(id,kind,reopen) {
    const key=kind==='amulet'?'amulet:'+id:id, ritual=campaign().rituals[key];
    const minutes=Math.ceil(Math.max(0,ritual.at-Date.now())/60000);
    const cost=Math.ceil(minutes/15);
    if (!cost) { this.commit(finishRitual(campaign(),id,Date.now(),false,kind),reopen); return; }
    this.choose('Ритуал',minutes+' мин до завершения. Ускорение стоит '+cost+' сапфиров.',[
      {label:'Ускорить',onClick:()=>this.commit(finishRitual(campaign(),id,Date.now(),true,kind),reopen)},
    ],0,reopen);
  }
  openActPresets() {
    const p=campaign();
    const list=[];
    for (let slot=1;slot<=p.presetSlots;slot++) list.push({
      label:'Набор '+slot,onClick:()=>this.choose('Набор '+slot,p.presets[slot]?.slots.map(id=>GIFT_RULES[id]?.name).join(' · ')||'Место для нового набора.',[
        {label:'Сохранить текущий',onClick:()=>{
          const x=campaign();
          this.commit({...x,presets:{...x.presets,[slot]:{slots:x.loadout,amulet:x.amulet,companion:x.activeCompanion}}},()=>this.openActPresets());
        }},
        {label:'Применить',onClick:()=>{
          const x=campaign(), set=x.presets[slot];
          if (!set) { this.openActPresets(); return; }
          this.changeCompanion(set.companion);
          this.commit({...campaign(),loadout:set.slots,amulet:set.amulet},()=>this.openActPresets());
        }},
      ]),
    });
    if (p.presetSlots<ECONOMY['sapphires.build_slots_max']) {
      const price=30*p.presetSlots;
      list.push({label:'Доп. набор · '+price+' сапфиров',onClick:()=>{
        const current=campaign();
        this.commit(current.sapphires>=price?{...current,presetSlots:current.presetSlots+1,sapphires:current.sapphires-price}:null,()=>this.openActPresets());
      }});
    }
    this.choose('Боевые наборы','Три дара, один амулет и спутник.',list,0,()=>this.openGifts());
  }
  changeCompanion(id) {
    const p=campaign();
    if (id && !p.inv['companion_'+id]) return;
    saveCampaign({...p,activeCompanion:id});
    this.bus.emit(MSG.COMPANION_CHANGED);
  }
  openActCompanions() {
    const p=campaign();
    const pets=[['fox','Рыжик','Добивает слабого и сбивает опасный каст.'],['robin','Звонка','Продлевает метки и лечит героя.']];
    this.choose('Спутники',p.activeCompanion==='robin'?'С тобой Звонка':p.activeCompanion==='fox'?'С тобой Рыжик':'Спутник не выбран.',
      pets.filter(([id])=>p.inv['companion_'+id]).map(([id,name,desc])=>({label:name,onClick:()=>this.choose(name,desc,[
        {label:'Взять спутника',onClick:()=>{this.changeCompanion(id);this.openActCompanions();}},
        {label:'Усилить · '+levelCost(p.tempers[id]||1),onClick:()=>this.commit(levelTrack(campaign(),id),()=>this.openActCompanions())},
      ])})),0,()=>this.openBag());
  }
  openActAmulets() {
    const p=campaign();
    const rows=Object.values(AMULETS_41).filter(a=>p.amuletLevels[a.id]!==undefined || amuletOffer(p,a.id));
    this.choose('Амулеты',p.amulet?AMULETS_41[p.amulet]?.name+' надет':'Ячейка амулета свободна.',
      rows.map(row=>({label:row.name,onClick:()=>this.openActAmulet(row.id)})),0,()=>this.openBag());
  }
  openActAmulet(id) {
    const p=campaign(), row=AMULETS_41[id], offer=amuletOffer(p,id), ritual=p.rituals['amulet:'+id];
    const controls=[];
    if (p.amuletLevels[id]!==undefined) controls.push({label:'Надеть',onClick:()=>this.commit({...campaign(),amulet:id},()=>this.openActAmulet(id))});
    if (ritual) controls.push({label:'Завершить заточку',onClick:()=>this.ritualConfirm(id,'amulet',()=>this.openActAmulet(id))});
    else if (offer) controls.push({label:p.amuletLevels[id]===undefined?'Изготовить':'Заточить',onClick:()=>this.commit(forgeAmulet(campaign(),id,Date.now()),()=>this.openActAmulet(id))});
    this.choose(row.name,(p.amuletLevels[id]===undefined?'Изготовление':'+'+p.amuletLevels[id])+(offer?'\n'+itemList(offer.cost):''),controls,0,()=>this.openActAmulets());
  }
  openTrader() {
    this.choose('Лавка Бориса','Травы и пыль можно купить или продать.',[
      {label:'Янтарный Бор',onClick:()=>this.marketTier(1)},
      {label:'Светлодол',onClick:()=>this.marketTier(2)},
      {label:'Амулеты',onClick:()=>this.openActAmulets()},
      {label:'Сундук Гримуара',onClick:()=>this.openActBank()},
    ]);
  }
  marketTier(tier) {
    const row=TIERS_41['tier_'+tier];
    this.choose('Материалы','Цена продажи — треть цены покупки.',[row.common_id,row.rare_id].flatMap((id,i)=>[
      {label:'Купить · '+itemLabel(id)+' · '+(i?row.buy_price_rare:row.buy_price_common),onClick:()=>this.commit(trade(campaign(),id,row,true),()=>this.marketTier(tier))},
      {label:'Продать · '+itemLabel(id),onClick:()=>this.commit(trade(campaign(),id,row,false),()=>this.marketTier(tier))},
    ]),0,()=>this.openTrader());
  }
  openActBank() {
    const p=campaign();
    const buy=amount=>()=>{
      const result=openChest(campaign(),townOpen(campaign())?'tier_2':'tier_1',amount);
      if (!result) {this.toast('Не хватает сапфиров.');this.openActBank();return;}
      saveCampaign(result.next);
      this.openModal({title:'Страницы Гримуара',text:Object.entries(result.found).map(([label,n])=>label+' · '+n).join('\n')});
    };
    this.choose('Агата · Банк','Сапфиры · '+p.sapphires+'\nОткрыто сундуков · '+p.chestOpens+'\nКаждое десятое открытие даёт редкую страницу.',[
      {label:'Открыть · 150',onClick:buy(1)}, {label:'Открыть 10 · 1350',onClick:buy(10)},
    ]);
  }
  openActBoard() {
    const p=campaign(), day=dayAt(Date.now()), wins=p.date===day?p.dailyWins:0;
    const claimed=p.dailyBoard.day===day?p.dailyBoard.claimed||[]:[];
    const rewards=[[3,5],[8,7],[15,8]];
    this.choose('Доска поручений','Побед сегодня · '+wins,rewards.map(([need,gems])=>({
      label:(claimed.includes(need)?'✓ ':'')+need+' побед · '+gems+' сапфиров',
      onClick:()=>{
        const x=campaign(), now=dayAt(Date.now());
        const completed=x.dailyBoard.day===now?x.dailyBoard.claimed||[]:[];
        if (x.date!==now || x.dailyWins<need || completed.includes(need)) {this.openActBoard();return;}
        this.commit(award({...x,dailyBoard:{day:now,claimed:[...completed,need]}},{sapphires:gems,coins:need*10}),()=>this.openActBoard());
      },
    })));
  }
  openActCoven() {
    const p=campaign();
    if (!questDone(p,'coven_flowers')) {this.openModal({title:'Дом Ковенов',text:'Ядвига собирает морозник и руническую пыль для согревающего круга.'});return;}
    const week=Math.floor(Date.now()/604800000);
    const cycle=p.coven?.week===week?p.coven:{week,from:p.totalWins||0,claimed:false};
    if (p.coven!==cycle) saveCampaign({...p,coven:cycle},{notify:false});
    const wins=(p.totalWins||0)-cycle.from;
    this.choose('Круг Ядвиги','Недельная цель круга · '+Math.min(wins,20)+'/20 побед',[
      {label:cycle.claimed?'Награда получена':'Забрать награду',onClick:()=>{
        const x=campaign();
        if (wins>=20 && !x.coven.claimed) this.commit(award({...x,coven:{...cycle,claimed:true}},{sapphires:20,items:{cold_heart:1}}),()=>this.openActCoven());
        else this.openActCoven();
      }},
    ]);
  }
  openActDuel() {
    this.openModal({title:'Магическая Дуэль',text:questDone(campaign(),'duel_lesson_1')
      ?'Феликс ждёт в Зале для спарринга. Рейтинговые матчи доступны при подключении к серверу.'
      :'Пройди у Феликса урок против щита.'});
  }
}
