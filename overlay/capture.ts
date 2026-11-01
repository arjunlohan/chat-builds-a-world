import type {} from "../world/engine/capture.js";
import "./capture.css";
const root=document.querySelector<HTMLElement>("#capture")!;
function resize(){const scale=Math.min(innerWidth/1920,innerHeight/1080);root.style.transform=scale===1?"none":`scale(${scale})`;}
resize();window.addEventListener("resize",resize);

const query=new URLSearchParams(location.search);
for(const frame of document.querySelectorAll<HTMLIFrameElement>('iframe')){const url=new URL(frame.dataset.page??frame.src,location.href);for(const key of ['look','resolution','aa','capture','seed','path','module','version','take','time']){const value=query.get(key);if(value)url.searchParams.set(key,value);}frame.src=url.pathname+url.search;}

if(query.get('capture')==='1'){
 let frame=0,time=0;
 const ready=(async()=>{const end=performance.now()+60000;for(const iframe of document.querySelectorAll<HTMLIFrameElement>('iframe')){while(!iframe.contentWindow?.__capture){if(performance.now()>end)throw new Error('Capture pages did not initialize');await new Promise(r=>setTimeout(r,25));}await iframe.contentWindow.__capture.ready;}})();
 window.__capture={ready,get frame(){return frame;},get time(){return time;},async step(dt){await ready;for(const iframe of document.querySelectorAll<HTMLIFrameElement>('iframe'))await iframe.contentWindow!.__capture!.step(dt);frame++;time+=dt;}};
}
