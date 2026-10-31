import {readFile} from "node:fs/promises";
import {atomicJson} from "./atomic.js";
/** At most one write plus one dirty bit, even during a chat burst. */
export class Checkpoint<T>{
 private dirty=false;private writing:Promise<void>|undefined;private timer:ReturnType<typeof setTimeout>|undefined;
 constructor(private path:string,private capture:()=>T,private onError:(error:unknown)=>void=()=>{}){}
 async load():Promise<T|undefined>{try{const saved=JSON.parse(await readFile(this.path,"utf8")) as {format:number;value:T};if(saved.format!==1)throw new Error("Unsupported checkpoint format");return saved.value;}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return;throw new Error("Saved world checkpoint is invalid; restore state/ before starting.");}}
 changed(){this.dirty=true;if(!this.timer)this.timer=setTimeout(()=>{this.timer=undefined;void this.flush().catch(this.onError);},100);}
 async flush(){if(this.timer){clearTimeout(this.timer);this.timer=undefined;}if(!this.writing)this.writing=(async()=>{while(this.dirty){this.dirty=false;try{await atomicJson(this.path,{format:1,savedAt:Date.now(),value:this.capture()});}catch(error){this.dirty=true;throw error;}}})().finally(()=>{this.writing=undefined;});return this.writing;}
 async close(){if(this.timer)clearTimeout(this.timer);this.timer=undefined;await this.flush();}
}
