import "./capture.css";
const root=document.querySelector<HTMLElement>("#capture")!;
function resize(){root.style.transform=`scale(${Math.min(innerWidth/1920,innerHeight/1080)})`;}
resize();window.addEventListener("resize",resize);

const query=new URLSearchParams(location.search);
for(const frame of document.querySelectorAll<HTMLIFrameElement>('iframe')){const url=new URL(frame.src);for(const key of ['look','resolution','aa']){const value=query.get(key);if(value)url.searchParams.set(key,value);}frame.src=url.pathname+url.search;}
