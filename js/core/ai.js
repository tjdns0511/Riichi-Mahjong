import { counts,typeOf,isOutside,isHonor,isRed,nextDora,label,rng } from './tiles.js';
import { shanten,rankDiscards } from './shanten.js';
import { visibleCounts,indicators,seatWind } from './game.js';

/** A danger index is a ranking heuristic, NOT a calibrated deal-in probability.
 * Only genbutsu is certain against a particular opponent. Suji and walls can
 * still lose to pair, closed, edge, seven-pairs and thirteen-orphans waits. */
export function tileDanger(t,opponent,known,allRivers=[]) {
  const discarded=new Set(opponent.river.map(d=>typeOf(d.id)));
  if(discarded.has(t))return {risk:0,reasons:['현물 · 이 상대에게 론 방총 없음']};
  const declaration=opponent.river.find(d=>d.riichi);
  if(declaration&&allRivers.flat().some(d=>d.seq>declaration.seq&&typeOf(d.id)===t))return {risk:0,reasons:['리치 이후 통과패 · 현물']};
  const reasons=[];let risk=80;
  if(isHonor(t)){
    const ownCopies=opponent.ownVisible?.[t]??0; // Optional caller metadata only.
    const visible=Math.min(3,Math.max(0,(known[t]??0)-1-ownCopies));
    risk=[76,49,19,6][visible];reasons.push(visible?`자패 ${visible}장 이상 알려짐`:'생패 자패');
    return {risk,reasons};
  }
  const n=t%9,base=t-n;
  const lower=n>=3&&discarded.has(t-3),upper=n<=5&&discarded.has(t+3);
  const suji=n<=2?upper:n>=6?lower:lower&&upper;
  if(suji){risk=36;reasons.push('스지 · 양면 일부 배제');}
  else if(lower||upper){risk=57;reasons.push('반스지 · 반대쪽 양면 잔존');}
  const patterns=[];
  if(n>=2)patterns.push([t-2,t-1]);
  if(n<=6)patterns.push([t+1,t+2]);
  // Adjacent-number walls constrain sequence waits only, never guarantee safety.
  if(patterns.length&&patterns.every(pair=>pair.some(x=>known[x]>=4))){risk=Math.min(risk,18);reasons.push('노찬스 카베 · 바깥쪽 슌츠 차단');}
  else if(patterns.length&&patterns.every(pair=>pair.some(x=>known[x]>=3))){risk=Math.min(risk,43);reasons.push('원찬스 카베');}
  if(n===0||n===8){risk-=9;reasons.push('노두패');}
  if(!reasons.length)reasons.push('무스지 중장패');
  return {risk:Math.max(1,risk),reasons};
}
/** Combine threats by worst opponent first. A genbutsu for one riichi may be
 * dangerous against another; every opponent receives a separate explanation. */
export function defenseRows(ids,threats,known,allRivers=[]) {
  return [...new Set(ids.map(typeOf))].map(t=>{
    const opponents=threats.map(p=>({name:p.name,...tileDanger(t,p,known,allRivers)}));
    const worst=Math.max(0,...opponents.map(p=>p.risk)),sum=opponents.reduce((n,p)=>n+p.risk,0);
    return {t,risk:worst,combined:worst*10+sum,opponents};
  }).sort((a,b)=>a.combined-b.combined||a.t-b.t);
}
/** Exposed value and number of open groups suggest a threat, never prove tenpai. */
export function threatsFor(s,seat){
  const dora=indicators(s).map(id=>nextDora(typeOf(id)));
  return s.players.filter((p,i)=>i!==seat&&(p.riichi||p.melds.filter(m=>m.kind!=='ankan').length>=3||(p.melds.length>=2&&p.melds.flatMap(m=>m.tiles).filter(id=>dora.includes(typeOf(id))||isRed(id,s.config.aka)).length>=2)));
}
/** Estimate value retained in a candidate, using only owned/public information.
 * The heuristic rewards actual dora, value pairs/triplets and coherent suits. */
