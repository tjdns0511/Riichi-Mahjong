/** Physical tiles use IDs 0..135; type=floor(id/4) is 0..33.
 * Keeping physical IDs is essential for red fives, tsumogiri and exact replay. */
export const WINDS = ['동', '남', '서', '북'];
export const HONORS = [...WINDS, '백', '발', '중'];
export const ORPHANS = [0,8,9,17,18,26,27,28,29,30,31,32,33];
export const typeOf = id => Math.floor(id / 4);
export const suitOf = t => Math.floor(t / 9);
export const rankOf = t => t % 9 + 1;
export const isHonor = t => t >= 27;
export const isTerminal = t => t < 27 && (t % 9 === 0 || t % 9 === 8);
export const isOutside = t => isHonor(t) || isTerminal(t);
export const isRed = (id, aka = true) => aka && [16,52,88].includes(id);
export const label = t => t < 27 ? `${rankOf(t)}${['만','통','삭'][suitOf(t)]}` : HONORS[t-27];
export const tileLabel = (id, aka = true) => `${isRed(id, aka) ? '적' : ''}${label(typeOf(id))}`;
/** Honor glyphs are not in the same order as their internal type IDs. */
export function glyph(t) {
  if (t < 9) return String.fromCodePoint(0x1f007+t);
  if (t < 18) return String.fromCodePoint(0x1f019+t-9);
  if (t < 27) return String.fromCodePoint(0x1f010+t-18);
  return String.fromCodePoint([0x1f000,0x1f001,0x1f002,0x1f003,0x1f006,0x1f005,0x1f004][t-27]);
}
/** Dora follows the indicator, with independent 4-wind and 3-dragon cycles. */
export function nextDora(t) {
  if (t < 27) return Math.floor(t/9)*9+(t+1)%9;
  if (t < 31) return 27+(t-27+1)%4;
  return 31+(t-31+1)%3;
}
/** Count physical IDs without losing tile multiplicity. */
export function counts(ids) {
  const c = Array(34).fill(0);
  for (const id of ids) c[typeOf(id)]++;
  return c;
}
/** Stable physical ordering makes the drawn tile independently trackable. */
export const sorted = ids => [...ids].sort((a,b)=>a-b);
/** Reproducible PRNG: gameplay logs preserve the complete shuffled wall as well. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a += 0x6D2B79F5; let t=a; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; };
}
/** Fisher–Yates: every physical tile appears exactly once. */
export function shuffled(seed = Date.now()) {
  const a=Array.from({length:136},(_,i)=>i), random=rng(seed);
  for(let i=135;i>0;i--){ const j=Math.floor(random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
/** Read standard 123m456p789s12344z notation; 0 means a red five.
 * Reject duplicate fifth copies instead of silently repairing invalid input. */
export function parseTiles(input) {
  const s=input.replace(/\s/g,'').toLowerCase();
  if(!s || !/^(?:[0-9]+[mpsz])+$/.test(s)) throw Error('예: 123456m234p567s11z 형식으로 입력하세요.');
  const ids=[], used=new Set();
  for(const match of s.matchAll(/([0-9]+)([mpsz])/g)){
    const suit='mpsz'.indexOf(match[2]);
    for(const n of match[1]){
      const red=n==='0', r=red?5:Number(n);
      if(r<1 || r>(suit===3?7:9) || (red&&suit===3)) throw Error('존재하지 않는 패입니다.');
      const t=suit*9+r-1, order=red?[0]:[1,2,3,0];
      const copy=order.find(k=>!used.has(t*4+k));
      if(copy===undefined) throw Error(`${label(t)}은 4장까지만 사용할 수 있습니다.`);
      used.add(t*4+copy); ids.push(t*4+copy);
    }
  }
  return ids;
}
/** Serialize tile notation; used for calculator sharing and test fixtures. */
export function notation(ids, aka=true) {
  return [0,1,2,3].map(s=>{ const group=sorted(ids).filter(id=>suitOf(typeOf(id))===s); return group.length?group.map(id=>isRed(id,aka)?'0':rankOf(typeOf(id))).join('')+'mpsz'[s]:''; }).join('');
}
/** Input validation is also used at replay boundaries. */
export function validTiles(ids, max=136) { return Array.isArray(ids)&&ids.length<=max&&ids.every(id=>Number.isInteger(id)&&id>=0&&id<136)&&new Set(ids).size===ids.length; }
