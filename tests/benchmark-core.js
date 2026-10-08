import { Match, visibleCounts, publicScoreContext } from '../js/core/game.js';
import { counts } from '../js/core/tiles.js';
import { shanten, rankDiscards } from '../js/core/shanten.js';
import { previewDiscard } from '../js/core/hand-analysis.js';
import { chooseTurn, chooseResponse, threatsFor } from '../js/core/ai.js';
import { chooseTurn as oldTurn, chooseResponse as oldResponse } from './fixtures/ai-v1.js';
import { ranking } from '../js/core/all-last.js';
/** Paired fixed seed and starting seat, complete hanchan including extensions.
 * Opponents are always frozen baseline Hard. Actions change the subsequent
 * trajectory, so matching seeds are variance control, not identical game paths. */
export function runBenchmarkMatch(seed, changedSeat = -1) {
 const match=new Match({length:'hanchan',seats:Array.from({length:4},(_,i)=>({name:'AI '+i,kind:'ai',level:'hard'}))},seed);
 // Benchmark removes ONLY snapshot storage, not events, rules or commands.
 match.history=[];match.record=function(type,data={}){this.events.push({seq:this.events.length,type,...JSON.parse(JSON.stringify(data))});};
 const stats=Array.from({length:4},()=>({discards:0,tenpaiDiscards:0,furitenTenpai:0,noYakuTenpai:0,wins:0,dealIns:0,calls:0,nonImprovingCalls:0,kans:0,lateOrThreatenedKans:0}));
 const pendingCall=new Map(),pendingKan=new Map();
 let seen=match.events.length,steps=0;
 while(match.s.phase!=='matchEnd'){
  if(++steps>12000)throw Error('Benchmark exceeded legal match action limit: '+seed);
  const s=match.s;
  let action;
  if(s.phase==='ended')action={kind:'next'};
  else {
   const seat=s.phase==='turn'?s.current:Object.keys(s.pending.options).map(Number).find(i=>!s.pending.decisions[i]);
   const candidate=seat===changedSeat;
   action=s.phase==='turn'?(candidate?chooseTurn:oldTurn)(match,seat):(candidate?chooseResponse:oldResponse)(match,seat);
   const p=s.players[seat];
   if(action.kind==='discard'){
    const a=previewDiscard(p,action.tile,{...publicScoreContext(s,seat),riichi:p.riichi||action.riichi},visibleCounts(s,seat));
    stats[seat].discards++;
    if(a.shanten===0){
     stats[seat].tenpaiDiscards++;if(a.furiten.any)stats[seat].furitenTenpai++;
     if(a.waits.every(w=>!w.ronScore&&!w.tsumoScore))stats[seat].noYakuTenpai++;
    }
   }
   if(action.kind==='respond'&&action.choice>=0){
    const o=s.pending.options[seat][action.choice];
    if(o.tiles){
     const h=p.hand.filter(id=>!o.tiles.includes(id));
     const before=shanten(counts(p.hand),p.melds.length);
     const after=o.kind==='minkan'?shanten(counts(h),p.melds.length+1)
      :rankDiscards(h,p.melds.length+1,visibleCounts(s,seat),o.forbidden)[0].shanten;
     pendingCall.set(seat,{nonImproving:after>=before,kan:o.kind==='minkan',risky:s.live.length<12||threatsFor(s,seat).length>0});
    }
   }
   if(action.kind==='kan')pendingKan.set(seat,{risky:s.live.length<12||threatsFor(s,seat).length>0});
  }
  match.dispatch(action);
  for(const e of match.events.slice(seen)){
   if(e.type==='win'){for(const i of e.winners)stats[i].wins++;if(e.loser!==null)stats[e.loser].dealIns++;}
   if(e.type==='call'){
    const c=pendingCall.get(e.player);stats[e.player].calls++;
    if(c?.nonImproving)stats[e.player].nonImprovingCalls++;
    if(c?.kan){stats[e.player].kans++;if(c.risky)stats[e.player].lateOrThreatenedKans++;}
   }
   if(e.type==='kan'){stats[e.player].kans++;if(pendingKan.get(e.player)?.risky)stats[e.player].lateOrThreatenedKans++;}
  }
  seen=match.events.length;
 }
 const scores=match.s.players.map(p=>p.score),order=ranking(scores);
 return {seed,changedSeat,rounds:match.s.serial+1,steps,players:stats.map((x,i)=>({...x,rank:order.indexOf(i)+1,points:scores[i]-25000}))};
}
/** Keep raw counts and denominators alongside ratios for reproducibility. */
export function summarizeBenchmark(records){
 const sum=key=>records.reduce((n,r)=>n+r[key],0), n=records.length;
 const totals=Object.fromEntries(['rounds','discards','tenpaiDiscards','furitenTenpai','noYakuTenpai','wins','dealIns','calls','nonImprovingCalls','kans','lateOrThreatenedKans'].map(k=>[k,sum(k)]));
 return {samples:n,averageRank:sum('rank')/n,averagePoints:sum('points')/n,...totals,
  winRate:totals.wins/totals.rounds,dealInRate:totals.dealIns/totals.rounds,
  furitenTenpaiRate:totals.furitenTenpai/Math.max(1,totals.tenpaiDiscards),
  noYakuTenpaiRate:totals.noYakuTenpai/Math.max(1,totals.tenpaiDiscards)};
}
