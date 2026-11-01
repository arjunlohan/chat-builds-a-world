import type {WebGLRenderer} from 'three';
/** Debug-only GPU measurement. No readback or timing query runs in the normal frame loop. */
export async function measureRender(renderer:WebGLRenderer,render:()=>void,frames:number){
 if(!Number.isSafeInteger(frames)||frames<1||frames>60)throw new Error('Use 1-60 render samples');
 const gl=renderer.getContext() as WebGL2RenderingContext,ext=gl.getExtension('EXT_disjoint_timer_query_webgl2') as {TIME_ELAPSED_EXT:number;GPU_DISJOINT_EXT:number}|null;
 if(!ext)throw new Error('GPU timer queries are unavailable on this graphics driver');
 const queries:WebGLQuery[]=[],start=performance.now();
 try{
  for(let i=0;i<frames;i++){const query=gl.createQuery();if(!query)throw new Error('GPU query allocation failed');queries.push(query);gl.beginQuery(ext.TIME_ELAPSED_EXT,query);try{render();}finally{gl.endQuery(ext.TIME_ELAPSED_EXT);}}
  const submitMs=(performance.now()-start)/frames;
  while(!gl.getQueryParameter(queries.at(-1)!,gl.QUERY_RESULT_AVAILABLE)){if(performance.now()-start>5000)throw new Error('GPU timing did not complete');await new Promise(r=>setTimeout(r,10));}
  if(gl.getParameter(ext.GPU_DISJOINT_EXT))throw new Error('GPU clock was disjoint during measurement');
  const samples=queries.map(q=>Number(gl.getQueryParameter(q,gl.QUERY_RESULT))/1e6).sort((a,b)=>a-b);
  return {frames,kind:'gpu-timer' as const,frameMs:samples.reduce((n,x)=>n+x,0)/samples.length,p95Ms:samples[Math.ceil(samples.length*.95)-1]!,cpuSubmitMs:submitMs};
 }finally{for(const query of queries)gl.deleteQuery(query);renderer.setRenderTarget(null);}
}
