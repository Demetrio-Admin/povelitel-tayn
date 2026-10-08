import './admin.css';
import '@fontsource/pt-sans/cyrillic-400.css';
import '@fontsource/pt-sans/cyrillic-700.css';
import '@fontsource/pt-sans/latin-400.css';
import '@fontsource/pt-sans/latin-700.css';
import '@fontsource/philosopher/cyrillic-700.css';
import {createElement,Users,ArrowRightLeft,Headphones,Bug,ShieldCheck,ChartNoAxesColumn,X} from 'lucide';
import {SupabaseApi} from '../cloud/api.js';
import {PlayerSession} from '../cloud/PlayerSession.js';
import {GameState} from '../state/GameState.js';
import {fromSnapshot,fillDefaults} from '../cloud/playerModel.js';
import {CLOUD} from '../config/cloud.config.js';
import {QUEST_STEPS} from '../config/events.js';
import {RECIPES} from '../config/recipes.js';
import {QuestLog} from '../state/QuestLog.js';
import {ENEMIES} from '../config/balance.enemies.js';
import {STEP_WHY} from '../config/story.js';
import {ASSET_FILES} from '../config/assets.manifest.js';
import {ADMIN_SOURCES,ADMIN_STORAGES,ADMIN_GIFTS,ADMIN_TIMEZONE} from './config.js';
import {AdminService} from './AdminService.js';

