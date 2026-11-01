import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chromium} from '@playwright/test';
import {GateBrowser} from '../server/runner/gate-browser.js';

test('server gate browser retains its profile but disposes every candidate page and restarts after reset',async()=>{
 const pool=new GateBrowser();
 try{
  const [first,concurrent]=await Promise.all([pool.prepare(),pool.prepare()]);assert.equal(first.endpoint,concurrent.endpoint);assert.ok(first.port>0);
  const browser=await chromium.connectOverCDP(first.endpoint),context=browser.contexts()[0]!;
  const page=await context.newPage();await page.evaluate('window.__candidateState="old candidate"');const session=await context.newCDPSession(page),target=(await session.send('Target.getTargetInfo')).targetInfo.targetId;await session.detach();
  const closed=page.waitForEvent('close');await pool.release();await closed;assert.equal(context.pages().length,0);assert.equal((await pool.prepare()).endpoint,first.endpoint);
  const fresh=await context.newPage();assert.equal(await fresh.evaluate('window.__candidateState'),undefined);const nextSession=await context.newCDPSession(fresh);assert.notEqual((await nextSession.send('Target.getTargetInfo')).targetInfo.targetId,target);await nextSession.detach();
  await pool.reset();assert.equal(browser.isConnected(),false);const second=await pool.prepare();assert.notEqual(second.endpoint,first.endpoint);

 }finally{await pool.close();}
 await assert.rejects(()=>pool.prepare(),/closing/);
});
