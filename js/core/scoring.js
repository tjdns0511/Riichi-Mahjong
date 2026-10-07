import { counts, typeOf, isOutside, isHonor, isTerminal, nextDora, isRed, ORPHANS, label } from './tiles.js';
import { decompositions } from './shanten.js';

export const ceil100=n=>Math.ceil(n/100)*100;
/** Japanese basic-points calculation, with independently rounded payments.
 * Honba and deposits are settlement concerns, not han/fu or limit modifiers. */
export function payments(han,fu,dealer=false,tsumo=false,yakuman=0,kiriage=false) {
  let basic,limit='';
  if(yakuman){basic=8000*yakuman;limit=yakuman===1?'역만':`${yakuman}배 역만`;}
  else if(han>=13){basic=8000;limit='헤아림 역만';}
  else if(han>=11){basic=6000;limit='삼배만';}
  else if(han>=8){basic=4000;limit='배만';}
  else if(han>=6){basic=3000;limit='하네만';}
  else {basic=fu*2**(han+2);if(han>=5||basic>=2000||(kiriage&&basic===1920)){basic=2000;limit='만관';}}
  const ron=ceil100(basic*(dealer?6:4));
  const child=ceil100(basic*(dealer?2:1)), parent=ceil100(basic*2);
  return {basic,limit,ron,child,parent,total:tsumo?(dealer?child*3:child*2+parent):ron};
}
/** Turn a declared meld into a scoring group without concealing open quads. */
function meldGroup(m){return {kind:m.kind==='chi'?'sequence':m.tiles.length===4?'quad':'triplet',t:Math.min(...m.tiles.map(typeOf)),open:m.kind!=='ankan',declared:true};}
/** The winning tile can occupy several groups. Every interpretation is scored;
 * otherwise pinfu, concealed triplets and wait fu are easily mis-scored. */
function allocations(d,win) {
  if(d.kind!=='standard')return [{part:'special',index:-1,wait:d.kind==='chiitoi'?'단기':'국사'}];
  const out=[];
  if(d.pair===win)out.push({part:'pair',index:-1,wait:'단기'});
  d.groups.forEach((g,i)=>{
    if(g.kind==='triplet'&&g.t===win)out.push({part:'group',index:i,wait:'쌍퐁'});
    if(g.kind==='sequence'&&win>=g.t&&win<=g.t+2){
      let wait='양면';
      if(win===g.t+1)wait='간짱';
      else if((g.t%9===0&&win===g.t+2)||(g.t%9===6&&win===g.t))wait='변짱';
      out.push({part:'group',index:i,wait});
    }
  });return out;
}
/** Evaluate a complete hand. Returns null for incomplete or yaku-less hands.
 * ctx.winTile MUST be included in ids, even for ron. Meld tiles are separate.
 * All regular yaku, standard yakuman, double variants and stacked yakuman are
 * evaluated independently; dora never satisfies the one-yaku requirement. */
