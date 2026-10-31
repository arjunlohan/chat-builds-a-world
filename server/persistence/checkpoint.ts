import {readJson,atomicJson} from "./atomic.js";
/** One write and a dirty bit. Continuous bursts reset the trailing debounce. */
export class Checkpoint<T>{
 private dirty=false;private writing:Promise<void>|undefined;private timer:ReturnType<typeof setTimeout>|undefined;
 savedAt=0;
 constructor(private path:string,private capture:()=>T,private onError:(error:unknown)=>void=()=>{},private debounceMs=1500){}
 async load():Promise<T|undefined>{try{const saved=await readJson<{format:number;savedAt:number;value:T}>(this.path);if(saved===undefined)return;if(saved.format!==1||saved.value===undefined)throw new Error("Unsupported checkpoint format");this.savedAt=saved.savedAt;return saved.value;}catch{throw new Error("Saved world checkpoint is invalid; restore state/ before starting.");}}
 changed(){this.dirty=true;if(this.timer)clearTimeout(this.timer);this.timer=setTimeout(()=>{this.timer=undefined;void this.flush().catch(this.onError);},this.debounceMs);}
 async flush(){if(this.timer){clearTimeout(this.timer);this.timer=undefined;}if(!this.dirty&&!this.writing)return;if(!this.writing)this.writing=(async()=>{while(this.dirty){this.dirty=false;try{const savedAt=Date.now();await atomicJson(this.path,{format:1,savedAt,value:this.capture()});this.savedAt=savedAt;}catch(error){this.dirty=true;throw error;}}})().finally(()=>{this.writing=undefined;});return this.writing;}
 async close(){await this.flush();}
}
