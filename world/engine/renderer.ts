import { contributionFootprint, VISIBILITY_PROBE } from "./visibility.js";
import { PRODUCTION_PROFILE, type RenderProfile } from "./render-profile.js";
import { SUMMON_POOL, modulePool, emptyUsage, RenderFailure } from "../shared/limits.js";
import type { WorldVersion } from "../../server/versions/index.js";
import type { WorldModuleFactory } from "./api.js";
import { isChatCommand, hasPhysicalReaction } from "../../server/commands.js";
import {
  ACESFilmicToneMapping, Group, PCFSoftShadowMap, PerspectiveCamera, Raycaster,
  Scene, SRGBColorSpace, HalfFloatType, Vector2, WebGLRenderer, WebGLRenderTarget,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { CameraDirector } from "./camera-director.js";
import { createTerrain } from "./terrain.js";
import { createGarden } from "./garden.js";
import { createWater, createMotes } from "./water.js";
import { createSky } from "./sky.js";
import { createEffects } from "./effects.js";
import { createRaidPortal } from "./raid-portal.js";
import { FrameStats } from "./stats.js";
import { ModuleHost, type ModuleStatus } from "./module-host.js";
import { ResourceLedger, ResourceOwner } from "./resources.js";
import { LabelManager } from "./labels.js";
import { Citizens } from "./citizens.js";
import { connectWorld } from "./transport.js";
import { SpecMaterializer } from "./spec-materializer.js";
import { log } from "./log.js";

export interface RendererOptions {
  playback?: boolean;
  profile?: Readonly<RenderProfile>;
  probeId?: string;
  fixedTime?: number;
  labels?: HTMLElement;
  onReply?: (message: string) => void;
  onConnection?: (connected: boolean) => void;
  onStatus?: (status: ModuleStatus) => void;
  onReady?: () => void;
  onFrame?: (fps: number, average: number, phase: number, citizens: number) => void;
  onError?: (message: string) => void;
}

/** Fixed OBS framebuffer; CSS fits it into any viewport without extra DPR work. */
export function createRenderer(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
  const profile = options.profile ?? PRODUCTION_PROFILE;
  let shadowDirty = true;
  const clientId = crypto.randomUUID();
  const post = (url: string, data: object) => { if(options.playback)return;void fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, clientId }) }).catch(() => {}); };
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.info.autoReset = false;
  renderer.setSize(profile.width, profile.height, false);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = profile.shadows;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  const scene = new Scene();
  const environment = new Group();
  scene.add(environment);
  const camera = new PerspectiveCamera(38, 16 / 9, 0.1, 300);
  const director = new CameraDirector(camera, reducedMotion.matches);
  const terrain = createTerrain();
  const garden = createGarden();
  const water = createWater();
  const motes = createMotes();
  const sky = createSky(scene, options.fixedTime);
  const effects = createEffects();
  const labelLayer = options.labels ?? document.createElement("div");
  const labelManager = new LabelManager();
  const citizens = new Citizens(labelLayer, labelManager);
  const raidPortal=createRaidPortal(labelLayer,labelManager);
  const resizeLabels = new ResizeObserver(entries => {
    labelLayer.style.transform = `scale(${entries[0]!.contentRect.width / 1920})`;
  });
  resizeLabels.observe(canvas);
  environment.add(terrain, garden, water.root, motes.root, sky.root, effects.root, raidPortal.root, citizens.root);

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new Vector2(profile.width / 2, profile.height / 2), 0.38, 0.65, 1.05);
  const output = new OutputPass();
  composer.addPass(renderPass);
  if (profile.bloom) composer.addPass(bloom);
  composer.addPass(output);
  composer.setSize(profile.width, profile.height);
  bloom.setSize(profile.width / 2, profile.height / 2);


  const engineResources = new ResourceOwner();
  const base = engineResources.audit(environment);
  const ledger = new ResourceLedger(emptyUsage(), modulePool(base));
  const summonLedger = new ResourceLedger(emptyUsage(), SUMMON_POOL);
  const moduleRoot = new Group();
  moduleRoot.name = "world modules";
  scene.add(moduleRoot);
  const ack = (state: import("../../server/contracts.js").SummonState, error?: string) => {
    post("/summon/ack", { id: state.id, receipt: state.receipt, ...(error ? { error } : {}) });
  };
  const materializerOptions = { root: scene, layout: labelManager, labels: labelLayer, onSceneChange: () => { shadowDirty = true; },
    effects: { play: effects.play }, camera: { focus: director.focus }, citizens: citizens.services };
  const materializer = new SpecMaterializer({ ...materializerOptions, ledger: summonLedger, onVisible: state => ack(state) });
  const moduleMaterializer = new SpecMaterializer({ ...materializerOptions, ledger });
  const hostOptions: ConstructorParameters<typeof ModuleHost>[0] = {
    ...(profile.probe?{onWork:(id:string,ms:number)=>{if(id===options.probeId)stats.value.moduleMs=ms;},onHook:(id:string,hook:string)=>{if(id===options.probeId&&hook==="onChat")stats.value.moduleChats++;},onFocus:(id:string)=>{if(id===options.probeId)stats.value.moduleFocuses++;}}:{}),
    root: moduleRoot, ledger, onSceneChange: () => { shadowDirty = true; }, protectedResources: engineResources,
    services: { citizens: citizens.services, spawnSpec: spec => moduleMaterializer.spawn(spec), camera: { focus: director.focus }, effects: { play: effects.play }, log },
    onStatus: (event: ModuleStatus) => {
      options.onStatus?.(event);
      if (event.state === "disabled" || event.state === "rejected") {
        stats.value.moduleError = `${event.id}: ${event.reason}`;
        if (event.state === "disabled" && !pendingAck && !staging && activeVersion) post("/modules/fault", { version: activeVersion.version, receipt: activeVersion.receipt });
      }
    },
  };
  const host = new ModuleHost(hostOptions);
  let staging=false;
  let pendingAck: { version: WorldVersion; frames: number; celebrate: boolean } | null = null;
  let activeVersion: WorldVersion | null = null;
  const moduleReceipt = (version: WorldVersion, ok: boolean) => post("/modules/ack", { version: version.version, receipt: version.receipt, ok });
  const probe = profile.probe ? {
    target: new WebGLRenderTarget(VISIBILITY_PROBE.width,VISIBILITY_PROBE.height),
    hdr: new WebGLRenderTarget(VISIBILITY_PROBE.width,VISIBILITY_PROBE.height,{type:HalfFloatType}),
    withPixels: new Uint8Array(VISIBILITY_PROBE.width*VISIBILITY_PROBE.height*4),
    withoutPixels: new Uint8Array(VISIBILITY_PROBE.width*VISIBILITY_PROBE.height*4),
    capture(pixels: Uint8Array) {
      renderer.setRenderTarget(this.hdr);renderer.render(scene,camera);output.render(renderer,this.target,this.hdr,0,false);
      renderer.readRenderTargetPixels(this.target,0,0,VISIBILITY_PROBE.width,VISIBILITY_PROBE.height,pixels);
    },
  } : undefined;
  let activation = 0;
  async function activate(version: WorldVersion | null, celebrate=false) {
    const generation = ++activation; shadowDirty = true;
    try {
      const oldHashes=new Map(activeVersion?.modules.map(m=>[m.id,m.hash])??[]);
      const changed=(version?.modules??[]).filter(m=>oldHashes.get(m.id)!==m.hash||!host.ids.includes(m.id));
      const factories = await Promise.all(changed.map(async module => {
        if (!/^\/modules\/[a-f0-9]{64}\.js$/.test(module.url)) throw new Error("Invalid module asset");
        const loaded = await import(/* @vite-ignore */ module.url) as { default: WorldModuleFactory };
        return { factory: loaded.default, id: module.id };
      }));
      if (generation !== activation) return;
      const candidate = new ModuleHost({ ...hostOptions, root:new Group() });
      stats.value.moduleError = "";staging=true;
      try{
        for(const item of factories)if(!candidate.load(item.factory))throw new Error("Module activation rejected");
        if(candidate.activeCount!==factories.length||factories.some(item=>!candidate.ids.includes(item.id)))throw new Error("Module IDs did not match manifest");
        host.adopt(candidate,version?.modules.map(m=>m.id)??[]);
      }finally{candidate.dispose();staging=false;}
      stats.value.moduleVersion = version?.version ?? 0; stats.value.moduleCount = host.activeCount; stats.value.moduleSwaps++;
      const isNew=celebrate && !!version && version.version>(activeVersion?.version??0);
      activeVersion = version; pendingAck = version ? { version, frames: 0, celebrate: isNew && !version.restoredFrom } : null;
    } catch {
      if (version) moduleReceipt(version, false);
    }
  }
  const stats = new FrameStats(profile.probe?2048:0);
  if(stats.trace)window.__worldFrameTrace=stats.trace;
  window.__worldStats = stats.value;
  let elapsed = 0, disposed = false, ready = false, frameId = 0, uiTime = 0;
  let serverOffset = 0;
  const disconnect = options.playback ? () => {} : connectWorld(event => {
    serverOffset = event.now - Date.now();
    switch (event.type) {
    case "snapshot": {
      post("/modules/budget",{base});
      void activate(event.version);
      citizens.sync(event.citizens, event.now); stats.value.raidCount = event.raids;
      if(event.arrival)raidPortal.open(event.arrival.raid.broadcasterName,event.arrival.admitted,event.arrival.raid.viewerCount,elapsed-(event.now-event.arrival.at)/1000);
      for (const failure of materializer.sync(event.summons)) ack(failure.state, failure.code);
      break; }
    case "version": void activate(event.version,true); break;
    case "chat": {
      const spawned = citizens.upsert(event.citizen, event.now);
      if (spawned) {
        host.onCitizenSpawn(spawned);
        effects.play("spawn", spawned.position);
        director.notice(spawned.position, 0);
      }
      host.onChat(event.chat);
      if (isChatCommand(event.chat.text) && !hasPhysicalReaction(event.chat.text)) {
        const citizen = citizens.services.get(event.citizen.id);
        if (citizen && !reducedMotion.matches) { effects.play("sparkle", citizen.position); stats.value.commandReactions++; }
      }
      if (/^!(jump|dance)$/i.test(event.chat.text.trim())) {
        const citizen = citizens.services.get(event.citizen.id);
        if (citizen) director.notice(citizen.position, 1);
      }
      break; }
    case "remove": citizens.remove(event.ids);break;
    case "raid": {
      stats.value.raidCount++;effects.play("portal",raidPortal.root.position);raidPortal.open(event.raid.broadcasterName,event.citizens.length,event.raid.viewerCount,elapsed);
      for(const state of event.citizens){const spawned=citizens.upsert(state,event.now);if(spawned)host.onCitizenSpawn(spawned);}
      director.focus(raidPortal.root.position,{priority:2,duration:2.8});host.onRaid(event.raid);break;
    }
    case "summon": {
      try { materializer.spawn(event.summon.spec, event.summon); stats.value.summonFocuses++; }
      catch (error) { ack(event.summon, error instanceof RenderFailure ? error.code : "render-error"); }
      break; }
    case "summon-remove": for (const id of event.ids) materializer.remove(id); break;
    case "reply": options.onReply?.(event.message); break;
    }
    stats.value.summonCount = materializer.count;
    // Pause/skip/clear controls are broadcast for later lanes, not arbitrary module code.
    stats.value.citizenCount = citizens.count;
  }, connected => options.onConnection?.(connected), clientId);

  function frame(now: number) {
    if (disposed || document.hidden) return;
    const realDt = stats.sample(now);
    const dt = Math.min(0.05, realDt);
    elapsed += dt;
    // Reduced motion keeps composition still but retains rendered, measurable frames.
    const visualTime = reducedMotion.matches ? 0 : elapsed;
    try {
      stats.value.citizenCount=citizens.count;
      renderer.info.reset();
      const cpuStart = performance.now();
      sky.update(visualTime);
      water.update(visualTime, sky.day);
      motes.update(visualTime, 1 - sky.day);
      effects.update(elapsed);stats.value.raidPortalActive=raidPortal.update(elapsed,reducedMotion.matches);
      if(!profile.probe||!stats.value.measureCameraLocked)director.update(dt);
      citizens.update(dt, elapsed, Date.now() + serverOffset, camera, reducedMotion.matches);
      materializer.update(dt, camera, reducedMotion.matches); moduleMaterializer.update(dt, camera, reducedMotion.matches);
      labelManager.update(Date.now() + serverOffset, camera, director.focusPoint);
      stats.value.cameraFocuses = director.automaticFocuses;
      stats.value.moduleMs=0;host.update(dt);
      if (pendingAck) {
        if (stats.value.moduleError) { moduleReceipt(pendingAck.version, false); pendingAck = null; }
        else if (++pendingAck.frames >= 8) { moduleReceipt(pendingAck.version, true); if(pendingAck.celebrate&&!reducedMotion.matches)effects.celebrate(); pendingAck = null; }
      }
      if (shadowDirty) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
      materializer.beforeRender(camera);
      const renderStart = performance.now(); stats.value.updateMs = renderStart - cpuStart;
      composer.render(dt);
      stats.value.renderMs = performance.now() - renderStart; stats.value.triangles = renderer.info.render.triangles;
      materializer.rendered(camera);
      const probeStart=probe?performance.now():0;
      if (probe && options.probeId && stats.value.probeRequest>stats.value.probeCompleted) {
        const roots=host.visualRoots(options.probeId),visible=roots.map(root=>root.visible),toScreen=output.renderToScreen;
        try {
          output.renderToScreen=false;
          probe.capture(probe.withPixels);
          for(const root of roots)root.visible=false;
          probe.capture(probe.withoutPixels);
          const footprint=contributionFootprint(probe.withPixels,probe.withoutPixels,VISIBILITY_PROBE.width,VISIBILITY_PROBE.height);
          stats.value.modulePixels=footprint.hdPixels;stats.value.moduleProbePixels=footprint.probePixels;stats.value.moduleWidth=footprint.hdWidth;stats.value.moduleHeight=footprint.hdHeight;
          stats.value.probeCompleted=stats.value.probeRequest;
        }finally{output.renderToScreen=toScreen;for(let i=0;i<roots.length;i++)roots[i]!.visible=visible[i]!;renderer.setRenderTarget(null);}
      }
      if(stats.trace)stats.recordWork(performance.now()-probeStart);
      if (!ready) { ready = true; options.onReady?.(); }
      if (now - uiTime >= 250) {
        uiTime = now;
        options.onFrame?.(stats.value.fps, stats.value.avgFps, sky.phase, citizens.count);
      }
    } catch {
      options.onError?.("The world paused after a rendering error. Reload to try again.");
      return;
    }
    frameId = requestAnimationFrame(frame);
  }
  function visibility() {
    host.setPaused(document.hidden);
    stats.resetClock();
    cancelAnimationFrame(frameId);
    if (!document.hidden && !disposed) frameId = requestAnimationFrame(frame);
  }
  const raycaster = new Raycaster(), pointer = new Vector2();
  function explore(event: PointerEvent) {
    if (event.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(terrain.children)[0];
    if (!hit || hit.point.y < 0) return;
    director.focus(hit.point, { duration: 2.8, priority: 3 });
    effects.play("sparkle", hit.point);
  }
  function contextLost(event: Event) {
    event.preventDefault();
    cancelAnimationFrame(frameId);
    options.onError?.("Graphics connection lost. Reload to restore the world.");
  }
  document.addEventListener("visibilitychange", visibility);
  canvas.addEventListener("pointerup", explore);
  canvas.addEventListener("webglcontextlost", contextLost);
  host.setPaused(document.hidden);
  if (!document.hidden) frameId = requestAnimationFrame(frame);

  return {
    renderer, scene, camera, director, setVersion: activate, get host(){return host;}, citizens, materializer, stats: stats.value, baseUsage: base,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frameId);
      document.removeEventListener("visibilitychange", visibility);
      canvas.removeEventListener("pointerup", explore);
      canvas.removeEventListener("webglcontextlost", contextLost);
      disconnect(); resizeLabels.disconnect(); citizens.dispose(); raidPortal.dispose(); labelManager.dispose();
      host.dispose(); materializer.dispose(); moduleMaterializer.dispose();
      engineResources.dispose(environment);
      probe?.target.dispose();probe?.hdr.dispose();
      bloom.dispose(); output.dispose(); renderPass.dispose(); composer.dispose(); renderer.dispose();
    },
  };
}
