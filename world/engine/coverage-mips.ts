import type {Texture} from 'three';
/** Retain thin-leaf coverage without reducing the normally filtered alpha. */
export function alphaCoverage(pixels:Uint8ClampedArray,cutoff:number){let count=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]!/255>=cutoff)count++;return count/(pixels.length/4);}
export function preserveAlphaCoverage(pixels:Uint8ClampedArray,cutoff:number,target:number){
 if(target<=0||target>=1)return;const histogram=new Uint32Array(256);for(let i=3;i<pixels.length;i+=4)histogram[pixels[i]!]!++;
 const wanted=target*pixels.length/4;let count=0,boundary=255,best=Infinity;
 for(let alpha=255;alpha>0;alpha--){count+=histogram[alpha]!;const error=Math.abs(count-wanted);if(error<best){best=error;boundary=alpha;}}
 const scale=Math.max(1,Math.min(4,(cutoff*255+.5)/boundary));for(let i=3;i<pixels.length;i+=4)pixels[i]=Math.min(255,Math.round(pixels[i]!*scale));
}
const prepared=new WeakSet<Texture>();
/** One immutable mip chain per bank texture, shared by all vegetation instances. */
export function coverageMips(texture:Texture,cutoff:number){
 if(prepared.has(texture))return;const image=texture.image as CanvasImageSource&{width:number;height:number};if(!image?.width||!image.height)throw new Error('Cutout image is not decoded');
 const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d',{willReadFrequently:true})!;context.drawImage(image,0,0);const target=alphaCoverage(context.getImageData(0,0,canvas.width,canvas.height).data,cutoff);
 const mipmaps:HTMLCanvasElement[]=[canvas];let width=image.width,height=image.height,previous=canvas;
 while(width>1||height>1){width=Math.max(1,width>>1);height=Math.max(1,height>>1);const mip=document.createElement('canvas');mip.width=width;mip.height=height;const ctx=mip.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(previous,0,0,width,height);previous=mip;const data=ctx.getImageData(0,0,width,height);preserveAlphaCoverage(data.data,cutoff,target);const adjusted=document.createElement('canvas');adjusted.width=width;adjusted.height=height;adjusted.getContext('2d')!.putImageData(data,0,0);mipmaps.push(adjusted);}
 // Canvas mip uploads need explicit pixel-store orientation, unlike ImageBitmap uploads.
 texture.image=canvas;texture.mipmaps=mipmaps;texture.generateMipmaps=false;texture.needsUpdate=true;prepared.add(texture);
}
