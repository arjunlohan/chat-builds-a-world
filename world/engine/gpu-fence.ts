/** Offline-only completion barrier. Keep normal presentation asynchronous. */
export async function captureFence(gl:WebGL2RenderingContext){
 const fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);if(!fence)throw new Error('Capture GPU fence failed');gl.flush();const started=performance.now();
 try{for(;;){const status=gl.clientWaitSync(fence,0,0);if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED)return;if(status===gl.WAIT_FAILED||gl.isContextLost())throw new Error('Capture graphics context lost');if(performance.now()-started>10000)throw new Error('Capture GPU did not finish');await new Promise(r=>setTimeout(r,1));}}finally{gl.deleteSync(fence);}
}
