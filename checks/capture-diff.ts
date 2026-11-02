/** Same-machine capture tolerance: bounded one-byte GPU rounding, never large or widespread changes. */
export const CAPTURE_TOLERANCE=Object.freeze({maxChannelDelta:1,maxDifferingRatio:.005});
export function captureDifference(a:Uint8Array,b:Uint8Array,width:number,height:number){
 const pixels=width*height;if(a.length!==pixels*4||b.length!==a.length)throw new Error('Capture dimensions differ');
 let maxChannelDelta=0,differingPixels=0;
 for(let i=0;i<a.length;i+=4){let changed=false;for(let c=0;c<4;c++){const delta=Math.abs(a[i+c]!-b[i+c]!);maxChannelDelta=Math.max(maxChannelDelta,delta);changed ||= delta!==0;}if(changed)differingPixels++;}
 const maxDifferingPixels=Math.floor(pixels*CAPTURE_TOLERANCE.maxDifferingRatio);
 return {ok:maxChannelDelta<=CAPTURE_TOLERANCE.maxChannelDelta&&differingPixels<=maxDifferingPixels,maxChannelDelta,differingPixels,maxDifferingPixels,differingRatio:differingPixels/pixels};
}
