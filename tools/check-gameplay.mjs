/** Repeatable browser acceptance using real reducers and exported assets. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage } from './cdp.mjs';
const browser = await launchBrowser({ width: 1100, height: 1000, port: 9334 });
const page = await openPage(browser.port);
const out = 'docs/shots/gameplay-hazards';
mkdirSync(out, { recursive: true });
async function capture(name) {
  await page.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  await page.evaluate(`(() => {
    document.querySelectorAll('#gameStage > :not(canvas)').forEach(el=>el.style.display='none');
    document.querySelectorAll('#gameStage, #gameStage canvas').forEach(el=>{
      el.style.setProperty('filter','none','important');el.style.setProperty('opacity','1','important');
    });
  })()`);
  writeFileSync(out+'/'+name+'.png',await page.screenshot(await page.elementClip('#gameStage')));
}
try {
  await page.goto('http://localhost:3000/play');
  await page.waitFor('window.__lane?.ready', { timeoutMs: 60000, label: 'game loaded' });
  await page.evaluate(`(() => {
    document.querySelector('#cameraPermissionModal')?.remove();
    document.querySelectorAll('#gameStage, #gameStage canvas').forEach(el => { el.style.filter = 'none'; el.style.opacity = '1'; });
    document.querySelectorAll('#gameStage > :not(canvas)').forEach(el => el.style.display = 'none');
    window.__lane.restart();
    window.__acceptance = { captures: [], seen: [], crossed: [], steps: 0 };
  })()`);
  let cleared = false;
  for (let batch = 0; batch < 80; batch++) {
    const result = await page.evaluate(`(() => {
      const h = window.__lane, a = window.__acceptance;
      for (let i=0; i<30; i++) {
        const before=h.summary();
        for (const e of before.enemies) if (!a.seen.includes(e.kind)) a.seen.push(e.kind);
        let lane=before.enemies.filter(e=>e.z<1).sort((x,y)=>y.z-x.z)[0]?.lane ?? 1;
        const hazard=before.hazards.find(r=>r.status!=='cleared'&&r.z<0);
        const jumping=Boolean(hazard&&hazard.z>-5&&hazard.z<-3&&before.jumpHeight===0);
        h.simulate(.05,{lane,firing:true,jump:jumping});
        a.steps++;
        let next=h.summary(), capture=null;
        if (hazard&&hazard.z>-18&&hazard.z<-12&&!a.captures.includes('hazard-approach')) capture='hazard-approach';
        if (jumping&&!a.captures.includes('jump')) { h.simulate(.2,{firing:true});next=h.summary();capture='jump'; }
        if (next.enemies.some(e=>e.kind==='boss'&&e.z>-40)&&!a.captures.includes('boss')) capture='boss';
        for(const r of next.hazards) if(r.status==='cleared'&&!a.crossed.includes(r.id)) a.crossed.push(r.id);
        if(capture){a.captures.push(capture);return {capture,state:next,seen:a.seen,crossed:a.crossed};}
        if(next.isOver)return {state:next,seen:a.seen,crossed:a.crossed};
      }
      return {state:h.summary(),seen:a.seen,crossed:a.crossed};
    })()`);
    if (result.capture) {
      if (result.capture==='jump') { assert.equal(result.state.anim,'jump'); assert.ok(result.state.jumpHeight>.8); }
      await capture(result.capture);
      console.log(result.capture,JSON.stringify(result.state));
    }
    if(result.state.isOver){
      assert.equal(result.state.isCleared,true,'autoplay reaches completion');
      assert.equal(result.state.bossDefeated,true); assert.equal(result.state.anim,'idle');
      assert.ok(result.crossed.length>0,'hazard crossings exercised');
      await capture('victory');
      cleared=true;break;
    }
  }
  assert.ok(cleared,'stage completed: '+JSON.stringify(await page.evaluate('window.__lane.summary()')));
  const captures=await page.evaluate('window.__acceptance.captures');
  assert.ok(captures.includes('hazard-approach')&&captures.includes('jump')&&captures.includes('boss'));
  const damage=await page.evaluate(`(() => {
    const h=window.__lane;h.restart();let hit=false;
    for(let i=0;i<1500;i++){
      const s=h.summary(),lane=s.enemies.filter(e=>e.z<1).sort((a,b)=>b.z-a.z)[0]?.lane??1;
      const river=s.hazards.find(o=>o.kind==='river'&&o.status!=='cleared'&&o.z>-5&&o.z<-3);
      h.simulate(.05,{lane,firing:false,jump:Boolean(river&&s.jumpHeight===0)});const n=h.summary();hit ||= n.anim==='hit';
      if(n.isOver)return {hit,anim:n.anim,hp:n.hp};
    }
    return {hit,anim:h.summary().anim,hp:h.summary().hp};
  })()`);
  assert.equal(damage.hit,true);assert.equal(damage.hp,0);assert.equal(damage.anim,'death');
  await page.evaluate('window.__lane.simulate(1,{firing:false})');
  await capture('defeat');
  const resources=await page.evaluate('performance.getEntriesByType("resource").filter(r=>r.responseEnd>0).map(r=>r.name)');
  for(const name of ['GoblinScout','BrambleSkeleton','ShroomBrute','ElderTreant'])assert.ok(resources.some(r=>r.endsWith('/enemies/animated/'+name+'.glb')));
  const errors=page.logs.filter(l=>['error','pageerror','warning'].includes(l.level)&&/asset unavailable|not found|PropertyBinding|Error|404|Failed/.test(l.text));
  assert.deepEqual(errors,[],'browser or animation binding errors');
  console.log('Gameplay browser checks passed',JSON.stringify({captures,damage}));
} finally { await page.close();await browser.close(); }
process.exit(0);

