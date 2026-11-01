import type {HistoryCredits} from "../server/versions/credits.js";
const SCROLL_PIXELS_PER_SECOND=40,MIN_ROLL_MS=8000;
/** Text-only credits: the final line stays on screen until playback is replayed. */
export function historyCredits(root:HTMLElement){
 let animation:Animation|undefined;
 const window=document.createElement("div"),roll=document.createElement("div"),heading=document.createElement("h2");
 heading.className="eyebrow";heading.textContent="CONTRIBUTORS";window.className="credits-window";window.tabIndex=0;window.setAttribute("role","region");window.setAttribute("aria-label","Contributor credits list");roll.className="credits-roll";
 window.append(roll);root.append(heading,window);
 function hide(){animation?.cancel();animation=undefined;root.hidden=true;}
 return {hide,show(credits:HistoryCredits){
  hide();if(!credits.entries.length)return;
  const list=document.createElement("ol");list.className="credits-list";
  for(const entry of credits.entries){
   const row=document.createElement("li"),version=document.createElement("span"),copy=document.createElement("div"),title=document.createElement("h3"),requester=document.createElement("p");
   version.className="credits-version";version.textContent=`v${entry.version}`;title.textContent=entry.title;requester.textContent=`Requested by @${entry.requester}`;
   copy.append(title,requester);row.append(version,copy);list.append(row);
  }
  const closing=document.createElement("p");closing.className="credits-closing";closing.textContent=`Built live by ${credits.viewers} ${credits.viewers===1?"viewer":"viewers"} · coded by Codex`;
  roll.replaceChildren(list,closing);root.hidden=false;window.scrollTop=0;
  if(!matchMedia("(prefers-reduced-motion: reduce)").matches){
   const start=window.clientHeight,end=Math.min((start-roll.scrollHeight)/2,start-roll.scrollHeight),distance=start-end;
   animation=roll.animate([{transform:`translateY(${start}px)`},{transform:`translateY(${end}px)`}],{duration:Math.max(MIN_ROLL_MS,1000*distance/SCROLL_PIXELS_PER_SECOND),easing:"linear",fill:"forwards"});
  }
 }};
}
