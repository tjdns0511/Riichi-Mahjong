import { counts, ORPHANS, typeOf } from './tiles.js';

// Each suit's exact decomposition is memoized. A profile stores meld count,
// incomplete-block count and whether the single head pair has been allocated.
// Keeping the maximum block count per (meld,head) is a safe dominance reduction.
const suitCache=new Map(), fullCache=new Map();
function profiles(c, honors=false) {
  const key=(honors?'h':'s')+c.join('');
  if(suitCache.has(key)) return suitCache.get(key);
  const i=c.findIndex(n=>n>0);
  if(i<0) return [[0,0,0]];
  const best=new Map();
  const visit=(take,m,t,p)=>{
    for(const j of take)c[j]--;
    for(const [am,at,ap] of profiles(c,honors)){
      if(am+m>4||ap+p>1)continue;
      const k=(am+m)*2+ap+p, value=Math.min(4,at+t);
      best.set(k,Math.max(best.get(k)??-1,value));
    }
    for(const j of take)c[j]++;
  };
  visit([i],0,0,0); // An unused tile is a necessary branch, not a greedy cut.
  if(c[i]>=3)visit([i,i,i],1,0,0);
  if(c[i]>=2){visit([i,i],0,1,0);visit([i,i],0,0,1);}
  if(!honors){
    if(i<=6&&c[i+1]&&c[i+2])visit([i,i+1,i+2],1,0,0);
    if(i<=7&&c[i+1])visit([i,i+1],0,1,0);
    if(i<=6&&c[i+2])visit([i,i+2],0,1,0);
  }
  const result=[...best].map(([k,t])=>[Math.floor(k/2),t,k%2]);
  if(suitCache.size>65000)suitCache.clear();
  suitCache.set(key,result); return result;
}
/** Exact standard / seven-pairs / thirteen-orphans shanten. -1 is complete.
 * c is the concealed 34-count vector; every declared kan counts as ONE meld.
 * Special hands require zero declared melds, including concealed kans. */
export function shantenDetails(c, open=0) {
  const key=open+':'+c.join('');
  if(fullCache.has(key))return fullCache.get(key);
  let acc=[[open,0,0]];
  for(let s=0;s<4;s++){
    const ps=profiles(c.slice(s*9,s===3?34:s*9+9),s===3), best=new Map();
    for(const [m,t,p] of acc)for(const [am,at,ap] of ps){
      if(m+am>4||p+ap>1)continue;
      const k=(m+am)*2+p+ap;
      best.set(k,Math.max(best.get(k)??-1,Math.min(4,t+at)));
    }
    acc=[...best].map(([k,t])=>[Math.floor(k/2),t,k%2]);
  }
  const standard=Math.min(...acc.map(([m,t,p])=>8-2*m-Math.min(t,4-m)-p));
  const pairs=c.filter(n=>n>=2).length, unique=c.filter(n=>n>0).length;
  const chiitoi=open?Infinity:6-pairs+Math.max(0,7-unique);
  const kokushi=open?Infinity:13-ORPHANS.filter(t=>c[t]).length-(ORPHANS.some(t=>c[t]>=2)?1:0);
  const result={standard,chiitoi,kokushi,min:Math.min(standard,chiitoi,kokushi)};
  if(fullCache.size>60000)fullCache.clear();
  fullCache.set(key,result);return result;
}
export const shanten=(c,open=0)=>shantenDetails(c,open).min;
/** Enumerate every standard decomposition, plus both special hands.
 * Multiple decompositions must survive until scoring picks the highest payment. */
