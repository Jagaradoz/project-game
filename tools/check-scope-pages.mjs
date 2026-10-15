/** Local software-Chrome checks. No physical webcam or device FPS acceptance. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage } from './cdp.mjs';
const base = process.argv[2] ?? 'http://localhost:3100';
const output = 'docs/shots/scope-modes';
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
  const retained = ['/', '/calibrate', '/test', '/play', '/result', '/profile'];
  const removed = ['/login', '/register', '/profile/edit', '/leaderboard', '/consent', '/practice', '/characters', '/catalog.html'];
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
  const measurementTop = await page.evaluate(`document.querySelector('[aria-label="Live measurements"]').getBoundingClientRect().top`);
  assert.ok(measurementTop > panels[0].bottom, 'text measurements are below both portrait panels');
  assert.equal(await page.evaluate(`document.querySelector('[aria-label="Live measurements"] canvas')`), null);
  assert.ok(await page.evaluate(`getComputedStyle(document.querySelector('video')).objectFit === getComputedStyle(document.querySelector('video').parentElement.querySelector('canvas')).objectFit`), 'camera and skeleton use identical portrait cropping');
  assert.equal(await page.evaluate('window.__cameraRequests'), 1, 'Test Mode automatically requests camera once');
  assert.ok(await page.evaluate(`!document.querySelector('[aria-label="Character response"]').textContent.includes('Camera off')`), 'character preview never labels camera state');
  assert.equal(await page.evaluate(`document.querySelectorAll('main button, main select, main dialog').length`), 0, 'Test Mode controls and trials are removed');
  assert.ok(await page.evaluate(`Array.from(document.querySelectorAll('dl dd')).every(el=>el.textContent.includes('0')&&!el.textContent.includes('—'))`), 'empty measurements use zero');
  assert.equal(await page.evaluate(`document.querySelectorAll('header, footer').length`), 0, 'Test Mode has no header or footer');
  assert.equal(await page.evaluate(`document.querySelectorAll('[aria-label="Live measurements"] dl > div').length`), 6, 'only Proposal measurement types are shown');
  for (const [width, height] of [[1366, 768], [1024, 600], [768, 600]]) {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await page.evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    assert.ok(await page.evaluate(`document.documentElement.scrollHeight<=innerHeight && document.documentElement.scrollWidth<=innerWidth && Array.from(document.querySelectorAll('[data-testid="test-mode-grid"] > section, [aria-label="Live measurements"] dt, [aria-label="Live measurements"] dd')).every(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth})`), `all content fits ${width}x${height} without scrolling`);
  }
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  writeFileSync(output + '/test-mode.png', await page.screenshot());
  const idleBefore = await page.screenshot();
  await page.evaluate(`new Promise(resolve=>setTimeout(resolve,600))`);
  assert.notDeepEqual(await page.screenshot(), idleBefore, 'idle animation advances while awaiting camera');
  await page.evaluate(`window.__denyCamera()`);
  await page.waitFor(`document.querySelector('[aria-label="Camera and skeleton"] button')?.textContent==='Allow camera'`);
  assert.equal(await page.evaluate('location.pathname'), '/test', 'denying camera stays in Test Mode');
  assert.ok(await page.evaluate(`!document.querySelector('[aria-label="Character response"]').textContent.includes('Camera off')`), 'camera denial does not add a character label');
  assert.equal(await page.evaluate('window.__cameraRequests'), 1);
  assert.equal(await page.evaluate(`document.querySelectorAll('main button').length`), 1, 'camera retry is the only control');
  assert.equal(await page.evaluate(`document.querySelectorAll('[aria-label="Live measurements"] button').length`), 0);
  assert.equal(await page.evaluate(`document.querySelector('video').srcObject`), null);
  assert.ok(await page.evaluate(`document.documentElement.scrollHeight<=innerHeight`), 'camera retry does not cause scrolling');
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
  await page.evaluate(`document.querySelector('a[href="/profile"]').click()`);
  await page.waitFor(`location.pathname==='/profile' && document.querySelector('a[href^="/result?run="]')`);
  assert.deepEqual(await page.evaluate('window.__playerStorageAccess'), []);
  writeFileSync(output + '/visit-profile.png', await page.screenshot());
  await page.send('Page.reload');
  await page.waitFor(`document.body.innerText.toLowerCase().includes('no runs yet') && !document.querySelector('a[href^="/result?run="]')`);
  assert.deepEqual(await page.evaluate('window.__playerStorageAccess'), []);
  const errors = page.logs.filter(log => log.level === 'pageerror');
  assert.deepEqual(errors, []);
  writeFileSync(output + '/acceptance.json', JSON.stringify({ retained, removed, panels, storageAccess: [], physicalWebcam: 'not tested' }, null, 2));
  console.log('Scope browser checks passed: six routes, eight removals, portrait/viewport fit, zero measurements, automatic camera entry, repeated denial stays in Test Mode, preview retry, synthetic camera acquisition/navigation cleanup, idle animation, pause/resume, finish/result and visit reset. Pose inference startup is network-dependent and excluded from this UI check.');
} finally { await page.close(); await browser.close(); }
process.exit(0);
