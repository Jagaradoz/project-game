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
  const click = async label => {
    await page.evaluate(`(() => { const b=Array.from(document.querySelectorAll('button')).find(b=>{const copy=b.cloneNode(true);copy.querySelectorAll('.sr-only').forEach(x=>x.remove());return copy.textContent.trim()===${JSON.stringify(label)}});if(!b)throw Error('Missing button '+${JSON.stringify(label)});b.focus();b.click(); })()`);
  };
  // Icon-only close has an accessible label.
  const closeOverlay = async () => { await page.evaluate(`document.querySelector('[aria-label="Close overlay"]').click()`); await page.waitFor(`!document.querySelector('dialog[open]')`); };
  const panels = await page.evaluate(`Array.from(document.querySelector('[data-testid="test-mode-grid"]').children, el=>({label:el.getAttribute('aria-label'),width:el.clientWidth,height:el.clientHeight}))`);
  assert.equal(panels.length,3);
  assert.ok(await page.evaluate(`document.querySelector('h1').textContent==='Guide Mode'`));
  assert.equal(await page.evaluate('window.__cameraRequests'),1);
  assert.ok(await page.evaluate(`document.querySelector('video').classList.contains('object-contain')`));
  assert.equal(await page.evaluate(`document.querySelector('dialog')`),null,'tools start closed');
  assert.deepEqual(await page.evaluate(`[...document.querySelector('[aria-label="Guide controls"]').querySelectorAll('button')].map(b=>b.firstChild.textContent.trim())`),['Measurements','Event log'],'only two toolbar actions');
  for(const [width,height] of [[1920,1080],[1366,768],[1024,600],[768,1024],[390,844],[320,568],[844,390],[667,375]]) {
    await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await page.evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    const bounds=await page.evaluate(`(() => {const guide=document.querySelector('[aria-label="Practice guide"]'),diagram=guide.querySelector('svg').getBoundingClientRect(),copy=guide.querySelector('[role="status"]').getBoundingClientRect();return {overflow:document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth,panels:[...document.querySelectorAll('[data-testid="test-mode-grid"]>section')].map(x=>{const r=x.getBoundingClientRect();return {x:r.x,y:r.y,bottom:r.bottom,right:r.right}}),diagram:{height:diagram.height,top:diagram.top,bottom:diagram.bottom},copy:{top:copy.top,bottom:copy.bottom},buttons:[...document.querySelector('[aria-label="Guide controls"]').querySelectorAll('button')].map(x=>{const r=x.getBoundingClientRect();return {bottom:r.bottom,right:r.right}})}})()`);
    assert.equal(bounds.overflow,false,JSON.stringify({width,height,...bounds}));
    assert.ok(bounds.panels.every(r=>r.x>=0&&r.y>=0&&r.bottom<=height&&r.right<=width),'all panels fit '+width+'x'+height);
    assert.ok(bounds.buttons.every(r=>r.bottom<=height&&r.right<=width),'dock fits '+width+'x'+height);
    assert.ok(bounds.diagram.height>=40&&bounds.diagram.bottom<=height,'visible diagram '+width+'x'+height);
    assert.ok(bounds.copy.bottom<=height,'guide instruction visible');
    if(width===390||width===1366||width===844||width===320)writeFileSync(output+'/guide-'+width+'x'+height+'.png',await page.screenshot());
  }
  await page.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  await click('Measurements'); await page.waitFor(`document.querySelector('dialog[open] [aria-label="Live measurements"]')`);
  assert.equal(await page.evaluate(`document.querySelectorAll('[aria-label="Live measurements"] dl>div').length`),6);
  await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
  await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
  await page.waitFor(`!document.querySelector('dialog[open]')`);
  assert.equal(await page.evaluate('document.activeElement.textContent.trim()'),'Measurements','Escape restores opener focus');
  await click('Event log'); await page.waitFor(`document.querySelector('[aria-label="Developer event log"]')`);
  await page.evaluate(`window.__originalBlobURL=URL.createObjectURL;URL.createObjectURL=blob=>{window.__diagnosticBlob=blob;return window.__originalBlobURL(blob)}`);
  await click('Download JSON');const report=await page.evaluate(`window.__diagnosticBlob.text().then(JSON.parse)`);
  assert.equal(report.schemaVersion,2);assert.equal(report.practice.goal,5);assert.equal(report.practice.elapsedMs,0);
  assert.ok(report.appVersion&&report.startedAt&&report.exportedAt);assert.ok(!JSON.stringify(report).includes('landmarks'));
  await page.evaluate(`{const select=document.querySelector('[aria-label="Event type"]');select.value='error';select.dispatchEvent(new Event('change',{bubbles:true}))}`);
  assert.ok(await page.evaluate(`[...document.querySelectorAll('[aria-label="Scrollable event history"] li')].every(li=>li.dataset.category==='error')`));
  await click('Clear logs');await page.waitFor(`document.querySelector('[aria-label="Developer event log"]').innerText.includes('0 / 500 retained')`);
  await page.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  writeFileSync(output+'/guide-logs-mobile.png',await page.screenshot());
  assert.ok(await page.evaluate(`(() => { const r=document.querySelector('dialog').getBoundingClientRect();return r.bottom<=innerHeight&&Math.abs(r.left+r.width/2-innerWidth/2)<2&&Math.abs(r.top+r.height/2-innerHeight/2)<2 })()`), 'overlay is centred in both axes');
  assert.equal(await page.evaluate(`document.querySelector('[aria-label=\"Scrollable event history\"] pre')`),null,'log rows contain no raw JSON');
  // Tab navigation remains inside the modal and its contents may scroll independently.
  for(let i=0;i<10;i++) {await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});assert.ok(await page.evaluate(`!document.activeElement||document.activeElement===document.body||document.querySelector('dialog').contains(document.activeElement)`));}
  await closeOverlay();
  await page.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.ok(await page.evaluate(`[...document.querySelectorAll('[aria-label="Practice guide"] svg g')].every(g=>getComputedStyle(g).animationName==='none')`));
  await page.send('Emulation.setEmulatedMedia',{features:[]});
  await page.evaluate(`window.__denyCamera()`);
  await page.waitFor(`document.querySelector('[aria-label="Camera and skeleton"] button')?.textContent==='Allow camera'`);
  assert.equal(await page.evaluate('location.pathname'),'/test');
  assert.equal(await page.evaluate('window.__cameraRequests'),1);
  await page.evaluate(`window.__cameraBehavior='hold';document.querySelector('[aria-label="Camera and skeleton"] button').click()`);
  await page.waitFor(`window.__cameraRequests===2&&!document.querySelector('[aria-label="Camera and skeleton"] button')`);
  await page.evaluate(`window.__denyCamera()`);await page.waitFor(`document.querySelector('[aria-label="Camera and skeleton"] button')`);
  await page.evaluate(`window.__cameraBehavior='synthetic';document.querySelector('[aria-label="Camera and skeleton"] button').click()`);
  await page.waitFor(`document.querySelector('video')?.srcObject&&document.querySelector('video').readyState>=2`);
  assert.equal(await page.evaluate('window.__cameraRequests'),3);
  assert.deepEqual(await page.evaluate('window.__playerStorageAccess'),[]);
  await page.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  writeFileSync(output+'/guide-camera.png',await page.screenshot());
  await page.goto(base + '/play');
  await page.waitFor(`location.pathname==='/play' && window.__lane?.ready`, { timeoutMs: 90000 });
  assert.equal(await page.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Allow camera').disabled`), false);
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
  console.log('Scope browser checks passed: Guide Mode three-panel layout, eight device sizes with no page scroll, overlays, focus/Escape, two toolbar buttons, real metrics and log export/filter/clear, camera retry/synthetic stream, game flow. Runtime tests cover automatic pose progression; physical webcam and device FPS excluded.');
} finally { await page.close(); await browser.close(); }
process.exit(0);