export function decompositions(c, open=0) {
  const sum=c.reduce((a,b)=>a+b,0), out=[];
  if(sum!==14-open*3)return out;
  if(!open&&c.filter(n=>n===2).length===7)out.push({kind:'chiitoi',pairs:c.flatMap((n,t)=>n===2?[t]:[])});
  if(!open&&ORPHANS.every(t=>c[t]>0)&&ORPHANS.reduce((n,t)=>n+c[t],0)===14)out.push({kind:'kokushi'});
  const work=[...c];
  const split=(groups,pair)=>{
    const i=work.findIndex(n=>n>0);
    if(i<0){if(groups.length===4-open)out.push({kind:'standard',pair,groups:groups.map(g=>({...g}))});return;}
    if(groups.length>=4-open)return;
    if(work[i]>=3){work[i]-=3;groups.push({kind:'triplet',t:i});split(groups,pair);groups.pop();work[i]+=3;}
    if(i<27&&i%9<=6&&work[i+1]&&work[i+2]){work[i]--;work[i+1]--;work[i+2]--;groups.push({kind:'sequence',t:i});split(groups,pair);groups.pop();work[i]++;work[i+1]++;work[i+2]++;}
  };
  for(let t=0;t<34;t++)if(work[t]>=2){work[t]-=2;split([],t);work[t]+=2;}
  return out;
}
/** Structural waits, including exhausted visible tiles. A fifth copy already in
 * the player's own concealed+meld tiles is excluded; dead outside waits remain. */
export function waits(c, open=0, owned=c) {
  if(c.reduce((a,b)=>a+b,0)!==13-open*3)return [];
  const result=[];
  for(let t=0;t<34;t++)if(owned[t]<4){c[t]++;if(decompositions(c,open).length)result.push(t);c[t]--;}
  return result;
}
/** Count effective draws against ALL known tiles (hand, discards, melds, dora).
 * The discarded candidate remains known: discarding never returns it to the wall. */
export function ukeire(c, open=0, known=c) {
  const base=shanten(c,open), tiles=[];
  for(let t=0;t<34;t++){
    const left=Math.max(0,4-known[t]); if(!left||c[t]>=4)continue;
    c[t]++;const next=shanten(c,open);c[t]--;
    if(next<base)tiles.push({t,left,shanten:next});
  }
  return {shanten:base,tiles,total:tiles.reduce((n,x)=>n+x.left,0)};
}
/** All legal type-distinct discards, sorted lexicographically: shanten first,
 * then effective remaining copies. Red-vs-normal value is evaluated by the AI. */
export function rankDiscards(ids, open=0, known=counts(ids), forbidden=[]) {
  const c=counts(ids), rows=[];
  for(let t=0;t<34;t++)if(c[t]&&!forbidden.includes(t)){
    c[t]--;const u=ukeire(c,open,known);c[t]++;
    rows.push({t,...u});
  }
  return rows.sort((a,b)=>a.shanten-b.shanten||b.total-a.total||a.t-b.t);
}
/** Optional two-draw analysis. For each first draw, choose a shanten-optimal
 * discard, then count second draws that reach base-2 shanten. Sampling is NOT
 * used. The model samples without replacement from unseen tiles; no opponents. */
export function twoStep(ids, open=0, known=counts(ids)) {
  const c=counts(ids), rows=rankDiscards(ids,open,known), unseen=136-known.reduce((a,b)=>a+b,0);
  for(const row of rows){
    c[row.t]--;let progress=0, expansion=0;
    for(let t=0;t<34;t++){
      const left=4-known[t];if(left<=0)continue;
      c[t]++;const k=[...known];k[t]++;
      if(shanten(c,open)===-1){progress+=left*(unseen-1);expansion+=left*(unseen-1);}
      else {
        let bestS=99,bestU=0,target=0;
        for(let d=0;d<34;d++)if(c[d]){c[d]--;const u=ukeire(c,open,k);c[d]++;
          const reached=u.tiles.filter(x=>x.shanten<=Math.max(-1,row.shanten-2)).reduce((n,x)=>n+x.left,0);
          target=Math.max(target,reached);
          if(u.shanten<bestS||(u.shanten===bestS&&u.total>bestU)){bestS=u.shanten;bestU=u.total;}
        }
        progress+=left*target;expansion+=left*bestU;
      }
      c[t]--;
    }
    c[row.t]++;
    row.twoStep=unseen>1?progress/(unseen*(unseen-1)):0;
    row.expansion=unseen?expansion/unseen:0;
  }
  return rows;
}