export function scoreHand(ids,melds=[],ctx={}) {
  const c=counts(ids), win=typeOf(ctx.winTile??ids.at(-1));
  const menzen=melds.every(m=>m.kind==='ankan'), all=[...ids,...melds.flatMap(m=>m.tiles)], allTypes=all.map(typeOf);
  const closed=menzen?1:0, tsumo=!!ctx.tsumo, dealer=!!ctx.dealer;
  const allCounts=counts(all), double=ctx.doubleYakuman===false?1:2;
  const before=[...c];before[win]--;
  const decomps=decompositions(c,melds.length), results=[];
  for(const d of decomps)for(const a of allocations(d,win)){
    const yaku=[], yakumans=[], fuItems=[];
    const add=(name,han)=>yaku.push({name,han});
    const yak=(name,multiple=1)=>yakumans.push({name,multiple});
    const groups=d.kind==='standard'?[...d.groups.map((g,i)=>({...g,open:!tsumo&&a.part==='group'&&a.index===i&&g.kind==='triplet'})),...melds.map(meldGroup)]:[];
    const trips=groups.filter(g=>g.kind!=='sequence'), seq=groups.filter(g=>g.kind==='sequence');
    const concealed=trips.filter(g=>!g.open).length;
    const honorTrip=t=>trips.some(g=>g.t===t);
    const suits=new Set(allTypes.filter(t=>t<27).map(t=>Math.floor(t/9)));
    const hasHonors=allTypes.some(isHonor);
    if(ctx.tenhou)yak('천화');
    if(ctx.chiihou)yak('지화');
    if(d.kind==='kokushi')yak(ORPHANS.every(t=>before[t]===1)?'국사무쌍 13면':'국사무쌍',ORPHANS.every(t=>before[t]===1)?double:1);
    if([31,32,33].every(honorTrip))yak('대삼원');
    if(concealed===4)yak(a.part==='pair'?'사암각 단기':'사암각',a.part==='pair'?double:1);
    if(allTypes.every(isHonor))yak('자일색');
    if(allTypes.every(t=>[19,20,21,23,25,32].includes(t)))yak('녹일색');
    if(allTypes.every(isTerminal))yak('청노두');
    if([27,28,29,30].every(honorTrip))yak('대사희',double);
    else if([27,28,29,30].filter(honorTrip).length===3&&d.pair>=27&&d.pair<=30)yak('소사희');
    if(groups.filter(g=>g.kind==='quad').length===4)yak('사깡쯔');
    if(!melds.length&&suits.size===1&&!hasHonors){
      const start=[...suits][0]*9, base=[3,1,1,1,1,1,1,1,3];
      if(base.every((n,i)=>c[start+i]>=n)){
        const pure=base.every((n,i)=>before[start+i]===n);
        yak(pure?'순정 구련보등':'구련보등',pure?double:1);
      }
    }
    if(yakumans.length){
      const yakuman=yakumans.reduce((n,y)=>n+y.multiple,0);
      results.push({han:0,fu:0,yakuman,yaku:yakumans,fuItems:[],wait:a.wait,shape:d,menzen,...payments(0,0,dealer,tsumo,yakuman)});continue;
    }
    if(menzen&&ctx.riichi)add(ctx.doubleRiichi?'더블리치':'리치',ctx.doubleRiichi?2:1);
    if(menzen&&ctx.riichi&&ctx.ippatsu&&!ctx.rinshan)add('잇파츠',1);
    if(menzen&&tsumo)add('멘젠쯔모',1);
    if(ctx.chankan)add('창깡',1);
    if(ctx.rinshan&&tsumo)add('영상개화',1);
    if(ctx.haitei&&tsumo&&!ctx.rinshan)add('해저로월',1);
    if(ctx.houtei&&!tsumo&&!ctx.chankan)add('하저로어',1);
    if(allTypes.every(t=>!isOutside(t)))add('탕야오',1);
    if(d.kind==='chiitoi')add('치또이츠',2);
    for(const t of [31,32,33])if(honorTrip(t))add(`역패 ${label(t)}`,1);
    if(honorTrip(27+(ctx.seat??0)))add('자풍패',1);
    if(honorTrip(27+(ctx.round??0)))add('장풍패',1);
    const valuePair=d.kind==='standard'?Number(d.pair>=31)+Number(d.pair===27+(ctx.seat??0))+Number(d.pair===27+(ctx.round??0)):0;
    const pinfu=menzen&&seq.length===4&&!valuePair&&a.wait==='양면';
    if(pinfu)add('핑후',1);
    if(menzen&&d.kind==='standard'){
      const freq={};seq.forEach(g=>freq[g.t]=(freq[g.t]??0)+1);
      const pairs=Object.values(freq).reduce((n,k)=>n+Math.floor(k/2),0);
      if(pairs>=2)add('량페코',3);else if(pairs===1)add('이페코',1);
    }
    if(trips.length===4)add('또이또이',2);
    if(concealed===3)add('산안커',2);
    if(groups.filter(g=>g.kind==='quad').length===3)add('산깡쯔',2);
    if([31,32,33].filter(honorTrip).length===2&&d.pair>=31)add('소삼원',2);
    if(allTypes.every(isOutside))add('혼노두',2);
    if(d.kind==='standard'){
      for(let r=0;r<7;r++)if([r,r+9,r+18].every(t=>seq.some(g=>g.t===t))){add('삼색동순',1+closed);break;}
      for(let r=0;r<9;r++)if([r,r+9,r+18].every(t=>trips.some(g=>g.t===t))){add('삼색동각',2);break;}
      for(let s=0;s<3;s++)if([s*9,s*9+3,s*9+6].every(t=>seq.some(g=>g.t===t))){add('일기통관',1+closed);break;}
      const outside=groups.every(g=>g.kind==='sequence'?g.t%9===0||g.t%9===6:isOutside(g.t))&&isOutside(d.pair);
      if(outside&&seq.length)add(hasHonors?'찬타':'준찬타',(hasHonors?1:2)+closed);
    }
    if(suits.size===1)add(hasHonors?'혼일색':'청일색',(hasHonors?2:5)+closed);
    if(!yaku.length)continue; // Dora-only agari is illegal.
    const baseHan=yaku.reduce((n,y)=>n+y.han,0);
    const bonus=[['도라',ctx.doraIndicators??[]],['우라도라',menzen&&ctx.riichi?(ctx.uraIndicators??[]):[]]];
    for(const [name,indicators] of bonus){const n=indicators.reduce((sum,id)=>sum+allCounts[nextDora(typeOf(id))],0);if(n)add(name,n);}
    const reds=all.filter(id=>isRed(id,ctx.aka!==false)).length;if(reds)add('적도라',reds);
    let fu=20;
    if(d.kind==='chiitoi'){fu=25;fuItems.push({name:'치또이츠 고정',fu:25});}
    else if(pinfu&&tsumo){fu=20;fuItems.push({name:'핑후 쯔모 고정',fu:20});}
    else {
      fuItems.push({name:'밑부',fu:20});
      const addFu=(name,n)=>{fu+=n;fuItems.push({name,fu:n});};
      if(menzen&&!tsumo)addFu('멘젠 론',10);
      if(tsumo)addFu('쯔모',2);
      if(valuePair)addFu('역패 머리',valuePair*2);
      if(['단기','간짱','변짱'].includes(a.wait))addFu(`${a.wait} 대기`,2);
      for(const g of trips){const n=(g.kind==='quad'?8:2)*(g.open?1:2)*(isOutside(g.t)?2:1);addFu(`${label(g.t)} ${g.open?'명':'암'}${g.kind==='quad'?'깡':'각'}`,n);}
      if(fu===20&&!menzen){fu=30;fuItems.push({name:'후로 론 최저부',fu:10});}
      const rounded=Math.ceil(fu/10)*10;if(rounded!==fu)fuItems.push({name:'10부 올림',fu:rounded-fu});fu=rounded;
    }
    const han=yaku.reduce((n,y)=>n+y.han,0);
    results.push({han,baseHan,fu,yakuman:0,yaku,fuItems,wait:a.wait,shape:d,menzen,...payments(han,fu,dealer,tsumo,0,!!ctx.kiriage)});
  }
  return results.sort((a,b)=>b.total-a.total||b.han-a.han||b.fu-a.fu)[0]??null;
}
/** Apply an ordinary ron/tsumo to a fresh score vector. Used by the game and
 * all-last trainer, so inverse problems and actual settlement share rounding. */
export function settle(scores,winner,loser,result,dealer,honba=0,sticks=0) {
  const next=[...scores], deltas=[0,0,0,0];
  if(loser!==null&&loser!==undefined){const n=result.ron+honba*300;deltas[loser]-=n;deltas[winner]+=n;}
  else for(let p=0;p<4;p++)if(p!==winner){const n=(p===dealer?result.parent:result.child)+honba*100;deltas[p]-=n;deltas[winner]+=n;}
  deltas[winner]+=sticks*1000;for(let p=0;p<4;p++)next[p]+=deltas[p];
  return {scores:next,deltas};
}
