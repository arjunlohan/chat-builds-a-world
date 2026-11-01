/** Match live and checker shadow work; keep dynamic props fresh without redrawing static scans every frame. */
export const SHADOW_REFRESH_SECONDS=.25;
export class ShadowClock {
 private next=0;private visible=true;
 update(time:number,dirty:boolean,visible=true){const changed=visible!==this.visible;this.visible=visible;if(!dirty&&!changed&&time<this.next)return false;this.next=time+SHADOW_REFRESH_SECONDS;return true;}
}
