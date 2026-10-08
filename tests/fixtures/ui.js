/** Synthetic layout stress fixtures, not playable/replayable wall states.
 * Production renderers and rule analyzers are used unchanged. */
import { Match } from '../../js/core/game.js';
import { parseTiles, shuffled } from '../../js/core/tiles.js';
import { board, handPanel, gameAnalysis } from '../../js/ui/table.js';
import { efficiencyView } from '../../js/ui/trainers.js';
import { newEfficiency, answerEfficiency, nextEfficiency } from '../../js/core/efficiency.js';
import { wireImages } from '../../js/ui/common.js';
function setupFixture() {
 const root=document.querySelector('#content'), params=new URLSearchParams(location.search);
 const match=new Match({},8842);
 Object.assign(match.s.players[0],{hand:parseTiles('123m123789p78s22z4s'),discards:4,draws:5,kind:'human'});
 match.s.players[0].drawn=match.s.players[0].hand.at(-1); match.s.interrupted=true;
 const ui={viewer:0,selected:null,started:true,paused:false,sort:true,riichi:false};
 let mode='table', e;
 function setRows(n) {
  for(let i=0;i<4;i++){
   const p=match.s.players[i];
   p.river=Array.from({length:n},(_,j)=>({id:((j*3+i*7)%34)*4+(j%4),seq:j*4+i,riichi:j===6,called:j===3,tsumogiri:j%3===0}));
   if(i===0&&n) p.river[0]={id:95,seq:0,called:true};
   if(i>0){
    p.riichi=true;
    p.melds=[{kind:'chi',tiles:parseTiles('123m'),called:parseTiles('1m')[0]},
      {kind:'pon',tiles:parseTiles('555z'),called:parseTiles('5z')[0]},
      {kind:i===1?'ankan':i===2?'kakan':'minkan',tiles:parseTiles('9999s'),called:i===1?null:parseTiles('9s')[0]}];
   }
  }
  render();
 }
 function showTrainer(shape) {
  e=newEfficiency(101);
  e.hand=parseTiles({standard:'123m123789p78s22z4s',chiitoi:'1122m3344p5566s1z9m',kokushi:'19m19p19s1234567z5m'}[shape]);
  e.wall=shuffled(101).filter(id=>!e.hand.includes(id)); mode='trainer'; render();
 }
 function render(){
  root.innerHTML=mode==='table'?`<div class="game-layout"><div class="game-surface">${board(match.s,0,{selected:ui.selected})}${handPanel(match,ui)}</div><aside class="game-side">${gameAnalysis(match,ui)}</aside></div>`:efficiencyView(e);
  wireImages(root);
 }
 root.addEventListener('click',event=>{
  const el=event.target.closest('[data-action]');if(!el||el.disabled)return;
  if(el.dataset.action==='discard-tile')ui.selected=Number(el.dataset.id);
  if(el.dataset.action==='cancel-selection')ui.selected=null;
  if(el.dataset.action==='eff-answer')answerEfficiency(e,Number(el.dataset.t));
  if(el.dataset.action==='eff-next')nextEfficiency(e);
  if(el.dataset.action==='eff-new'){e=newEfficiency(101);mode='trainer';}
  if(el.dataset.action==='eff-menu'){mode='table';ui.selected=null;}
  render();
 });
 window.fixture={match,ui,render,setRows,showTrainer,get exercise(){return e;}};
 setRows(Number(params.get('tiles')??24));
}
setupFixture();
