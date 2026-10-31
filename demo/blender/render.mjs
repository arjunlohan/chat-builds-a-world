import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {join} from "node:path";
const directory=fileURLToPath(new URL(".",import.meta.url));
const names=["dog-carrot","worm-takeover","cheer-burst"],args=process.argv.slice(2).filter(v=>v!=="--");
if(args.includes("--help")){console.log("pnpm demo:render [dog-carrot|worm-takeover|cheer-burst] [--preview]\nNo name renders all three. BLENDER_BIN overrides blender. No provider calls.");process.exit(0);}
const preview=args.includes("--preview"),positional=args.filter(v=>v!=="--preview");
if(positional.length>1||positional.some(v=>!names.includes(v))){console.error("Unknown clip/options. Run pnpm demo:render --help.");process.exit(1);}
for(const name of positional.length?positional:names){
 const started=Date.now(),bin=process.env.BLENDER_BIN||"blender";
 const command=["-b","--factory-startup","--python-exit-code","1","-P",join(directory,`${name}.py`),"--","--output",fileURLToPath(new URL(`../renders/${name}`,import.meta.url)),...(preview?["--preview"]:[])];
 console.log(`Rendering ${name}${preview?" preview":""} with ${bin}`);
 await new Promise((resolve,reject)=>{
  let tail="",buffer="";const child=spawn(bin,command,{stdio:["ignore","pipe","pipe"],shell:false});
  const collect=chunk=>{const value=String(chunk);tail=(tail+value).slice(-12000);buffer+=value;let i;while((i=buffer.indexOf("\n"))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(line.startsWith("DEMO "))console.log(line);}};
  child.stdout.on("data",collect);child.stderr.on("data",collect);
  child.once("error",e=>reject(new Error(`Cannot start Blender. Install it or set BLENDER_BIN. ${e.message}`)));
  child.once("close",code=>code===0?resolve():reject(new Error(`Blender exited ${code}\n${tail}`)));
 }).catch(error=>{console.error(error.message);process.exit(1);});
 console.log(`${name}: ${((Date.now()-started)/1000).toFixed(2)} s total`);
}