const root=document.querySelector('#povelitel-admin');
const session=new PlayerSession({api:new SupabaseApi(CLOUD),state:new GameState(),storage:localStorage});
const service=new AdminService(session);
const roles={owner:'Владелец',admin:'Администратор',developer:'Разработчик',support:'Поддержка',moderator:'Модератор',player:'Игрок',system:'Сервер'};
const actions={resources:'Изменение ресурсов',restore:'Отмена изменения','help:heal':'Лечение','help:stop_combat':'Завершение зависшего боя','help:teleport':'Перемещение','help:repair_gift':'Восстановление дара','help:finish_research':'Завершение изучения',legacy_resources:'Прежняя выдача ресурсов',legacy_sapphire:'Прежнее движение сапфиров'};
const navs=[['players','Игроки',Users],['ledger','Все операции',ArrowRightLeft],['support','Поддержка',Headphones],['errors','Ошибки игры',Bug],['audit','Действия команды',ShieldCheck],['stats','Статистика теста',ChartNoAxesColumn]];
let data,content,flash,modal,selected=null,mode='players',tab='progress',epoch=0;
const n=v=>Number(v||0).toLocaleString('ru-RU');
const date=v=>v?new Intl.DateTimeFormat('ru-RU',{timeZone:ADMIN_TIMEZONE,dateStyle:'short',timeStyle:'medium'}).format(new Date(v)):'—';
const el=(tag,cls='',text='')=>{const e=document.createElement(tag);e.className=cls;e.textContent=text;return e;};
const add=(e,...items)=>{e.append(...items.filter(Boolean));return e;};
const button=(text,fn,cls='')=>{const b=el('button',cls,text);b.type='button';b.onclick=fn;return b;};
const input=(label,type='text',value='')=>{const x=el('input');x.type=type;x.value=value;x.setAttribute('aria-label',label);return x;};
const select=(label,options,value='')=>{const x=el('select');x.setAttribute('aria-label',label);Object.entries(options).forEach(([k,v])=>{const o=el('option','',v);o.value=k;x.append(o);});x.value=Object.hasOwn(options,value)?value:Object.keys(options)[0]||'';return x;};
const field=(text,x)=>add(el('label','',text),x);
const panel=(title,...items)=>add(el('section','pa-section'),el('h2','',title),...items);
const icon=(symbol)=>{const svg=createElement(symbol,{width:16,height:16,'aria-hidden':'true'});svg.classList.add('pa-icon');return svg;};
const asset=(key)=>{if(!ASSET_FILES[key])return null;const img=el('img');img.src=ASSET_FILES[key];img.alt='';return img;};
const title=(text,tail)=>add(el('div','pa-title'),el('h1','',text),tail);
const empty=(text)=>el('div','pa-empty',text);
function notice(text,error=false){flash.hidden=false;flash.className=error?'pa-notice pa-negative':'pa-notice';flash.textContent=text;}
function failure(e){notice(e.code==='chat_unavailable'?'Админка ещё не подключена к базе. Установите миграцию 20261008_test_admin.sql.':e.message||'Не удалось загрузить данные.',true);}
async function run(fn){try{return await fn();}catch(e){failure(e);return null;}}
function table(headers,rows){const t=el('table','pa-ledger'),head=el('thead'),tr=el('tr');headers.forEach(h=>tr.append(el('th','',h)));head.append(tr);t.append(head);const body=el('tbody');rows.forEach(row=>{const r=el('tr');row.forEach(v=>r.append(add(el('td'),typeof v==='string'?document.createTextNode(v):v)));body.append(r);});t.append(body);return add(el('div','pa-table-wrap'),t);}
function playerButton(p){return button(`${p?.nickname||'Гость'} #${p?.playerId||'—'}`,()=>openPlayer(p.playerId));}
const small=(text)=>el('small','',text);
const resourceName=id=>data.catalog[id]?.name||(id.startsWith('gift:')?`Дар ${ADMIN_GIFTS[id.slice(5)]||id}`:id==='bag_capacity'?'Мест в сумке':id);
function rowResource(r){return add(el('div'),el('div','',resourceName(r.resource)),small(ADMIN_STORAGES[r.storage]||r.storage));}
function rowDelta(r){return add(el('div'),el('strong',r.delta>=0?'pa-positive':'pa-negative',`${r.delta>0?'+':''}${n(r.delta)}`),small(`${n(r.before)} → ${n(r.after)}`));}
function shell(){
  root.replaceChildren();const back=el('a','','В игру');back.href='./';
  const theme=button('Светлая тема',()=>{const light=document.documentElement.style.colorScheme!=='light';document.documentElement.style.colorScheme=light?'light':'dark';theme.textContent=light?'Тёмная тема':'Светлая тема';});
  const logout=button('Выйти',async()=>{await session.logout();location.reload();});
  root.append(add(el('header','pa-header'),add(el('div','pa-brand','Колдовство'),small('УПРАВЛЕНИЕ ИГРОЙ')),add(el('div','pa-actions'),theme,back,logout)));
  const layout=el('div','pa-layout'),nav=el('nav','pa-nav');nav.setAttribute('aria-label','Администрирование');
  navs.forEach(([id,label,symbol])=>{const b=button(label,()=>navigate(id));b.dataset.nav=id;b.prepend(icon(symbol));nav.append(b);});
  nav.append(add(el('div','pa-operator'),el('strong','',data.me.nickname),el('div','',roles[data.me.role]),small('Время: UTC+5')));
  const main=el('main','pa-main'),search=input('Найти игрока по нику или ID');search.placeholder='Найти игрока по нику или ID';
  const form=el('form','pa-search');form.onsubmit=e=>{e.preventDefault();mode='players';selected=null;renderPlayers(search.value.trim());};
  main.append(add(form,search,button('Найти',()=>form.requestSubmit()),button('Мой персонаж',()=>openPlayer(data.me.playerId))));
  flash=el('div');flash.hidden=true;flash.setAttribute('role','status');flash.setAttribute('aria-live','polite');content=el('div');main.append(flash,content);
  layout.append(nav,main);modal=el('div','pa-modal-layer');modal.hidden=true;root.append(layout,modal);navigate('players');
}
function navigate(id){if(service.pending){notice('Сначала подтвердите результат предыдущего изменения в открытом окне.',true);return;}mode=id;selected=null;tab='progress';epoch++;flash.hidden=true;root.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('is-active',b.dataset.nav===id));content.replaceChildren();if(id==='players')renderPlayers();else if(id==='support')renderSupport();else if(id==='stats')renderStats();else renderLog(id);}
async function openPlayer(id){mode='players';tab='progress';root.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('is-active',b.dataset.nav==='players'));const e=++epoch;content.replaceChildren(empty('Загрузка персонажа…'));const p=await run(()=>service.request('player',{playerId:String(id)}));if(p&&e===epoch){selected=p;paintPlayer();}}
async function renderPlayers(q='',offset=0,extra={}){
  const e=++epoch;const p=await run(()=>service.request('players',{q,offset,...extra}));if(!p||e!==epoch)return;
  content.replaceChildren(title('Игроки'));const chapter=select('Глава',{'':'Все главы',1:'Глава I',2:'Глава II',3:'Прошли обе главы'},extra.chapter||'');const online=select('Статус',{'':'Все игроки',true:'Сейчас в игре'},extra.online||'');
  content.append(add(el('div','pa-toolbar'),field('Глава',chapter),field('Статус',online),button('Применить',()=>renderPlayers(q,0,{chapter:chapter.value,online:online.value}))));
  const list=el('div','pa-list');p.rows.forEach(p=>{const b=button('',()=>openPlayer(p.playerId),'pa-player-row');b.append(add(el('div'),el('strong','',`${p.nickname} #${p.playerId}`),small(`Уровень ${p.level} · ${p.chapter===3?'Обе главы завершены':`Глава ${p.chapter}`} · ${roles[p.role]}`)),add(el('div','pa-row-end'),el('span',p.online?'pa-online':'pa-muted',p.online?'В игре':'Не в игре'),small(date(p.lastSeenAt))));list.append(b);});content.append(p.rows.length?list:empty('Игроки не найдены.'));
  paginate(content,offset,p.hasMore,()=>renderPlayers(q,Math.max(0,offset-50),extra),()=>renderPlayers(q,offset+50,extra));
}
function paginate(parent,offset,more,prev,next){const a=button('Назад',prev),b=button('Далее',next);a.disabled=!offset;b.disabled=!more;parent.append(add(el('div','pa-footer'),small(`Страница ${Math.floor(offset/50)+1}`),add(el('div','pa-actions'),a,b)));}
function paintPlayer(){
  const p=selected,s=p.snapshot,bag=s.objects.player_bag||{capacity:100,pending:{}};content.replaceChildren(title(`${p.nickname} #${p.playerId}`,p.canManage?button('Выдать / забрать',()=>resourceDialog(),'pa-primary'):small('Просмотр персонажа')));
  content.append(el('p','pa-muted',`Уровень ${p.level} · ${p.online?'В игре':'Не в игре'} · ${p.chapter===3?'Главы пройдены':`Глава ${p.chapter}`} · ${roles[p.role]}`));
  const wallet=el('div','pa-wallet');[['Монеты',s.inventory.coins,'icon_coin'],['Сапфиры',s.wallet?.sapphires,'icon_sapphire'],['Сумка',`${n(p.bagUsed)} / ${n(bag.capacity)}`,null]].forEach(([label,v,key])=>wallet.append(add(el('div'),asset(key),small(label),el('strong','pa-num',typeof v==='string'?v:n(v)),label==='Сумка'?small(`Ожидает получения: ${n(Object.values(bag.pending||{}).reduce((a,b)=>a+b,0))} шт.`):null)));content.append(wallet);
  content.append(el('p','pa-meta',`Регистрация: ${date(p.registeredAt||p.createdAt)} · Был(а) онлайн: ${date(p.lastSeenAt)} · Ковен: ${p.coven?`${p.coven.name} · ${{leader:'Глава',officer:'Советник',member:'Участник'}[p.coven.role]}`:'нет'}`));
  const tabs=el('div','pa-tabs');tabs.setAttribute('role','tablist');[['progress','Прохождение'],['resources','Ресурсы'],['history','История'],['tickets','Обращения']].forEach(([id,label])=>{const b=button(label,()=>{tab=id;paintPlayer();});b.setAttribute('role','tab');b.setAttribute('aria-selected',String(tab===id));tabs.append(b);});content.append(tabs);
  const body=el('div');content.append(body);
  if(tab==='progress')paintProgress(body);else if(tab==='resources')paintResources(body);else if(tab==='history')renderLog('ledger',p.playerId,body);else renderSupport(p.playerId,body);
}
function paintProgress(body){
  const p=selected,s=p.snapshot,state=new GameState();state.setData(fromSnapshot(fillDefaults(s).snapshot,state.data));const next=QUEST_STEPS.find(x=>!x.done(state));
  body.append(panel('Текущая цель',el('p','',next?.text||'Все сюжетные цели выполнены.'),next&&STEP_WHY[next.id]?el('p','pa-muted',STEP_WHY[next.id]):null));
  if(next?.progress)body.append(el('p','pa-muted',`Прогресс цели: ${next.progress(state)}`));
  if(next?.craft&&RECIPES[next.craft])body.append(panel('Что нужно для текущей цели',table(['Ингредиент','Есть','Нужно'],Object.entries(RECIPES[next.craft].needs).map(([id,qty])=>[resourceName(id),n(s.inventory[id]),n(qty)]))));
  const log=new QuestLog(state);const active=log.active();if(active.length)body.append(panel('Активные побочные задания',...active.map(id=>panel(log.def(id).title,...log.objectives(id).map(o=>el('p',o.done?'pa-positive':'pa-muted',`${o.done?'✓ ':''}${o.text}`))))));
  const gifts=el('div','pa-gifts');Object.entries(ADMIN_GIFTS).forEach(([id,name])=>{const level=s.abilities[id]?.unlocked?s.abilities[id].level:0;const g=add(el('div','pa-gift'),asset(`icon_${id}`),el('strong','',`${name} ${level}`));if(p.earnedGifts[id]>level){g.append(small(`Подтверждён уровень ${p.earnedGifts[id]}`));if(p.canManage)g.append(button('Восстановить',()=>helpDialog('repair_gift',`Восстановить ${name}`,{ability:id})));}gifts.append(g);});body.append(panel('Дары',gifts));
  body.append(panel('Состояние героя',el('p','',`Здоровье: ${n(s.hp)} / ${n(p.maxHp)} · Мана: ${n(s.mana)} / ${n(p.maxMana)}`),el('p','pa-muted',s.combatSince?'Игрок находится в бою.':'Активного боя нет.'),el('p','pa-muted',s.research?`Идёт изучение: ${s.research.upgradeId}`:'Изучение не запущено.')));
  if(p.canManage){const tools=el('div','pa-actions');tools.append(button('Вылечить героя',()=>helpDialog('heal','Восстановить здоровье и ману')));if(s.combatSince)tools.append(button('Остановить зависший бой',()=>helpDialog('stop_combat','Завершить бой без награды')));if(s.research)tools.append(button('Завершить изучение',()=>helpDialog('finish_research','Досрочно завершить текущее изучение')));body.append(tools);
    const checkpoints=select('Безопасная точка',Object.fromEntries(Object.entries(p.checkpoints).map(([k,v])=>[k,v.name])));body.append(panel('Помочь с перемещением',field('Доступная точка',checkpoints),button('Переместить',()=>helpDialog('teleport',`Переместить: ${p.checkpoints[checkpoints.value].name}`,{checkpoint:checkpoints.value}))));}
  const detail=el('details','pa-section'),summary=el('summary','','Подтверждённые события и победы');detail.append(summary,el('pre','',JSON.stringify({quests:s.quests,paths:s.paths,enemies:s.enemies},null,2)));body.append(detail);
  if(p.device)body.append(panel('Последнее устройство',el('p','pa-muted',`Версия ${p.device.v||'—'} · ${p.device.w||'?'} × ${p.device.h||'?'} · ${p.device.touch?'Сенсорное':'Клавиатура и мышь'} · ${date(p.device.at)}`)));
}
function paintResources(body){const s=selected.snapshot;const rows=Object.entries(data.catalog).map(([id,c])=>{const qty=id==='sapphires'?s.wallet?.sapphires:s.inventory[id];const pending=s.objects.player_bag?.pending?.[id]||0;return {id,c,qty:qty||0,pending};}).filter(r=>r.qty||r.pending);body.append(panel('Кошелёк, предметы и ожидающая добыча',rows.length?table(['Ресурс','Количество','Ожидает','Хранилище'],rows.map(r=>[resourceName(r.id),n(r.qty),n(r.pending),ADMIN_STORAGES[r.c.storage]])):empty('Ресурсов пока нет.')));if(selected.canManage)body.append(button('Выдать набор припасов',()=>kitDialog(),'pa-primary'));}
function dialog(titleText,build){
  const previous=document.activeElement;modal.hidden=false;modal.replaceChildren();const d=el('section','pa-dialog');d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.setAttribute('aria-label',titleText);
  const close=button('',()=>closeDialog());close.setAttribute('aria-label','Закрыть окно');close.append(icon(X));d.append(add(el('div','pa-dialog-title'),el('h2','',titleText),close));modal.append(d);build(d);d.querySelector('input,select,textarea,button')?.focus();
  modal.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();closeDialog();}if(e.key==='Tab'){const all=[...d.querySelectorAll('button,input,select,textarea,a')].filter(x=>!x.disabled&&!x.hidden&&x.getClientRects().length);if(e.shiftKey&&document.activeElement===all[0]){e.preventDefault();all.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===all.at(-1)){e.preventDefault();all[0].focus();}}};
  modal.returnFocus=previous;
}
function closeDialog(){if(service.pending){notice('Ответ на изменение ещё не получен. Повторите подтверждение в этом окне.',true);return;}modal.hidden=true;modal.replaceChildren();modal.returnFocus?.focus();}
function reasonField(){const r=el('textarea');r.maxLength=300;r.setAttribute('aria-label','Причина (необязательно)');r.placeholder='Можно оставить пустой';return r;}
function mutationForm(d,op,argsFn,summary){
  const why=reasonField(),error=el('p','pa-modal-error'),submit=button('Подтвердить',async()=>{
    if(submit.disabled)return;error.textContent='';submit.disabled=true;
    try{const args=submit.savedArgs||{playerId:selected.playerId,revision:selected.revision,walletRevision:selected.walletRevision,...argsFn(),reason:why.value};submit.savedArgs=args;const r=await service.mutate(op,args);selected=r.player;closeDialog();paintPlayer();notice('Изменение сохранено. Операция записана в журнал.');}
    catch(e){error.textContent=e.message;if(!service.pending)submit.savedArgs=null;else{submit.textContent='Повторить подтверждение';d.querySelectorAll('input,select,textarea').forEach(x=>x.disabled=true);}if(e.code==='admin_conflict'){const p=await run(()=>service.request('player',{playerId:selected.playerId}));if(p){selected=p;closeDialog();paintPlayer();notice('Игрок успел измениться. Показаны свежие данные; проверьте изменение ещё раз.',true);}}}
    finally{submit.disabled=false;}
  },'pa-primary');
  d.append(summary,field('Причина (необязательно)',why),error,add(el('div','pa-actions'),button('Отмена',closeDialog),submit));return submit;
}
function resourceDialog(){dialog(`Ресурсы · ${selected.nickname}`,d=>{
  const p=selected,s=p.snapshot,item=select('Ресурс',Object.fromEntries(Object.entries(data.catalog).filter(([id])=>id!=='sapphires'||p.canSapphires).map(([k,v])=>[k,v.name]))),dir=select('Действие',{give:'Выдать',take:'Забрать'},'give'),amount=input('Количество','number','1'),store=select('Хранилище',{inventory:'Кошелёк / сумка / коллекция',pending:'Ожидающая добыча'},'inventory'),preview=el('div','pa-preview');amount.min='1';amount.max='1000000';amount.step='1';
  const quote=()=>{const id=item.value,qty=Number(amount.value),take=dir.value==='take',location=take?store.value:'inventory',before=location==='pending'?s.objects.player_bag?.pending?.[id]||0:id==='sapphires'?s.wallet?.sapphires||0:s.inventory[id]||0;const into=data.catalog[id].storage==='bag'?Math.min(qty,Math.max(0,(s.objects.player_bag?.capacity||100)-p.bagUsed)):qty;return{id,qty,take,location,before,into};};
  const all=button('Всё',()=>{amount.value=quote().before;update();});
  const update=()=>{const q=quote();store.disabled=!q.take;all.hidden=!q.take;preview.replaceChildren(small(resourceName(q.id)),el('strong','pa-num',`${n(q.before)} → ${n(q.before+(q.take?-q.qty:q.into))}`));if(!q.take&&q.qty>q.into)preview.append(small(`В сумку: +${n(q.into)}. В ожидающую добычу: +${n(q.qty-q.into)}. Всё сохранится.`));};
  d.append(add(el('div','pa-form-grid'),field('Ресурс',item),field('Действие',dir),field('Количество',amount),field('Забрать из',store)),all);const submit=mutationForm(d,'resources',()=>{const q=quote();if(!Number.isSafeInteger(q.qty)||q.qty<1||q.qty>1000000)throw Error('Введите целое количество от 1 до 1 000 000.');if(q.take&&q.qty>q.before)throw Error('В этом хранилище недостаточно ресурсов.');return{changes:[{item:q.id,delta:(q.take?-1:1)*q.qty,storage:q.location}]};},preview);
  [item,dir,store,amount].forEach(x=>x.addEventListener('input',()=>{submit.savedArgs=null;update();}));update();
});}
function helpDialog(command,label,extra={}){dialog(label,d=>mutationForm(d,'help',()=>({command,...extra}),el('p','pa-preview',`${label}. Игрок: ${selected.nickname} #${selected.playerId}. Перед изменением сохранится снимок персонажа.`)));}
function kitDialog(){dialog('Выдать припасы',d=>{const kit=select('Набор',Object.fromEntries(Object.entries(data.kits).map(([k,v])=>[k,v.name])));d.append(field('Набор',kit));const preview=el('div','pa-preview');const update=()=>preview.textContent=Object.entries(data.kits[kit.value].items).map(([k,v])=>`${resourceName(k)}: ${v}`).join(' · ');kit.onchange=update;update();mutationForm(d,'resources',()=>({kit:kit.value}),preview);});}

