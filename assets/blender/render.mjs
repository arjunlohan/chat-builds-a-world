import {spawn} from "node:child_process";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {join} from "node:path";
const directory=fileURLToPath(new URL(".",import.meta.url));
const names=["laugh","hype","love","w","l","gg","f","dance","nervous","sleepy","rage","sarcasm","dog-carrot","worm-takeover"],args=process.argv.slice(2).filter(v=>v!=="--");
const preview=args.includes("--preview"),encodeOnly=args.includes("--encode-only"),positional=args.filter(v=>!v.startsWith("--"));
if(args.includes("--help")){console.log(`pnpm demo:render [${names.join("|")}|cheer-burst] [--preview] [--encode-only]\nBlender renders PNG + alpha MOV; ffmpeg encodes the committed alpha WebM. BLENDER_BIN / FFMPEG_BIN override binaries.`);process.exit(0);}
if(positional.length>1||positional.some(v=>!names.includes(v)&&v!=="cheer-burst")||args.some(v=>v.startsWith("--")&&!["--preview","--encode-only"].includes(v)))throw new Error("Unknown clip/options. See --help.");
function run(bin,command,capture=false){return new Promise((resolve,reject)=>{let tail="";const chunks=[];let length=0;const child=spawn(bin,command,{stdio:["ignore","pipe","pipe"],shell:false});const collect=chunk=>{const text=String(chunk);tail=(tail+text).slice(-5000);for(const line of text.split("\n"))if(line.startsWith("DEMO "))console.log(line);};child.stdout.on("data",chunk=>{if(capture){length+=chunk.length;if(length>8*1024*1024){child.kill("SIGKILL");reject(new Error("Alpha probe output exceeded limit"));}else chunks.push(chunk);}else collect(chunk);});child.stderr.on("data",collect);child.once("error",reject);child.once("close",code=>code===0?resolve(capture?Buffer.concat(chunks):undefined):reject(new Error(`${bin} exited ${code}\n${tail}`)));});}
for(const name of positional.length?positional:names){
 const source=name==="hype"?"cheer-burst":name,started=Date.now();
 const output=fileURLToPath(new URL(`../renders/${source}`,import.meta.url));
 if(!encodeOnly)await run(process.env.BLENDER_BIN||"blender",["-b","--factory-startup","--python-exit-code","1","-P",join(directory,`${source}.py`),"--","--output",output,...(preview?["--preview"]:[])]);
 const path=join(output,preview?"preview":""),result=JSON.parse(await readFile(join(path,"render.json"),"utf8"));
 if(result.status!=="passed"||Object.values(result.endpoints).some(f=>f.visiblePixels))throw new Error("Endpoint alpha assertion missing or failed.");
 const destination=preview?join(path,`${name}.webm`):fileURLToPath(new URL(`../reactions/${name==="cheer-burst"?"hype":name}.webm`,import.meta.url));
 await mkdir(fileURLToPath(new URL("../reactions",import.meta.url)),{recursive:true});
 const encodeStarted=Date.now();
 let bytes=Infinity,crf=36;
 const {stat}=await import("node:fs/promises");
 for(crf of [36,42,48]){
  await run(process.env.FFMPEG_BIN||"/opt/homebrew/bin/ffmpeg",["-y","-framerate",String(result.fps),"-i",join(path,"frames/frame_%04d.png"),"-c:v","libvpx-vp9","-pix_fmt","yuva420p","-b:v","0","-crf",String(crf),"-cpu-used","4","-row-mt","1","-auto-alt-ref","0","-force_key_frames",`expr:eq(n,${result.frames-1})`,"-an",destination]);
  bytes=(await stat(destination)).size;if(bytes<=2*1024*1024)break;
 }
 if(bytes>2*1024*1024)throw new Error(`${name}: asset exceeds 2 MiB runner inventory limit`);
 const alpha=await run(process.env.FFMPEG_BIN||"/opt/homebrew/bin/ffmpeg",["-v","error","-c:v","libvpx-vp9","-i",destination,"-vf",`select='eq(n,0)+eq(n,${result.frames-1})',alphaextract`,"-fps_mode","passthrough","-frames:v","2","-f","rawvideo","-pix_fmt","gray","pipe:1"],true);
 if(alpha.length!==2*result.width*result.height||alpha.some(value=>value!==0))throw new Error(`${name}: encoded WebM endpoint alpha is not zero`);
 result.webm={encodedEndpointsZero:true,file:destination,bytes,crf,encodeSeconds:((Date.now()-encodeStarted)/1000)};
 await writeFile(join(path,"webm.json"),JSON.stringify(result,null,2)+"\n");
 console.log(`${name}: ${bytes} bytes; ${((Date.now()-started)/1000).toFixed(2)}s invocation; first/last alpha ${result.endpoints.first.coveragePercent}/${result.endpoints.last.coveragePercent}%`);
}
