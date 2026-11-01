import {chromium,type Page} from '@playwright/test';
/** WebGL remains GPU accelerated; software compositing removes one-bit cross-surface alpha rounding. */
export const captureBrowser=()=>chromium.launch({headless:true,args:[...(process.platform==='darwin'?['--use-angle=metal','--enable-gpu']:[]),'--disable-gpu-compositing']});
export async function captureEncoder(page:Page){
 const session=await page.context().newCDPSession(page);
 return async()=>{await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));const result=await session.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false,optimizeForSpeed:true,clip:{x:0,y:0,width:1920,height:1080,scale:2}});return Buffer.from(result.data,'base64');};
}
