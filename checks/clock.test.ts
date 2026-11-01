import test from 'node:test';import assert from 'node:assert/strict';
import {SimulationClock} from '../world/engine/clock.js';import {PerspectiveCamera,Box3} from 'three';
import {CameraDirector} from '../world/engine/camera-director.js';import {capturePath} from '../world/engine/capture-path.js';
import {pipelinePasses} from '../world/engine/render-pipeline.js';import {PRODUCTION_PROFILE} from '../world/engine/render-profile.js';
test('one bounded clock anchors timestamps without separate subsystem capture clocks',()=>{
 const clock=new SimulationClock(1000);clock.advance(.01);clock.anchor(2000);assert.equal(clock.now(),2000);clock.advance(2);assert.equal(clock.now(),2050);assert.ok(Math.abs(clock.seconds-.06)<1e-9);clock.advance(NaN);assert.equal(clock.now(),2050);clock.reset(50);assert.equal(clock.seconds,0);assert.equal(clock.now(),50);
});
test('ingress maps server ages and parade delays into the simulation time domain',()=>{
 const clock=new SimulationClock(1000),state={id:'x',displayName:'X',color:'#ffffff',home:[0,2,0] as const,lastActive:9000,speech:'hello',speechAt:9500,command:{kind:'jump'} as const,commandAt:9900,entry:{from:[0,2,0] as const,at:9800,delay:300}};
 const mapped=clock.citizen(state,10000);assert.equal(clock.now()-mapped.commandAt,100);assert.equal(clock.now()-mapped.lastActive,1000);assert.equal(clock.now()-mapped.speechAt,500);assert.equal(mapped.entry!.at+mapped.entry!.delay-clock.now(),100);assert.equal(state.commandAt,9900);
});
test('fixed capture and director share the exported establishing pose',()=>{
 const camera=new PerspectiveCamera(38,16/9,.1,300),capture=new PerspectiveCamera(38,16/9,.1,300);new CameraDirector(camera,true);capturePath(capture,'fixed',0,new Box3());assert.ok(camera.position.distanceTo(capture.position)<1e-9);assert.ok(camera.quaternion.angleTo(capture.quaternion)<1e-7);
});
test('visibility uses the live factory chain while cost excludes post processing',()=>{
 assert.deepEqual(pipelinePasses(PRODUCTION_PROFILE),['main','gtao','emissive-bloom','output']);assert.deepEqual(pipelinePasses(PRODUCTION_PROFILE,true),['main','output']);assert.deepEqual(pipelinePasses({...PRODUCTION_PROFILE,look:'classic'}),['main','bloom','output']);
});

test('only the scene target is multisampled and post targets do not allocate depth',async()=>{
 const {worldPipeline}=await import('../world/engine/render-pipeline.js');const {Scene,Vector2}=await import('three');const gl={RENDERBUFFER:1,RGBA16F:2,SAMPLES:3,getInternalformatParameter:()=>new Int32Array([4])};
 const renderer={getContext:()=>gl,getPixelRatio:()=>1,getSize:(v:InstanceType<typeof Vector2>)=>v.set(1920,1080)} as unknown as import('three').WebGLRenderer;
 const pipeline=worldPipeline(renderer,new Scene(),new PerspectiveCamera(),PRODUCTION_PROFILE);assert.deepEqual(pipeline.samples,{scene:4,post:0,normal:0});assert.equal(pipeline.composer.renderTarget1.depthBuffer,false);assert.equal(pipeline.composer.renderTarget2.depthBuffer,false);assert.equal(pipeline.composer.renderTarget1.resolveDepthBuffer,false);pipeline.dispose();
});

test('offline GPU completion yields until the fence signals and always releases it',async()=>{
 const {captureFence}=await import('../world/engine/gpu-fence.js');let polls=0,deleted=0,flushed=0;const gl={SYNC_GPU_COMMANDS_COMPLETE:1,ALREADY_SIGNALED:2,CONDITION_SATISFIED:3,WAIT_FAILED:4,fenceSync:()=>({}),flush(){flushed++;},clientWaitSync(){return ++polls<3?0:3;},isContextLost:()=>false,deleteSync(){deleted++;}} as unknown as WebGL2RenderingContext;await captureFence(gl);assert.equal(polls,3);assert.equal(deleted,1);assert.equal(flushed,1);
 const lost={...gl,clientWaitSync:()=>4};await assert.rejects(captureFence(lost as WebGL2RenderingContext),/context lost/);assert.equal(deleted,2);
});

test('live and measurement share a simulation-time shadow cadence with immediate scene/root invalidation',async()=>{
 const {ShadowClock,SHADOW_REFRESH_SECONDS}=await import('../world/engine/shadow-clock.js'),s=new ShadowClock();assert.equal(s.update(0,false),true);assert.equal(s.update(.1,false),false);assert.equal(s.update(SHADOW_REFRESH_SECONDS,false),true);assert.equal(s.update(.26,false),false);assert.equal(s.update(.27,false,false),true);assert.equal(s.update(.28,false,false),false);assert.equal(s.update(.29,true,false),true);assert.equal(s.update(.30,false,true),true);
});
