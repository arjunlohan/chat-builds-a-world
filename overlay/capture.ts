import "./capture.css";
const root=document.querySelector<HTMLElement>("#capture")!;
function resize(){root.style.transform=`scale(${Math.min(innerWidth/1920,innerHeight/1080)})`;}
resize();window.addEventListener("resize",resize);
