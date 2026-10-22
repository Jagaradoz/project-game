/** Local software-Chrome checks. No physical webcam or device FPS acceptance. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage } from './cdp.mjs';
const base = process.argv[2] ?? 'http://localhost:3100';
const output = process.env.TEST_MODE_OUTPUT ?? 'docs/shots/scope-modes';
mkdirSync(output, { recursive: true });
const browser = await launchBrowser({ width: 1366, height: 768, port: 9351 });
const page = await openPage(browser.port);
try {
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    localStorage.setItem('trail_runner_mock_v1',JSON.stringify({accounts:[{displayName:'Legacy account'}],runs:[{score:99999}]}));
    window.__playerStorageAccess=[];
    for(const method of ['getItem','setItem','removeItem']) {
      const original=Storage.prototype[method];
      Storage.prototype[method]=function(key,...args) {
        if(String(key).startsWith('trail_runner')) window.__playerStorageAccess.push({method,key});
        return original.call(this,key,...args);
      };
    }
    window.__cameraRequests=0;
    window.__cameraBehavior='hold';
    navigator.mediaDevices.getUserMedia=()=>{
      window.__cameraRequests++;
      if(window.__cameraBehavior==='synthetic') {
        const source=document.createElement('canvas');source.width=640;source.height=480;
        const ctx=source.getContext('2d');let frame=0;
        const draw=()=>{ctx.fillStyle='#333';ctx.fillRect(0,0,640,480);ctx.fillStyle='white';ctx.font='24px sans-serif';ctx.fillText('Synthetic camera '+frame++,40,240)};
        draw();const timer=setInterval(draw,33);
        const stream=source.captureStream(30);
        stream.getVideoTracks()[0].addEventListener('ended',()=>clearInterval(timer));
        window.__lastCameraStream=stream;
        return Promise.resolve(stream);
      }
      return new Promise((resolve,reject)=>{window.__denyCamera=()=>reject(new DOMException('Synthetic permission rejection','NotAllowedError'))});
    };
  ` });
  const retained = ['/', '/calibrate', '/test', '/play', '/result'];
  const removed = ['/profile', '/login', '/register', '/profile/edit', '/leaderboard', '/consent', '/practice', '/characters', '/catalog.html'];
  for (const route of retained) assert.equal((await fetch(base + route)).status, 200, route);
  for (const route of removed) assert.equal((await fetch(base + route)).status, 404, route);
  await page.goto(base + '/');
  await page.waitFor(`document.querySelector('a[href="/test"]') && document.querySelector('a[href="/play"]')`);
  await page.evaluate(`document.querySelector('a[href="/test"]').click()`);
  await page.waitFor(`location.pathname==='/test' && document.querySelector('[data-testid="test-mode-grid"]')`);
  await page.waitFor(`!document.querySelector('[aria-label="Character response"]').innerText.includes('Loading character')`, { timeoutMs: 90000 });
  assert.equal(await page.evaluate(`document.querySelector('[aria-label="Animated game character responding to detected movements"]').getContext('webgl2').isContextLost()`), false);
  const panels = await page.evaluate(`Array.from(document.querySelector('[data-testid="test-mode-grid"]').children, el=>{const r=el.getBoundingClientRect();return {label:el.getAttribute('aria-label'),x:r.x,y:r.y,bottom:r.bottom,width:r.width,height:r.height}})`);
  assert.equal(panels.length, 2);
  assert.ok(panels.every(p => p.y >= 0 && p.bottom <= 768 && Math.abs(p.width / p.height - 9 / 16) < .01), 'two portrait panels fit in the desktop viewport');
  assert.ok(Math.abs(panels[0].y - panels[1].y) < 1 && panels[1].x > panels[0].x, 'camera and character share one row');
  assert.equal(await page.evaluate(`document.querySelector('[data-testid="developer-diagnostics"]').open`), false, 'developer diagnostics starts collapsed');
  assert.equal(await page.evaluate(`document.querySelector('[aria-label="Live measurements"] canvas')`), null);
  assert.ok(await page.evaluate(`getComputedStyle(document.querySelector('video')).objectFit === getComputedStyle(document.querySelector('video').parentElement.querySelector('canvas')).objectFit`), 'camera and skeleton use identical portrait cropping');
  assert.equal(await page.evaluate('window.__cameraRequests'), 1, 'Test Mode automatically requests camera once');
  assert.ok(await page.evaluate(`!document.querySelector('[aria-label="Character response"]').textContent.includes('Camera off')`), 'character preview never labels camera state');
  assert.equal(await page.evaluate(`document.querySelectorAll('[aria-label="All four movements"] li').length`), 4, 'all four movements are discoverable');
  assert.equal(await page.evaluate(`document.querySelector('[aria-label="Repetition goal"]').value`), '5', 'practice defaults to five successful repetitions');
  assert.ok(await page.evaluate(`document.querySelector('[aria-label="Practice guide"]').innerText.includes('Start pose')`), 'guide provides an explicit starting action');
  assert.equal(await page.evaluate(`document.querySelectorAll('header, footer').length`), 0, 'Test Mode has no header or footer');
  assert.equal(await page.evaluate(`document.querySelector('[aria-label="Developer event log"]')`), null, 'collapsed diagnostics does not render its event rows');
  for (const [width, height] of [[1366, 768], [1024, 600], [768, 600], [390, 844]]) {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await page.evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    assert.ok(await page.evaluate(`document.documentElement.scrollWidth<=innerWidth && Array.from(document.querySelectorAll('[data-testid="test-mode-grid"] > section, [aria-label="Practice guide"]')).every(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})`), `guide and portrait panels fit ${width}x${height} without horizontal overflow`);
    if (width === 390) writeFileSync(output + '/test-mode-mobile.png', await page.screenshot());
  }
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  writeFileSync(output + '/test-mode.png', await page.screenshot());
  const characterClip = await page.elementClip('[aria-label="Character response"]');
  const idleBefore = await page.screenshot(characterClip);
  await page.evaluate(`new Promise(resolve=>setTimeout(resolve,600))`);
  assert.notDeepEqual(await page.screenshot(characterClip), idleBefore, 'character idle animation advances while awaiting camera');
  await page.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Free practice').click()`);
  await page.waitFor(`document.querySelector('button[aria-pressed="true"]').textContent==='Free practice'`);
  await page.evaluate(`document.querySelectorAll('[aria-label="All four movements"] button')[3].click()`);
  await page.waitFor(`document.querySelector('[aria-label="Practice guide"] h2').textContent==='Clap overhead'`);
  assert.ok(await page.evaluate(`document.querySelector('[aria-label="Practice guide"]').innerText.includes('no repetition goal')`));
  await page.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Guided practice').click();document.querySelectorAll('[aria-label="All four movements"] button')[0].click()`);
  await page.evaluate(`{const goal=document.querySelector('[aria-label="Repetition goal"]');goal.value='10';goal.dispatchEvent(new Event('change',{bubbles:true}))}`);
  await page.waitFor(`document.querySelector('[aria-label="Practice guide"]').innerText.includes('0 / 10 successful')`);
  for (let i=0;i<4;i++) {
    await page.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Skip pose').click()`);
    await page.waitFor(i===3 ? `document.querySelector('[aria-label="Practice guide"]').textContent.includes('Practice reviewed')` : `document.querySelector('[aria-label="Practice guide"]').textContent.includes('Pose ${i+2} of 4')`);
  }
  assert.ok(await page.evaluate(`document.querySelector('[aria-label="Practice guide"]').innerText.includes('0 completed · 4 skipped')`));
  await page.evaluate(`document.querySelectorAll('[aria-label="All four movements"] button')[0].click()`);
  await page.waitFor(`document.querySelector('[aria-label="Repetition goal"]')`);
  await page.evaluate(`{const goal=document.querySelector('[aria-label="Repetition goal"]');goal.value='5';goal.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-testid="developer-diagnostics"] summary').click()}`);
  await page.waitFor(`document.querySelector('[data-testid="developer-diagnostics"]').open`);
  await page.waitFor(`document.querySelectorAll('[aria-label="Live measurements"] dl > div').length===6`);
  await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await page.evaluate(`document.querySelector('[data-testid="developer-diagnostics"]').scrollIntoView()`);
  assert.ok(await page.evaluate(`document.documentElement.scrollWidth<=innerWidth`), 'expanded diagnostics does not overflow phone viewport');
  writeFileSync(output + '/test-mode-diagnostics-mobile.png', await page.screenshot());
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await page.evaluate(`document.querySelector('[data-testid="developer-diagnostics"]').scrollIntoView()`);
  writeFileSync(output + '/test-mode-diagnostics.png', await page.screenshot());
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.ok(await page.evaluate(`Array.from(document.querySelectorAll('[aria-label="Practice guide"] svg g')).every(g=>getComputedStyle(g).animationName==='none')`), 'reduced motion uses a still diagram');
  await page.send('Emulation.setEmulatedMedia', { features: [] });
  await page.evaluate(`const original=URL.createObjectURL;URL.createObjectURL=blob=>{window.__diagnosticBlob=blob;return original(blob)};Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Download JSON').click()`);
  const report = await page.evaluate(`window.__diagnosticBlob.text().then(JSON.parse)`);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.practice.goal, 5);
  assert.ok(report.appVersion && report.startedAt && report.exportedAt);
  assert.ok(report.events.some(e=>e.category==='practice' && e.event==='skip'));
  assert.ok(!JSON.stringify(report).includes('landmarks'));
  await page.evaluate(`const filter=document.querySelector('[aria-label="Event type"]');filter.value='error';filter.dispatchEvent(new Event('change',{bubbles:true}))`);
  assert.ok(await page.evaluate(`Array.from(document.querySelectorAll('[aria-label="Scrollable event history"] li')).every(li=>li.innerText.includes('error'))`));
  await page.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Clear logs').click()`);
  await page.waitFor(`document.querySelector('[aria-label="Developer event log"]').innerText.includes('0 / 500 retained')`);
  await page.evaluate(`document.querySelector('[data-testid="developer-diagnostics"] summary').click()`);
  await page.evaluate(`window.scrollTo(0,0)`);
  await page.evaluate(`window.__denyCamera()`);
  await page.waitFor(`document.querySelector('[aria-label="Camera and skeleton"] button')?.textContent==='Allow camera'`);
  assert.equal(await page.evaluate('location.pathname'), '/test', 'denying camera stays in Test Mode');
  assert.ok(await page.evaluate(`!document.querySelector('[aria-label="Character response"]').textContent.includes('Camera off')`), 'camera denial does not add a character label');
  assert.equal(await page.evaluate('window.__cameraRequests'), 1);
  assert.equal(await page.evaluate(`document.querySelectorAll('[aria-label="Camera and skeleton"] button').length`), 1, 'camera retry stays in camera panel');
  await page.evaluate(`document.querySelector('[data-testid="developer-diagnostics"] summary').click()`);
  await page.waitFor(`document.querySelectorAll('[aria-label="Timed evaluation"] button').length===4`);
  assert.ok(await page.evaluate(`Array.from(document.querySelectorAll('[aria-label="Timed evaluation"] button')).every(b=>b.disabled)`), 'timed tests require valid tracking');
  await page.evaluate(`document.querySelector('[data-testid="developer-diagnostics"] summary').click()`);
  assert.equal(await page.evaluate(`document.querySelector('video').srcObject`), null);
  assert.ok(await page.evaluate(`document.documentElement.scrollWidth<=innerWidth`), 'camera retry does not cause horizontal overflow');
  writeFileSync(output + '/test-mode-denied.png', await page.screenshot());
  await page.evaluate(`window.__cameraBehavior='hold';document.querySelector('[aria-label="Camera and skeleton"] button').click()`);
  await page.waitFor(`window.__cameraRequests===2 && !document.querySelector('[aria-label="Camera and skeleton"] button')`);
  await page.evaluate(`window.__denyCamera()`);
  await page.waitFor(`document.querySelector('[aria-label="Camera and skeleton"] button')`);
  assert.equal(await page.evaluate('location.pathname'), '/test', 'repeated rejection stays in Test Mode');
  await page.evaluate(`window.__cameraBehavior='synthetic';document.querySelector('[aria-label="Camera and skeleton"] button').click()`);
  await page.waitFor(`location.pathname==='/test' && document.querySelector('video')?.srcObject && document.querySelector('video').readyState>=2`);
  assert.equal(await page.evaluate('window.__cameraRequests'), 3, 'each retry requests camera once');
  assert.equal(await page.evaluate(`document.querySelector('[aria-label="Camera and skeleton"] button')`), null, 'successful camera startup hides retry');
  writeFileSync(output + '/test-mode-camera.png', await page.screenshot());
  await page.evaluate(`history.back()`);
  await page.waitFor(`location.pathname==='/' && !document.querySelector('video')`);
  // Back may restore a separate Home document. Its globals cannot reference
  // the departed Test document's stream; verify tracks only for client navigation.
  assert.ok(await page.evaluate(`window.__lastCameraStream ? window.__lastCameraStream.getTracks().every(track=>track.readyState==='ended') : window.__cameraRequests===0`), 'navigation releases the camera or restores the camera-free Home document');
  await page.goto(base + '/play');
  await page.waitFor(`location.pathname==='/play' && window.__lane?.ready`, { timeoutMs: 90000 });
  assert.equal(await page.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Start Game Mode').disabled`), true);
  assert.equal(await page.evaluate('window.__cameraRequests'), 0, 'navigation does not request camera automatically');
  writeFileSync(output + '/game-setup.png', await page.screenshot());
  await page.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Development: skip camera').click()`);
  await page.waitFor(`document.querySelector('[aria-label="Progress toward 20 minutes of gameplay"]')`);
  await page.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Pause').click()`);
  await page.waitFor(`document.querySelector('[aria-label="Game paused"]')`);
  await page.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Resume').click()`);
  await page.waitFor(`!document.querySelector('[aria-label="Game paused"]')`);
  await page.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Finish session').click()`);
  await page.waitFor(`location.pathname==='/result' && document.body.innerText.toLowerCase().includes('detected knee steps')`);
  assert.ok(await page.evaluate(`document.body.innerText.toLowerCase().includes('detected knee steps')`));
  assert.equal(await page.evaluate(`document.querySelector('a[href="/profile"]')`), null, 'no Profile link');
  assert.deepEqual(await page.evaluate('window.__playerStorageAccess'), []);
  writeFileSync(output + '/result.png', await page.screenshot());
  await page.send('Page.reload');
  await page.waitFor(`document.body.innerText.toLowerCase().includes('no run to show')`);
  assert.deepEqual(await page.evaluate('window.__playerStorageAccess'), []);
  const errors = page.logs.filter(log => log.level === 'pageerror');
  assert.deepEqual(errors, []);
  writeFileSync(output + '/acceptance.json', JSON.stringify({ retained, removed, panels, storageAccess: [], physicalWebcam: 'not tested' }, null, 2));
  console.log('Scope browser checks passed: routes, guided/free practice, all four poses, 5/10 goals, skip/summary, diagnostics/filter/clear/JSON export, responsive portraits, camera denial/retry, synthetic camera cleanup, animation, game pause/resume and result reset. Real pose inference and physical-webcam acceptance are excluded from this UI check.');
} finally { await page.close(); await browser.close(); }
process.exit(0);
