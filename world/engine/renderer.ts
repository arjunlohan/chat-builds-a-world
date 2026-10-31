import { isChatCommand, hasPhysicalReaction } from "../../server/commands.js";
import {
  ACESFilmicToneMapping, Group, PCFSoftShadowMap, PerspectiveCamera, Raycaster,
  Scene, SRGBColorSpace, Vector2, WebGLRenderer,
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
import { FrameStats } from "./stats.js";
import { ModuleHost, type ModuleStatus } from "./module-host.js";
import { ResourceLedger, ResourceOwner } from "./resources.js";
import { LabelManager } from "./labels.js";
import { Citizens } from "./citizens.js";
import { connectWorld } from "./transport.js";
import { SpecMaterializer } from "./spec-materializer.js";
import { log } from "./log.js";

export interface RendererOptions {
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
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.setSize(1920, 1080, false);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
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
  const resizeLabels = new ResizeObserver(entries => {
    labelLayer.style.transform = `scale(${entries[0]!.contentRect.width / 1920})`;
  });
  resizeLabels.observe(canvas);
  environment.add(terrain, garden, water.root, motes.root, sky.root, effects.root, citizens.root);

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new Vector2(960, 540), 0.38, 0.65, 1.05);
  const output = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(output);
  composer.setSize(1920, 1080);
  // Bloom's expensive blur chain runs at half size; primary scene stays full HD.
  bloom.setSize(960, 540);

  const engineResources = new ResourceOwner();
  const base = engineResources.audit(environment);
  const ledger = new ResourceLedger(base);
  const moduleRoot = new Group();
  moduleRoot.name = "world modules";
  scene.add(moduleRoot);
  const ack = (state: import("../../server/contracts.js").SummonState, error?: string) => {
    void fetch("/summon/ack", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: state.id, receipt: state.receipt, ...(error ? { error } : {}) }) }).catch(() => {});
  };
  const materializer = new SpecMaterializer({ root: scene, ledger, layout: labelManager, labels: labelLayer,
    effects: { play: effects.play }, camera: { focus: director.focus }, citizens: citizens.services, onVisible: state => ack(state) });
  const host = new ModuleHost({
    root: moduleRoot, ledger, protectedResources: engineResources,
    services: { citizens: citizens.services, spawnSpec: spec => materializer.spawn(spec), camera: { focus: director.focus }, effects: { play: effects.play }, log },
    ...(options.onStatus ? { onStatus: options.onStatus } : {}),
  });
  const stats = new FrameStats();
  window.__worldStats = stats.value;
  let elapsed = 0, disposed = false, ready = false, frameId = 0, uiTime = 0;
  let serverOffset = 0;
  const disconnect = connectWorld(event => {
    serverOffset = event.now - Date.now();
    if (event.type === "snapshot") {
      citizens.sync(event.citizens, event.now); stats.value.raidCount = event.raids;
      for (const summon of materializer.sync(event.summons)) ack(summon, "capacity");
    } else if (event.type === "chat") {
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
    } else if (event.type === "remove") citizens.remove(event.ids);
    else if (event.type === "raid") { stats.value.raidCount++; host.onRaid(event.raid); }
    else if (event.type === "summon") {
      try { materializer.spawn(event.summon.spec, event.summon); stats.value.summonFocuses++; }
      catch { ack(event.summon, "capacity"); }
    } else if (event.type === "summon-remove") { for (const id of event.ids) materializer.remove(id); }
    else if (event.type === "reply") options.onReply?.(event.message);
    stats.value.summonCount = materializer.count;
    // Pause/skip/clear controls are broadcast for later lanes, not arbitrary module code.
    stats.value.citizenCount = citizens.count;
  }, connected => options.onConnection?.(connected));

  function frame(now: number) {
    if (disposed || document.hidden) return;
    const realDt = stats.sample(now);
    const dt = Math.min(0.05, realDt);
    elapsed += dt;
    // Reduced motion keeps composition still but retains rendered, measurable frames.
    const visualTime = reducedMotion.matches ? 0 : elapsed;
    try {
      sky.update(visualTime);
      water.update(visualTime, sky.day);
      motes.update(visualTime, 1 - sky.day);
      effects.update(elapsed);
      director.update(dt);
      citizens.update(dt, elapsed, Date.now() + serverOffset, camera, reducedMotion.matches);
      materializer.update(dt, camera, reducedMotion.matches);
      labelManager.update(Date.now() + serverOffset, camera, director.focusPoint);
      stats.value.cameraFocuses = director.automaticFocuses;
      host.update(dt);
      if (host.activeCount || ((citizens.count > 0 || materializer.count > 0) && stats.value.frame % 2 === 0)) renderer.shadowMap.needsUpdate = true;
      materializer.beforeRender(camera);
      composer.render(dt);
      materializer.rendered(camera);
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
    renderer, scene, camera, director, host, citizens, materializer, stats: stats.value, baseUsage: base,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frameId);
      document.removeEventListener("visibilitychange", visibility);
      canvas.removeEventListener("pointerup", explore);
      canvas.removeEventListener("webglcontextlost", contextLost);
      disconnect(); resizeLabels.disconnect(); citizens.dispose(); labelManager.dispose();
      host.dispose(); materializer.dispose();
      engineResources.dispose(environment);
      bloom.dispose(); output.dispose(); renderPass.dispose(); composer.dispose(); renderer.dispose();
    },
  };
}