function retainedValue(ids,p,s,seat){
  const c=counts(ids),dora=indicators(s).map(id=>nextDora(typeOf(id)));
  let value=ids.reduce((n,id)=>n+(dora.filter(t=>t===typeOf(id)).length+(isRed(id,s.config.aka)?1:0))*3,0);
  for(const t of [31,32,33,27+seatWind(s,seat),27+Math.floor(s.kyoku/4)])if(c[t]>=2)value+=c[t]===3?5:2;
  const suits=[0,1,2].map(n=>ids.filter(id=>typeOf(id)<27&&Math.floor(typeOf(id)/9)===n).length);
  if(Math.max(...suits)>=9)value+=3;
  value+=ids.filter(id=>!isOutside(typeOf(id))).length*.12;return value;
}
/** Deterministic AI decisions, except the seeded beginner's deliberate tsumo
 * discard. No decision reads opponents' hands or the future wall. */
export function chooseTurn(match,seat){
  const s=match.s,p=s.players[seat];
  if(p.drawn!==null&&match.score(seat,p.drawn,true))return {kind:'tsumo',player:seat};
  if(match.canKyuushu(seat)&&shanten(counts(p.hand),p.melds.length)>=4)return {kind:'kyuushu',player:seat};
  const kans=match.kanOptions(seat),known=visibleCounts(s,seat),threats=threatsFor(s,seat);
  if(kans.length&&(!threats.length||p.riichi)&&p.level!=='easy'){
    const k=kans[0];return {kind:'kan',player:seat,kanKind:k.kind,t:k.t};
  }
  if(p.riichi)return {kind:'discard',player:seat,tile:p.drawn};
  const legal=p.hand.filter(id=>!p.forbidden.includes(typeOf(id)));
  if(p.level==='easy'&&p.drawn!==null&&legal.includes(p.drawn)&&rng(match.seed+s.serial*991+p.discards*41+seat*131)()<.2)return {kind:'discard',player:seat,tile:p.drawn};
  const rows=rankDiscards(p.hand,p.melds.length,known,p.forbidden);
  let candidates;
  if(p.level==='hard'&&threats.length){
    const safety=defenseRows(legal,threats,known,s.players.map(p=>p.river));
    candidates=legal.map(id=>({id,cost:safety.find(r=>r.t===typeOf(id)).combined*10+rows.find(r=>r.t===typeOf(id)).shanten*5-retainedValue(p.hand.filter(x=>x!==id),p,s,seat)*.1}));
  }else candidates=legal.map(id=>{const row=rows.find(r=>r.t===typeOf(id));return {id,cost:row.shanten*1000-(p.level==='easy'?0:row.total*5)-(p.level==='hard'?retainedValue(p.hand.filter(x=>x!==id),p,s,seat):0)};});
  candidates.sort((a,b)=>a.cost-b.cost||Number(isRed(a.id,s.config.aka))-Number(isRed(b.id,s.config.aka))||a.id-b.id);
  const tile=candidates[0].id,riichi=match.riichiDiscards(seat).includes(tile)&&!(p.level==='hard'&&threats.length);
  return {kind:'discard',player:seat,tile,riichi};
}
/** Intermediate AI prefers closed hands. Advanced calls only improve shanten
 * with a demonstrable yaku route, and folds rather than calling into a threat. */
export function chooseResponse(match,seat){
  const s=match.s,p=s.players[seat],q=s.pending,options=q.options[seat];
  const ron=options.findIndex(o=>o.kind==='ron');if(ron>=0)return {kind:'respond',player:seat,choice:ron};
  let choice=-1;
  if(p.level==='hard'&&!threatsFor(s,seat).length){
    const before=shanten(counts(p.hand),p.melds.length);
    for(let i=0;i<options.length;i++){
      const o=options[i];if(!o.tiles)continue;
      const t=typeOf(q.tile),valuable=[31,32,33,27+seatWind(s,seat),27+Math.floor(s.kyoku/4)].includes(t)&&o.kind!=='chi';
      const already=p.melds.some(m=>m.kind!=='chi'&&[31,32,33,27+seatWind(s,seat),27+Math.floor(s.kyoku/4)].includes(typeOf(m.tiles[0])));
      const allSimple=[...p.hand,...p.melds.flatMap(m=>m.tiles),q.tile].every(id=>!isOutside(typeOf(id)));
      if(!valuable&&!already&&!allSimple)continue;
      const hand=p.hand.filter(id=>!o.tiles.includes(id));
      const after=shanten(counts(hand),p.melds.length+1);
      if(after<before&&(o.kind==='minkan'||rankDiscards(hand,p.melds.length+1,visibleCounts(s,seat),o.forbidden)[0]?.shanten<before)){choice=i;break;}
    }
  }
  return {kind:'respond',player:seat,choice};
}
