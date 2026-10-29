// Runs inside a real rendered iframe; also reusable by Playwright on the built route.
export async function runCameraChecks(frame, { resize, log = console.log } = {}) {
  const results = [];
  const check = (ok, message) => { if (!ok) throw Error(message); results.push(message); log('✓ ' + message); };
  const wait = async (fn, label, ms=60000) => { const end=Date.now()+ms; while(Date.now()<end) { if(fn())return; await new Promise(r=>setTimeout(r,50)); } throw Error('Timeout: '+label); };
  frame.focus();
  await wait(() => frame.__game?.scene.isActive('UIScene'), 'ready');
  const game=frame.__game, S=frame.__witch;
  const scene=()=>game.scene.getScene('ExplorationScene');
  const panel=frame.document.querySelector('#camera-test-panel');
  const select=async id=>{panel.querySelector(`[data-profile="${id}"]`).click(); await new Promise(r=>setTimeout(r,100));};
  if(scene().loc.id!=='forest') { panel.querySelector('[data-location="forest"]').click(); await wait(()=>scene().loc.id==='forest'&&!scene().inTransition,'initial forest'); }
  const nonTest=()=>Object.fromEntries(Object.entries(frame.localStorage).filter(([k])=>!k.startsWith('witch_camera_test_v1:')));
  const before=JSON.stringify(nonTest());
  check(!S.session && !S.chat && !S.presence && !S.telemetry,'No cloud session, chat, presence or telemetry');
  check(S.state.storage.getItem('witch_rpg_proto_save_v1')!==null,'Dedicated test save exists');
  const measurements=[];
  for(const [w,h] of (resize ? [[360,800],[390,844],[412,915],[320,568],[720,1280]] : [[frame.innerWidth,frame.innerHeight]])) {
    if(resize) { resize(w,h); await wait(()=>{const c=game.canvas.getBoundingClientRect();return frame.innerWidth===w&&frame.innerHeight===h&&Math.abs(c.width-w)<1&&Math.abs(c.height-h)<1;},'viewport '+w); }
    const e=scene(), cam=e.cameras.main, body={w:e.player.sprite.body.width,h:e.player.sprite.body.height};
    await select('original'); const original=e.player.view.displayHeight, zoom=cam.zoom;
    await select('a');
    check(Math.abs(e.player.view.displayHeight/original-1.25)<.02,`${w}×${h}: A image +25%`);
    check(cam.zoom===zoom && e.player.sprite.body.width===body.w && e.player.sprite.body.height===body.h,`${w}×${h}: same world zoom and collision body`);
    await select('b');
    const canvas=game.canvas.getBoundingClientRect(), host=frame.document.getElementById('game').getBoundingClientRect();
    check(Math.abs(canvas.width/canvas.height-game.scale.width/game.scale.height)<.001 && canvas.width<=host.width+1 && canvas.height<=host.height+1,`${w}×${h}: uniform viewport without clipping (${canvas.width}×${canvas.height}; game ${game.scale.width}×${game.scale.height}; host ${host.width}×${host.height})`);
    measurements.push({w,h,logical:[game.scale.width,game.scale.height],heroHeight:e.player.view.displayHeight,zoom});
  }
  if(resize) { resize(390,844); await new Promise(r=>setTimeout(r,200)); }
  const e=scene(), p=e.player;
  const path=e.planPath(p.x,p.y-160);
  check(!!path?.points?.length,'A* returns a route near forest start');
  p.walkTo(path.end.x,path.end.y,null,10,{path:path.points});
  const start={x:p.x,y:p.y};
  try { await wait(()=>Math.hypot(p.x-start.x,p.y-start.y)>8,'physical movement',60000); } catch(err) { throw Error(err.message+' '+JSON.stringify({mode:S.mode,modal:S.modalOpen,dialogue:S.dialogue.active,canAct:e.canAct(),paused:game.isPaused,sleep:game.loop.sleeping,loop:game.loop.actualFps,active:e.scene.isActive(),at:{x:p.x,y:p.y},start,path,target:p.moveTarget,input:S.input.move,velocity:p.vel})); }
  check(Math.hypot(p.x-start.x,p.y-start.y)>8,'Tap route advances physical player');
  p.update(.016,{x:1,y:0}); check(!p.moveTarget,'Manual movement cancels route immediately'); p.stop();
  // Real shared gesture handlers: a swipe release does not synthesize a world tap.
  const ui=game.scene.getScene('UIScene');let taps=0;const count=()=>taps++;
  S.bus.on('world:tap',count);
  const pointer={id:91,x:game.scale.width*.3,y:game.scale.height*.4,isDown:true};
  ui.input.emit('pointerdown',pointer,[]);
  ui.input.emit('pointermove',{...pointer,x:pointer.x+100});
  const first=ui.touch?.id;
  ui.input.emit('pointerdown',{...pointer,id:92},[]);
  check(ui.touch?.id===first,'Second finger cannot replace joystick owner');
  ui.input.emit('pointerup',{...pointer,x:pointer.x+100,isDown:false});
  check(taps===0 && S.input.joy.x===0 && S.input.joy.y===0,'Swipe release clears joystick without a tap'); S.bus.off('world:tap',count);
  panel.open=true;await new Promise(r=>setTimeout(r,80));
  check(!e.canAct()&&!p.moveTarget,'Comparison menu cancels movement and blocks world actions');
  panel.querySelector('[data-profile="a"]').click();check(!p.moveTarget,'Profile button cannot send a world tap');
  const nextHero=S.state.data.heroId==='warlock'?'witch':'warlock';
  panel.querySelector('#camera-hero').click();
  await wait(()=>scene().player!==p,'hero restart');
  check(S.state.data.heroId===nextHero&&scene().player.tex.down.includes(nextHero==='warlock'?'warlock':'hero'),'Hero switch uses the selected original assets');
  for(const [id,label] of [['city','city'],['city_bank','interior'],['forest','forest']]) {
    panel.querySelector(`[data-location="${id}"]`).click();
    try { await wait(()=>scene().loc?.id===id&&!scene().inTransition,'travel '+id); } catch(err) { throw Error(err.message+' '+JSON.stringify({loc:scene().loc?.id,transition:scene().inTransition,mode:S.mode,modal:S.modalOpen,dialogue:S.dialogue.active,canAct:scene().canAct(),paused:game.isPaused,loop:game.loop.actualFps,active:scene().scene.isActive(),panel:panel.open})); }
    await new Promise(r=>setTimeout(r,450));
    const s=scene(),c=s.cameras.main,b=c.getBounds();
    check(c.worldView.left>=b.left-1&&c.worldView.top>=b.top-1&&c.worldView.right<=b.right+1&&c.worldView.bottom<=b.bottom+1,label+': camera stays within rendered bounds');
    check(!Object.values(game.textures.list).some(t=>t.customData?.placeholder),label+': no missing lazy textures');
  }
  check(JSON.stringify(nonTest())===before,'Production local storage unchanged after movement, settings and travel');
  check(!frame.performance.getEntriesByType('resource').some(r=>/supabase|\/auth\/|\/rest\/|\/functions\//.test(r.name)),'No production API requests');
  await select('b');
  return {results,measurements,actualFps:game.loop.actualFps,notes:'Browser-rendered synthetic gesture integration, not a physical phone.'};
}