function filters(kind,onApply){const form=el('form','pa-filter'),q=input('Поиск'),from=input('С даты и времени','datetime-local'),to=input('По дату и время','datetime-local');q.placeholder=kind==='ledger'?'Предмет, ник, ID, причина, исполнитель':'Ник, причина или код';
  form.append(field('Поиск',q),field('С даты и времени · UTC+5',from),field('По дату и время · UTC+5',to));
  const type=select('Тип ресурса',{'':'Все ресурсы',money:'Монеты',sapphire:'Сапфиры',item:'Ресурсы и расходники',amulet:'Амулеты',story:'Сюжетные предметы',gift:'Дары',pending:'Ожидающая добыча'}),source=select('Источник',{'':'Все источники',...ADMIN_SOURCES}),direction=select('Направление',{'':'Начисления и списания',in:'Начисления',out:'Списания'});
  if(kind==='ledger')form.append(field('Что изменилось',type),field('Источник',source),field('Направление',direction));
  const read=()=>Object.fromEntries(Object.entries({q:q.value,from:from.value?new Date(from.value+':00+05:00').toISOString():null,to:to.value?new Date(to.value+':59+05:00').toISOString():null,...(kind==='ledger'?{type:type.value,source:source.value,direction:direction.value}:{})}).filter(([,v])=>v));
  form.append(button('Применить',()=>form.requestSubmit()),button('Сбросить',()=>{form.reset();onApply({});}));form.onsubmit=e=>{e.preventDefault();onApply(read());};return form;
}
function renderLog(kind,playerId=null,parent=content){
  const body=el('div'),label=kind==='ledger'?'Операции игрока':kind==='errors'?'Ошибки игры':'Действия команды';parent.replaceChildren(title(kind==='ledger'&&!playerId?'Все операции':label),small('Дата и время · UTC+5'));
  let args={},cursor=null,offset=0,history=[],query=0;
  parent.append(filters(kind,f=>{args=f;cursor=null;offset=0;history=[];load();}),body);
  const load=async()=>{const q=++query;body.replaceChildren(empty('Загрузка…'));const result=await run(()=>service.request(kind,{...args,...(playerId?{playerId}:{}),...(cursor?{cursor}:{}),offset}));if(!result||q!==query||!body.isConnected)return;
    const rows=result.rows;if(kind==='ledger'){body.replaceChildren(rows.length?table(['Дата и время','Игрок / ресурс','Изменение','Источник','Операция'],rows.map(r=>[date(r.at),add(el('div'),!playerId?playerButton(r.player):null,rowResource(r)),rowDelta(r),add(el('div'),el('div','',ADMIN_SOURCES[r.source]||r.source),small(r.actor?.nickname||'Сервер')),button(`#${r.number}`,()=>openOperation(r.operation))])):empty('Операций с такими фильтрами нет.'));body.append(small(`Полный журнал ведётся с ${date(result.installedAt)}. Более ранние записи сапфиров и ручных выдач импортированы; остальные начальные остатки отмечены отдельно.`));}
    else if(kind==='audit')body.replaceChildren(rows.length?table(['Дата и время','Исполнитель','Игрок','Действие','Причина'],rows.map(r=>[date(r.createdAt||r.at),r.actor?.nickname||'Сервер',r.player?playerButton(r.player):small('—'),r.id.startsWith('chat:')?el('span','',r.action):button(actions[r.action]||r.action,()=>openOperation(r.id)),r.reason||'—'])):empty('Действий с такими фильтрами нет.'));
    else body.replaceChildren(rows.length?table(['Дата и время','Игрок','Откуда','Ошибка','Подробнее'],rows.map(r=>[date(r.at),r.player?playerButton(r.player):small('—'),r.origin==='server'?'Ответ сервера':'Отчёт клиента',r.code,button('Открыть',()=>dialog('Ошибка игры',d=>d.append(el('pre','',JSON.stringify(r,null,2)))))])):empty('Ошибок с такими фильтрами нет.'));
    const prev=()=>{offset=Math.max(0,offset-50);cursor=history.pop()||null;load();},next=()=>{history.push(cursor);offset+=50;cursor=result.next||null;load();};paginate(body,offset,result.hasMore,prev,next);
  };load();
}
async function openOperation(id){const o=await run(()=>service.request('operation',{operation:id}));if(!o)return;dialog(`Операция #${o.number}`,d=>{
  d.append(el('p','pa-meta',`${date(o.createdAt)} · ${o.actor?.nickname||'Сервер'} · ${actions[o.action]||o.action}`),el('p','',`Причина: ${o.reason||'не указана'}`));
  if(o.entries.length)d.append(table(['Ресурс','Хранилище','Изменение'],o.entries.map(r=>[resourceName(r.resource),ADMIN_STORAGES[r.storage],rowDelta(r)])));
  if(o.before&&o.after&&o.action.startsWith('help:'))d.append(el('pre','pa-preview',JSON.stringify({до:{pos:o.before.pos,hp:o.before.hp,mana:o.before.mana,research:o.before.research},после:{pos:o.after.pos,hp:o.after.hp,mana:o.after.mana,research:o.after.research}},null,2)));
  if(o.reversedBy)d.append(small('Изменение уже отменено отдельной операцией.'));
  if(o.canRestore&&o.restorable)d.append(button('Отменить это изменение',async()=>{const p=await run(()=>service.request('player',{playerId:o.player.playerId}));if(!p)return;selected=p;dialog('Отменить изменение',d=>mutationForm(d,'restore',()=>({operation:id}),el('p','pa-preview','Будет создана обратная операция. Сервер разрешит отмену, только если персонаж и кошелёк после этого не изменялись.')));},'pa-danger'));
});}
const statuses={new:'Новое',work:'В работе',waiting:'Ожидает игрока',solved:'Решено',closed:'Закрыто'};
async function renderSupport(playerId=null,parent=content){const e=epoch,rows=await run(()=>service.chat('tickets',{filter:'all'}));if(!rows||e!==epoch||!parent.isConnected)return;parent.replaceChildren(title('Обращения в поддержку'));const filter=select('Статус обращения',{'':'Все',new:'Новые',work:'В работе',waiting:'Ожидают игрока',solved:'Решённые',closed:'Закрытые'});const list=el('div','pa-list');parent.append(field('Статус',filter),list);
  const show=()=>{const visible=rows.filter(r=>(!playerId||r.author?.playerId===playerId)&&(!filter.value||r.status===filter.value));list.replaceChildren(visible.length?table(['Обращение','Игрок','Статус','Ответственный','Действие'],visible.map(t=>[t.subject,playerButton(t.author),statuses[t.status],t.assignee?.nickname||'Не назначен',button(t.assignee?.playerId===data.me.playerId||t.author?.playerId===data.me.playerId?'Открыть':'Назначить / взять',()=>openTicket(t))])):empty('Обращений нет.'));};filter.onchange=show;show();}
