import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Synthetic isolated browser storage; collection UI only, not the WebGL editor.
const vite=await createServer({server:{host:'127.0.0.1',port:5223,strictPort:true},logLevel:'error'});
let browser;
try {
  await vite.listen();
  browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:402,height:874},deviceScaleFactor:2});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5223/review/?fixtures=1');
  await page.locator('[data-settings]').click();
  const fixed=page.locator('[data-fixed-roll-length]');await fixed.waitFor();
  assert.equal(await fixed.isChecked(),false);await fixed.check();
  await page.waitForFunction(()=>!document.querySelector('[data-fixed-roll-length]').disabled);
  await page.click('[data-close-settings]');await page.reload();
  await page.locator('[data-settings]').click();await page.waitForFunction(()=>!document.querySelector('[data-fixed-roll-length]').disabled);
  assert.equal(await fixed.isChecked(),true);await page.click('[data-close-settings]');
  await page.click('[data-new-mix]');await page.locator('[data-roll]').first().waitFor();
  await page.locator('[data-roll]').nth(0).click();await page.locator('[data-roll]').nth(1).click();
  assert.equal(await page.locator('[data-roll][aria-pressed=true]').count(),2);
  assert.equal(await page.locator('.selected-strip').count(),2);
  const remove=page.getByRole('button',{name:'Remove roll I',exact:true});const rect=await remove.boundingBox();assert.ok(rect.width>=44&&rect.height>=44);
  const mix=page.locator('[data-start-mix]');assert.ok(await mix.isEnabled());
  const geometry=await page.evaluate(()=>{const r=e=>{const a=e.getBoundingClientRect();return {top:a.top,bottom:a.bottom,left:a.left,right:a.right};};return {strip:r(document.querySelector('.selected-strips')),mix:r(document.querySelector('[data-start-mix]')),dock:r(document.querySelector('.home-navigation'))};});
  assert.ok(geometry.strip.bottom<=geometry.mix.top+1&&geometry.mix.bottom<=geometry.dock.top+1,JSON.stringify(geometry));
  await remove.click();assert.equal(await page.locator('[data-roll][aria-pressed=true]').count(),1);assert.equal(await mix.isDisabled(),true);
  assert.deepEqual(errors,[]);console.log('PASS: settings persistence, selection strips, removal targets and composer layout');
} finally {await browser?.close();await vite.close();}
