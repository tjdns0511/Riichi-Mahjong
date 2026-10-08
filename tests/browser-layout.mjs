import assert from 'node:assert/strict';
import { resolve } from 'node:path';
/** Real DOM bounds, including rotated tiles, not merely screenshot inspection. */
function geometryReport(){
 const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
 const intersects=(a,b)=>Math.min(a.right,b.right)-Math.max(a.x,b.x)>.6&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>.6;
 const occupied=[...document.querySelectorAll('.river,.seat,.table-center,.dora-rack,.hand-panel')].map(e=>({name:e.className,rect:box(e)}));
 const collisions=[];
 for(let i=0;i<occupied.length;i++)for(let j=i+1;j<occupied.length;j++)
  if(intersects(occupied[i].rect,occupied[j].rect))collisions.push([occupied[i].name,occupied[j].name]);
 const tiles=[...document.querySelectorAll('.river-cell > .tile')];
 for(let i=0;i<tiles.length;i++){
  const a=box(tiles[i]),river=box(tiles[i].closest('.river'));
  if(a.x<river.x-.6||a.right>river.right+.6||a.y<river.y-.6||a.bottom>river.bottom+.6)collisions.push(['tile outside river',i]);
  for(let j=i+1;j<tiles.length;j++)if(intersects(a,box(tiles[j])))collisions.push(['tiles',i,j]);
 }
 const h=document.querySelector('.hand-panel .hand'), p=document.querySelector('.furiten-panel'), footer=document.querySelector('.hand-footer');
 if(h&&p&&intersects(box(h),box(p)))collisions.push(['hand','warning']);
 if(footer&&p&&intersects(box(footer),box(p)))collisions.push(['buttons','warning']);
 return {collisions,overflow:document.documentElement.scrollWidth>innerWidth+1,
  handTargets:[...document.querySelectorAll('[data-action="discard-tile"]')].map(box),
  rotations:[...document.querySelectorAll('.riichi-cut>.tile')].map(e=>getComputedStyle(e).transform)};
}
export async function runLayoutChecks(browser,out) {
 const sizes=[[320,568],[360,800],[393,873],[412,915],[768,1024],[1440,1050],[873,393]];
 for(const [width,height]of sizes){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<900,hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://raw.githubusercontent.com/**',r=>r.abort());
  await page.goto('http://127.0.0.1:8765/Riichi-Mahjong/tests/fixtures/ui.html');
  await page.locator('.mahjong-board').waitFor();
  for(const n of [6,12,18,24,30]){
   await page.evaluate(n=>window.fixture.setRows(n),n);
   const geometry=await page.evaluate(geometryReport);
   assert.equal(geometry.overflow,false,`${width}x${height} ${n} tiles overflow`);
   assert.deepEqual(geometry.collisions,[],`${width}x${height} ${n} tiles collisions`);
   assert.equal(await page.locator('.river-cell').count(),n*4);
   if(n>=12)assert.ok(geometry.rotations.every(t=>t==='matrix(0, 1, -1, 0, 0, 0)'), 'riichi must rotate 90 degrees');
   if(width<=700)assert.ok(geometry.handTargets.every(r=>r.width>=35&&r.height>=44),'small touch target');
  }
  await page.locator('[data-action="discard-tile"][data-t="21"]').tap();
  await page.locator('.furiten-panel.is-furiten[data-preview="true"]').waitFor();
  assert.match(await page.locator('.ron-blocked-list').innerText(),/6삭·9삭/);
  assert.ok(await page.locator('.furiten-cause').count());
  assert.deepEqual((await page.evaluate(geometryReport)).collisions,[],'warning overlaps controls');
  await page.screenshot({path:resolve(out,`layout-${width}x${height}.png`),fullPage:true});
  await page.locator('[data-action="discard-tile"][data-t="0"]').tap();
  assert.equal(await page.locator('.furiten-panel[data-preview="true"]').count(),0,'selection must update preview');
  await page.locator('[data-action="cancel-selection"]').click();
  assert.equal(await page.locator('.furiten-panel[data-preview="true"]').count(),0,'cancel removes preview');
  // Same document rotates; responsive layout must recalculate without reload.
  await page.setViewportSize({width:height,height:width});
  const rotated=await page.evaluate(geometryReport);
  assert.deepEqual(rotated.collisions,[],'rotated collisions');assert.equal(rotated.overflow,false,'rotated overflow');
  await page.setViewportSize({width,height});
  for(const [shape,type] of [['standard',21],['chiitoi',8],['kokushi',4]]){
   await page.evaluate(shape=>window.fixture.showTrainer(shape),shape);
   const wall=await page.evaluate(()=>window.fixture.exercise.wall.length);
   await page.locator(`[data-action="eff-answer"][data-t="${type}"]`).tap();
   await page.getByRole('heading',{name:'텐파이 달성!'}).waitFor();
   assert.equal(await page.locator('.efficiency-result .hand > .tile').count(),13);
   assert.equal(await page.locator('[data-action="eff-next"]').count(),0);
   assert.equal(await page.evaluate(()=>window.fixture.exercise.wall.length),wall);
   await page.locator('.efficiency-history summary').first().click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'result overflow');
  }
  await page.screenshot({path:resolve(out,`results-${width}x${height}.png`),fullPage:true});
  await page.getByRole('button',{name:'다시 연습하기',exact:true}).click();
  assert.equal(await page.locator('[data-action="eff-answer"]').count(),14);
  assert.deepEqual(errors,[],`${width} runtime errors`);
  console.log(`layout ${width}x${height}: 1–5 river rows x4, calls, riichi rotation, preview, orientation, 3 trainer shapes passed`);
  await context.close();
 }
 // Chromium 4x CPU slowdown is a proxy for constrained devices, not an A34 test.
 const page=await browser.newPage();await page.goto('http://127.0.0.1:8765/Riichi-Mahjong/tests/fixtures/ui.html');
 const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 const latency=await page.evaluate(async()=>{
  const {Match}=await import('../../js/core/game.js'),{chooseTurn}=await import('../../js/core/ai.js');
  const samples=[];
  for(let seed=1;seed<=40;seed++){
   const m=new Match({seats:Array.from({length:4},()=>({kind:'ai',level:'hard'}))},seed);
   const start=performance.now();chooseTurn(m,0);samples.push(performance.now()-start);
  }
  samples.sort((a,b)=>a-b);return {p95:samples[37],max:samples.at(-1)};
 });
 assert.ok(latency.max<1000,'4x throttled AI exceeded 1s');
 console.log('4x Chromium CPU latency '+JSON.stringify(latency));await page.close();
}