async function openTicket(t){
  const mine=t.assignee?.playerId===data.me.playerId||t.author?.playerId===data.me.playerId;
  if(!mine){dialog('Назначение обращения',d=>{d.append(el('p','',`${t.subject} · ${t.author.nickname}`));const take=button('Взять себе',async()=>{take.disabled=true;const result=await run(()=>service.chat('ticket_take',{ticket:t.id,revision:t.revision},true));take.disabled=false;if(result){closeDialog();renderSupport();const rows=await service.chat('tickets',{filter:'all'});const fresh=rows.find(x=>x.id===t.id);if(fresh)openTicket(fresh);}});take.disabled=!!t.assignee||t.status==='closed'||(t.escalated&&!['owner','admin'].includes(data.me.role));d.append(take);
    if(['owner','admin'].includes(data.me.role))run(async()=>{const roster=await service.chat('roster');if(!d.isConnected)return;const assignee=select('Ответственный',Object.fromEntries(roster.filter(p=>p.playerId!==t.author.playerId).map(p=>[p.ref,p.nickname])));d.append(field('Ответственный',assignee),button('Назначить',async()=>{const r=await run(()=>service.chat('ticket_assign',{ticket:t.id,revision:t.revision,ref:assignee.value},true));if(r){closeDialog();renderSupport();}}));});
  });return;}
  const ticket=await run(()=>service.chat('ticket',{ticket:t.id}));if(!ticket)return;dialog(ticket.subject,d=>{
    d.append(el('p','pa-meta',`${ticket.author.nickname} #${ticket.author.playerId} · ${statuses[ticket.status]}`),button('Открыть персонажа',()=>{closeDialog();openPlayer(ticket.author.playerId);}));
    const replies=el('div','pa-steps');ticket.replies.forEach(r=>replies.append(panel(`${r.author.nickname} · ${date(r.createdAt)}`,el('p','',r.body))));(ticket.notes||[]).forEach(r=>replies.append(panel(`Заметка команды · ${r.author.nickname}`,el('p','',r.body))));d.append(replies);
    if(ticket.status==='closed')return;
    const text=el('textarea');text.maxLength=2000;text.setAttribute('aria-label','Текст ответа');d.append(field('Ответ игроку / заметка команды',text));
    const submit=op=>async()=>{const r=await run(()=>service.chat(op,{ticket:ticket.id,revision:ticket.revision,body:text.value},true));if(r){closeDialog();renderSupport();const rows=await service.chat('tickets',{filter:'all'});const fresh=rows.find(x=>x.id===t.id);if(fresh)openTicket(fresh);}};
    const tools=add(el('div','pa-actions'),button('Ответить',submit('ticket_reply'),'pa-primary'));if(!ticket.own)tools.append(button('Заметка команде',submit('ticket_note')),button('Решить обращение',submit('ticket_solve')));d.append(tools);
    if(!ticket.own)run(async()=>{const templates=await service.chat('templates');if(!d.isConnected)return;const choice=select('Шаблон ответа',{'':'Выберите шаблон',...Object.fromEntries(templates.map(x=>[x.id,x.title]))});choice.onchange=()=>{const t=templates.find(t=>t.id===choice.value);if(t)text.value=t.body;};d.insertBefore(field('Шаблон ответа',choice),text.parentElement);});
  });
}
async function renderStats(args={},parent=content){const e=epoch,r=await run(()=>service.request('stats',args));if(!r||e!==epoch)return;parent.replaceChildren(title('Статистика теста'));parent.append(filters('stats',f=>renderStats(f,parent)));const cards=el('div','pa-wallet');[['Игроков',r.players],['Зарегистрированы',r.registered],['Сейчас в игре',r.online],['Глава I',r.chapter1],['Глава II',r.chapter2],['Прошли обе главы',r.completed],['Монет у игроков',r.coins],['Сапфиров у игроков',r.sapphires]].forEach(([label,v])=>cards.append(add(el('div'),small(label),el('strong','pa-num',n(v)))));parent.append(cards,panel('Движение валют по источникам',small('Ручные изменения команды показаны отдельно от игрового дохода. Начальные остатки в оборот не входят.'),r.flows.length?table(['Валюта','Источник','Начислено','Списано'],r.flows.map(f=>[resourceName(f.resource),ADMIN_SOURCES[f.source]||f.source,n(f.incoming),n(f.outgoing)])):empty('Новых движений валют пока нет.')));parent.append(panel('Бои по подтверждённым результатам',r.combats?.length?table(['Монстр','Боёв','Победы','Поражения','Отступления'],r.combats.map(c=>[ENEMIES[c.enemy]?.name||c.enemy,n(c.fights),n(c.wins),n(c.defeats),n(c.retreats)])):empty('Подтверждённых боёв после установки журнала пока нет.')));}
function loginScreen(message='Войдите под аккаунтом команды.'){root.replaceChildren();const form=el('form','pa-login'),nick=input('Никнейм'),password=input('Пароль','password'),error=el('p','pa-negative');nick.autocomplete='username';password.autocomplete='current-password';const submit=button('Войти',()=>form.requestSubmit(),'pa-primary');form.append(el('h1','pa-brand','Колдовство'),el('h2','','Управление игрой'),el('p','pa-muted',message),field('Никнейм',nick),field('Пароль',password),error,submit);const back=el('a','','Вернуться в игру');back.href='./';form.append(back);form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;error.textContent='';try{await session.login({nickname:nick.value,password:password.value});data=await service.bootstrap();shell();}catch(e){error.textContent=e.code==='chat_unavailable'?'Установите миграцию админки в базе.':e.message;}finally{submit.disabled=false;}};root.append(form);}
async function start(){if(!session.enabled){loginScreen('Сервер не настроен. Для этой сборки нужны URL и публичный ключ Supabase.');return;}const status=await session.restore();if(status==='offline'){loginScreen('Нет соединения с сервером. Попробуйте войти после восстановления связи.');return;}if(status!=='ready'){loginScreen();return;}try{data=await service.bootstrap();shell();}catch(e){loginScreen(e.code==='chat_unavailable'?'Админка ещё не подключена. Установите миграцию 20261008_test_admin.sql.':e.message);}}
session.onChange(reason=>{if(reason==='session-lost'||reason==='signout'){service.pending=null;data=null;epoch++;loginScreen('Сессия завершилась. Войдите снова.');}});
start();
