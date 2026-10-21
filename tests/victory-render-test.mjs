// Runs the actual DOM renderer and overlay with a small DOM adapter. It checks
// opening/closing and rendered rewards, not browser layout or Phaser rendering.
import assert from 'node:assert/strict';
import { build } from 'esbuild';

class Element {
  constructor(tag) { this.tagName=tag;this.children=[];this.attributes={};this.style={};this.listeners=new Map();this.parentNode=null;this.className='';this.ownText=''; }
  setAttribute(k,v){this.attributes[k]=String(v);}
  getAttribute(k){return this.attributes[k]??null;}
  set textContent(value){this.ownText=String(value);this.children=[];}
  get textContent(){return this.ownText+this.children.map(c=>c.textContent).join('');}
  get childElementCount(){return this.children.length;}
  append(...nodes){for(const node of nodes){node.parentNode=this;this.children.push(node);}}
  appendChild(node){this.append(node);return node;}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null;}
  get classList(){return {add:(name)=>{this.className=[...new Set([...this.className.split(' '),name])].join(' ');},contains:name=>this.className.split(' ').includes(name)};}
  addEventListener(name,fn){const list=this.listeners.get(name)||[];list.push(fn);this.listeners.set(name,list);}
  removeEventListener(name,fn){this.listeners.set(name,(this.listeners.get(name)||[]).filter(f=>f!==fn));}
  click(){for(const fn of this.listeners.get('click')||[])fn({stopPropagation(){},preventDefault(){}});}
  contains(node){return this===node||this.children.some(n=>n.contains(node));}
  focus(){document.activeElement=this;}
  get isConnected(){return document.body.contains(this)||document.head.contains(this);}
}
const walk=node=>[node,...node.children.flatMap(walk)];
const byClass=(root,name)=>walk(root).filter(n=>n.classList.contains(name));
globalThis.document={body:new Element('body'),head:new Element('head'),activeElement:null,createElement:tag=>new Element(tag),getElementById(id){return [...walk(this.head),...walk(this.body)].find(n=>n.id===id)||null;},querySelector:()=>null};
globalThis.window={innerWidth:0,innerHeight:0,addEventListener(){},removeEventListener(){}};
const bundle=await build({entryPoints:['src/ui/victoryUI.js'],bundle:true,write:false,platform:'node',format:'esm',define:{'import.meta.env.BASE_URL':'"/povelitel-tayn/"'}});
const {showVictory}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
let checks=0;
for(const heroId of ['witch','warlock'])for(const schoolXP of [{},{telekinesis:25,fire:10,ice:15},{storm:5}])for(const sapphires of [0,12]){
 const reward={items:{coins:18,ice_crystal:1},heroXP:65,schoolXP,sapphires},before=JSON.stringify(reward);let closed=0,advanced=null;
 const modal=showVictory({heroId,result:{reward,seconds:70.2,interrupts:2,vitals:{mana:39,maxMana:205}},onClose:value=>{closed++;advanced=value;}});
 assert.equal(document.body.childElementCount,1);assert.equal(modal.ov.getAttribute('aria-label'),'Победа!');checks+=2;
 assert.equal(byClass(modal.ov,'victory-school').length,Object.keys(schoolXP).length);checks++;
 const drops=byClass(modal.ov,'victory-drop');assert.equal(drops.filter(n=>n.getAttribute('data-item')==='sapphires').length,sapphires?1:0);checks++;
 if(sapphires){assert.ok(drops.find(n=>n.getAttribute('data-item')==='sapphires').textContent.includes('+12'));checks++;}
 assert.equal(JSON.stringify(reward),before,'rendering must not grant or change rewards');checks++;
 const button=byClass(modal.ov,'victory-continue')[0];assert.equal(document.activeElement,button);checks++;
 button.click();modal.close();assert.equal(closed,1);assert.equal(advanced,true);assert.equal(document.body.childElementCount,0);checks+=3;
}
let advance=null;const destroyed=showVictory({heroId:'witch',result:{reward:{schoolXP:{fire:10}}},onClose:value=>{advance=value;}});destroyed.destroy();assert.equal(advance,false);assert.equal(document.body.childElementCount,0);checks+=2;
console.log(`Victory renderer: ${checks} checks passed; real reward/school/sapphire rendering, Continue and exactly-once close.`);
