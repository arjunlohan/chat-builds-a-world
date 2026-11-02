export const DAY_CYCLE_SECONDS=600;
export const SKY_PHASES=Object.freeze({dawn:.04,day:.47,golden:.87,dusk:.92,night:.97});
const CLASSIC_PHASES=Object.freeze({dawn:.25,day:.5,golden:.7,dusk:.75,night:0});
export function skyPreset(name:string,classic=false){return (classic?CLASSIC_PHASES:SKY_PHASES)[name as keyof typeof SKY_PHASES];}
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export interface SkyLighting {day:number;warmth:number;sun:readonly[number,number,number]}
/** 86% daylight, 8% dawn/dusk transition, 6% constant moonlit blue hour. */
export function skyCycle(phase:number):SkyLighting{
 const p=((phase%1)+1)%1,u=Math.max(0,Math.min(1,(p-.04)/.86));let elevation=5+60*Math.sin(u*Math.PI);
 if(p<.04)elevation=-6+11*smooth(0,.04,p);else if(p>.9)elevation=p<.94?5-11*smooth(.9,.94,p):-6;
 const day=smooth(-5,3,elevation),warmth=(1-smooth(7,38,elevation))*day;
 if(day===0){const length=Math.hypot(-.45,.38,.8);return {day,warmth,sun:[-.45/length,.38/length,.8/length]};}
 const a=-1.65+u*2.2,e=elevation*Math.PI/180;return {day,warmth,sun:[Math.sin(a)*Math.cos(e),Math.sin(e),Math.cos(a)*Math.cos(e)]};
}
export const ENVIRONMENT_EPSILON=Object.freeze({day:.06,warmth:.08,sunRadians:.08});
export function environmentChanged(a:SkyLighting|undefined,b:SkyLighting){return !a||Math.abs(a.day-b.day)>=ENVIRONMENT_EPSILON.day||Math.abs(a.warmth-b.warmth)>=ENVIRONMENT_EPSILON.warmth||a.sun.reduce((n,x,i)=>n+x*b.sun[i]!,0)<Math.cos(ENVIRONMENT_EPSILON.sunRadians);}
/** Low sun warms direct light and the horizon while overhead/cloud illumination stays neutral. */
export const GOLDEN_LIGHT=Object.freeze({skyTintMix:.12,fogTintMix:.18,hemisphereFill:.16,environmentFill:.18,sunReduction:.4,sunTintMix:.48});
