import { payments,settle } from './scoring.js';

/** Initial seat wins a score tie, exactly as in Match.checkEnd(). */
export function ranking(scores){return scores.map((score,i)=>({score,i})).sort((a,b)=>b.score-a.score||a.i-b.i).map(p=>p.i);}
/** Enumerate feasible score-table entries, not arbitrary han/fu combinations.
 * 20 fu is closed pinfu tsumo (at least 2 han), 25 fu is seven pairs. A 110-fu
 * tsumo cannot have only 1 han: two concealed terminal kans imply more yaku. */
export function scoreEntries(tsumo,dealer=false){
  const result=[];
  for(let han=1;han<=13;han++)for(const fu of [20,25,30,40,50,60,70,80,90,100,110]){
    if(fu===20&&(!tsumo||han<2))continue;
    if(fu===25&&han<(tsumo?3:2))continue;
    if(tsumo&&fu===110&&han<2)continue;
    if(han>=5&&fu!==30)continue;
    result.push({han,fu,...payments(han,fu,dealer,tsumo)});
  }
  return result.sort((a,b)=>a.total-b.total||a.han-b.han||a.fu-b.fu);
}
/** Inverse scoring: determine the cheapest winning payments that achieve the
 * chosen rank. All four score changes matter; direct hit is not "gap/2" when
 * other seats, dealer tsumo, honba, deposits and tie order affect the ranking. */
export function solveAllLast({scores,winner=0,dealer=3,targetRank=1,honba=0,sticks=0}){
  const scenarios=[null,...[0,1,2,3].filter(i=>i!==winner)];
  return scenarios.map(loser=>{
    const qualifying=scoreEntries(loser===null,winner===dealer).map(p=>({entry:p,...settle(scores,winner,loser,p,dealer,honba,sticks)})).filter(r=>ranking(r.scores).indexOf(winner)<targetRank);
    const min=qualifying[0]?.entry.total;
    return {loser,minimum:min??null,solutions:qualifying.filter(r=>r.entry.total===min),best:qualifying[0]??null};
  });
}
