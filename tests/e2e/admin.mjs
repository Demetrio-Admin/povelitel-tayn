// The browser talks to real administration SQL in an isolated PGlite database.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();let server,browser;const owner=randomUUID(),player=randomUUID();const shots=process.env.ADMIN_SHOTS||'/tmp/povelitel-admin-shots';mkdirSync(shots,{recursive:true});
const q=(s,p=[])=>db.query(s,p);
async function as(uid,fn){await db.exec('set role authenticated');await q("select set_config('request.jwt.claim.sub',$1,false)",[uid]);try{return await fn();}finally{await db.exec('reset role');}}
try{
 for(const f of ['tools/sql/auth-stub.sql','supabase/schema.sql','supabase/migrations/20261004_game_chat.sql','supabase/migrations/20261004_chat_roles_v2.sql','supabase/migrations/20261006_chat_catalog_ch2.sql','supabase/migrations/20261007_covens.sql','supabase/migrations/20261008_coven_cycles.sql','supabase/migrations/20261008_test_admin.sql'])await db.exec(readFileSync(f,'utf8'));
 for(const [u,name]of[[owner,'Дима'],[player,'Лунник']]){await q('insert into auth.users(id) values($1)',[u]);await as(u,()=>q("select public.create_player('witch')"));await q('select public.claim_nickname($1,$2,$3)',[u,name,name.toLowerCase()]);}
 await q("insert into game_chat.roles(user_id,roles) values($1,array['owner'])",[owner]);
 await q("insert into public.player_quests(user_id,quest_id) values($1,'unlock_ice_1')",[owner]);
 await q("select public.admin_grant_sapphires($1,350,'test','e2e-seed')",[owner]);
 await as(player,()=>q("select public.chat_request('ticket_create',$1::jsonb,$2::uuid)",[JSON.stringify({category:'bug',subject:'Пропал дар льда',body:'Помогите восстановить дар.'}),randomUUID()]));
 server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4187'],{env:{...process.env,VITE_SUPABASE_URL:'https://admin-test.invalid',VITE_SUPABASE_ANON_KEY:'test-public'},stdio:'pipe'});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Vite timeout')),20000);server.stdout.on('data',d=>{if(d.toString().includes('4187')){clearTimeout(timer);resolve();}});server.on('exit',()=>reject(Error('Vite exited')));});
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 let chain=Promise.resolve();
 const route=page=>page.route('https://admin-test.invalid/**',route=>{const task=chain.then(async()=>{const url=route.request().url(),name=url.split('/rpc/')[1],body=route.request().postDataJSON();if(!name){await route.fulfill({status:404,json:{message:'test route unavailable'}});return;}try{const r=await as(owner,async()=>{
  if(name==='get_player')return (await q('select public.get_player() j')).rows[0].j;
  if(name==='admin_request')return(await q('select public.admin_request($1,$2::jsonb,$3::uuid) j',[body.op,JSON.stringify(body.args||{}),body.request_id])).rows[0].j;
  if(name==='chat_request')return(await q('select public.chat_request($1,$2::jsonb,$3::uuid) j',[body.op,JSON.stringify(body.args||{}),body.request_id])).rows[0].j;
  throw Error('Unexpected RPC '+name);
 });await route.fulfill({json:r});}catch(e){console.error('RPC failure',name,body,e.message,e.where);await route.fulfill({status:400,json:{message:e.message,code:e.code}});}});chain=task.catch(()=>{});return task;});
 for(const [width,height]of[[1280,900],[390,844],[360,800]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('BROWSER',e.stack);});await route(page);
  await page.addInitScript(({owner})=>localStorage.setItem('witch_rpg_auth_v2',JSON.stringify({access_token:'test',refresh_token:'test',expires_at:Date.now()+3600000,user:{id:owner}})),{owner});
  await page.goto('http://127.0.0.1:4187/admin.html');await page.getByRole('heading',{name:'Игроки',exact:true}).waitFor();
  await page.getByRole('button',{name:'Мой персонаж',exact:true}).click();await page.getByRole('button',{name:'Выдать / забрать',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'page width');
  await page.getByRole('button',{name:'Выдать / забрать',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Ресурс',{exact:true}).selectOption('sapphires');await dialog.getByLabel('Количество',{exact:true}).fill('50');assert.equal(await dialog.getByLabel('Причина (необязательно)',{exact:true}).inputValue(),'');await dialog.getByRole('button',{name:'Подтвердить',exact:true}).click();await page.getByRole('status').filter({hasText:'Изменение сохранено'}).waitFor();
  await page.getByRole('button',{name:'Выдать / забрать',exact:true}).click();await dialog.getByLabel('Ресурс',{exact:true}).selectOption('moon_herb');await dialog.getByLabel('Количество',{exact:true}).fill('150');assert.match(await dialog.innerText(),/ожидающую добычу/);await dialog.getByRole('button',{name:'Подтвердить',exact:true}).click();await page.getByRole('status').filter({hasText:'Изменение сохранено'}).waitFor();
  await page.getByRole('tab',{name:'История',exact:true}).click();await page.getByRole('columnheader',{name:'Операция',exact:true}).waitFor();await page.screenshot({path:`${shots}/${width}-history.png`,fullPage:true});
  await page.getByRole('button',{name:/^#\d+$/}).first().click();await dialog.waitFor();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await page.getByRole('tab',{name:'Прохождение',exact:true}).click();const fix=page.getByRole('button',{name:'Восстановить',exact:true});if(await fix.count()){await fix.click();await dialog.getByRole('button',{name:'Подтвердить',exact:true}).click();await dialog.waitFor({state:'hidden'});}
  for(const name of ['Все операции','Ошибки игры','Действия команды','Статистика теста','Поддержка']){await page.getByRole('navigation').getByRole('button',{name,exact:true}).click();await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,name+' width');}
  const take=page.getByRole('button',{name:'Назначить / взять',exact:true});if(await take.count()){await take.click();await dialog.getByRole('button',{name:'Взять себе',exact:true}).click();await page.getByLabel('Текст ответа',{exact:true}).waitFor();await page.getByLabel('Текст ответа',{exact:true}).fill('Дар можно восстановить по подтверждённому этапу.');await dialog.getByRole('button',{name:'Ответить',exact:true}).click();await dialog.getByText('Дар можно восстановить по подтверждённому этапу.',{exact:true}).waitFor();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});}
  await page.getByRole('button',{name:'Мой персонаж',exact:true}).click();await page.getByRole('tab',{name:'Ресурсы',exact:true}).click();await page.screenshot({path:`${shots}/${width}-resources.png`,fullPage:true});
  assert.deepEqual(errors,[]);console.log(`✓ Admin ${width}×${height}: owner self, optional reason, pending, real ledger, all sections, support, dialogs, no overflow/errors`);await page.close();
 }
 // Signed-out and configuration states remain actual UI states, not a demo dashboard.
 const guest=await browser.newPage();await guest.goto('http://127.0.0.1:4187/admin.html');await guest.getByRole('heading',{name:'Управление игрой',exact:true}).waitFor();assert.equal(await guest.getByLabel('Пароль',{exact:true}).count(),1);await guest.close();
}catch(e){for(const ctx of browser?.contexts()||[])for(const p of ctx.pages()){console.error((await p.locator('body').innerText()).slice(-3000));await p.screenshot({path:shots+'/failure.png',fullPage:true});}throw e;}finally{await browser?.close();server?.kill();await db.close();}
