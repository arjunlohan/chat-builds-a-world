/** Compare identical camera/time renders with and without the candidate. Occluded/transparent geometry contributes nothing. */
export const VISIBILITY_PROBE = Object.freeze({ width: 192, height: 108, hdWidth: 1920, hdHeight: 1080, minPixels: 4096, minWidth: 64, minHeight: 64, channelDifference: 12 });
export interface Footprint { probePixels: number; hdPixels: number; hdWidth: number; hdHeight: number; probeWidth: number; probeHeight: number; qualifies: boolean }
export function contributionFootprint(withModule: Uint8Array, withoutModule: Uint8Array, width: number, height: number): Footprint {
  let count=0,minX=width,maxX=-1,minY=height,maxY=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;
    if(Math.max(Math.abs(withModule[i]!-withoutModule[i]!),Math.abs(withModule[i+1]!-withoutModule[i+1]!),Math.abs(withModule[i+2]!-withoutModule[i+2]!))<VISIBILITY_PROBE.channelDifference)continue;
    count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
  }
  const sx=VISIBILITY_PROBE.hdWidth/width,sy=VISIBILITY_PROBE.hdHeight/height,hdPixels=count*sx*sy,hdWidth=count?(maxX-minX+1)*sx:0,hdHeight=count?(maxY-minY+1)*sy:0;
  return {probePixels:count,hdPixels,hdWidth,hdHeight,probeWidth:width,probeHeight:height,qualifies:hdPixels>=VISIBILITY_PROBE.minPixels&&hdWidth>=VISIBILITY_PROBE.minWidth&&hdHeight>=VISIBILITY_PROBE.minHeight};
}
