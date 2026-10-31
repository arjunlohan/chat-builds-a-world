import type { WorldVersion } from "../../server/versions/index.js";
import type { WorldModuleFactory } from "./api.js";
import { isChatCommand, hasPhysicalReaction } from "../../server/commands.js";
import {
  ACESFilmicToneMapping, Group, PCFSoftShadowMap, PerspectiveCamera, Raycaster,
  Scene, SRGBColorSpace, Vector2, WebGLRenderer, Mesh, MeshStandardMaterial, MeshBasicMaterial, WebGLRenderTarget, HemisphereLight, Color, DepthTexture, UnsignedIntType, Matrix4,
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
  checkMode?: boolean;
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
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.setSize(1920, 1080, false);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !options.checkMode;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  const scene = new Scene();
  const environment = new Group();
  scene.add(environment);
  const camera = new PerspectiveCamera(38, 16 / 9, 0.1, 300);
  const director = new CameraDirector(camera, reducedMotion.matches || !!options.checkMode);
  const terrain = createTerrain();
  const garden = createGarden();
  const water = createWater();
  const motes = createMotes();
  const sky = createSky(scene, options.fixedTime);
  const effects = createEffects();
  const labelLayer = options.labels ?? document.createElement("div");
  if (options.checkMode) labelLayer.style.display = "none";
  const labelManager = new LabelManager();
  const citizens = new Citizens(labelLayer, labelManager, !!options.checkMode);
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

  const replacedMaterials: MeshStandardMaterial[] = [];
  if (options.checkMode) environment.traverse(object => {
    if (object instanceof Mesh && object.material instanceof MeshStandardMaterial) {
      const original = object.material; replacedMaterials.push(original);
      object.material = new MeshBasicMaterial({ color: original.color, vertexColors: original.vertexColors, transparent: original.transparent, opacity: original.opacity, side: original.side });
    }
  });
  const cacheTarget = new WebGLRenderTarget(1920, 1080);
  cacheTarget.depthTexture = new DepthTexture(1920, 1080, UnsignedIntType);
  let cacheFramebuffer: WebGLFramebuffer | null = null;
  const cachedCamera = new Matrix4(); let cacheReady = false;
  if (options.checkMode) scene.add(new HemisphereLight("#ffffff", "#97b9b0", 2));
  const engineResources = new ResourceOwner();
  const base = engineResources.audit(environment);
  base.triangles += citizens.triangleReserve;
  const ledger = new ResourceLedger(base);
  let moduleRoot = new Group();
  moduleRoot.name = "world modules";
  scene.add(moduleRoot);
  const ack = (state: import("../../server/contracts.js").SummonState, error?: string) => {
    void fetch("/summon/ack", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: state.id, receipt: state.receipt, ...(error ? { error } : {}) }) }).catch(() => {});
  };
  const materializer = new SpecMaterializer({ root: scene, ledger, layout: labelManager, labels: labelLayer,
    effects: { play: effects.play }, camera: { focus: director.focus }, citizens: citizens.services, onVisible: state => ack(state) });
  const hostOptions: ConstructorParameters<typeof ModuleHost>[0] = {
    root: moduleRoot, ledger, protectedResources: engineResources,
    services: { citizens: citizens.services, spawnSpec: spec => materializer.spawn(spec), camera: { focus: director.focus }, effects: { play: effects.play }, log },
    onStatus: (event: ModuleStatus) => {
      options.onStatus?.(event);
      if (event.state === "disabled" || event.state === "rejected") {
        stats.value.moduleError = `${event.id}: ${event.reason}`;
        if (event.state === "disabled" && !pendingAck && activeVersion) void fetch("/modules/fault", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: activeVersion.version, receipt: activeVersion.receipt }) }).catch(() => {});
      }
    },
  };
  let host = new ModuleHost(hostOptions);
  let pendingAck: { version: WorldVersion; frames: number } | null = null;
  let activeVersion: WorldVersion | null = null;
  const moduleReceipt = (version: WorldVersion, ok: boolean) => void fetch("/modules/ack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: version.version, receipt: version.receipt, ok }) }).catch(() => {});
  const probeScene = new Scene(); probeScene.background = new Color("#000000");
  probeScene.add(new HemisphereLight("#ffffff", "#ffffff", 3));
  const probeTarget = new WebGLRenderTarget(96, 54), probePixels = new Uint8Array(96 * 54 * 4);
  let lastProbe = -1;
  let activation = 0;
  async function activate(version: WorldVersion | null) {
    const generation = ++activation;
    try {
      const factories = await Promise.all((version?.modules ?? []).map(async module => {
        if (!/^\/modules\/[a-f0-9]{64}\.js$/.test(module.url)) throw new Error("Invalid module asset");
        const loaded = await import(/* @vite-ignore */ module.url) as { default: WorldModuleFactory };
        return { factory: loaded.default, id: module.id };
      }));
      if (generation !== activation) return;
      const root = new Group(), candidate = new ModuleHost({ ...hostOptions, root });
      stats.value.moduleError = "";
      for (const item of factories) if (!candidate.load(item.factory)) { candidate.dispose(); throw new Error("Module activation rejected"); }
      if (candidate.activeCount !== factories.length || factories.some(item => !candidate.ids.includes(item.id))) { candidate.dispose(); throw new Error("Module IDs did not match manifest"); }
      host.dispose(); scene.remove(moduleRoot); moduleRoot = root; scene.add(root); host = candidate;
      stats.value.moduleVersion = version?.version ?? 0; stats.value.moduleCount = factories.length; stats.value.moduleSwaps++;
      activeVersion = version; pendingAck = version ? { version, frames: 0 } : null;
    } catch {
      if (version) moduleReceipt(version, false);
    }
  }
  const stats = new FrameStats();
  window.__worldStats = stats.value;
  let elapsed = 0, disposed = false, ready = false, frameId = 0, uiTime = 0;
  let serverOffset = 0;
  const disconnect = connectWorld(event => {
    serverOffset = event.now - Date.now();
    if (event.type === "snapshot") {
      void activate(event.version);
      citizens.sync(event.citizens, event.now); stats.value.raidCount = event.raids;
      for (const summon of materializer.sync(event.summons)) ack(summon, "capacity");
    } else if (event.type === "version") { void activate(event.version);
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
      const cpuStart = performance.now();
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
      if (pendingAck) {
        if (stats.value.moduleError) { moduleReceipt(pendingAck.version, false); pendingAck = null; }
        else if (++pendingAck.frames >= 8) { moduleReceipt(pendingAck.version, true); pendingAck = null; }
      }
      if (host.activeCount || ((citizens.count > 0 || materializer.count > 0) && stats.value.frame % 2 === 0)) renderer.shadowMap.needsUpdate = true;
      materializer.beforeRender(camera);
      const renderStart = performance.now(); stats.value.updateMs = renderStart - cpuStart;
      if (options.checkMode) {
        const staticRoots = environment.children.filter(root => root !== citizens.root && root !== effects.root);
        camera.updateMatrixWorld();
        const refreshed = !cacheReady || !cachedCamera.equals(camera.matrixWorld);
        if (refreshed) {
          stats.value.cacheRenders++;
          for (const root of staticRoots) root.visible = true;
          const citizenVisible = citizens.root.visible; citizens.root.visible = false; moduleRoot.visible = false;
          renderer.setRenderTarget(cacheTarget); renderer.render(scene, camera);
          cacheFramebuffer = renderer.getContext().getParameter(renderer.getContext().FRAMEBUFFER_BINDING) as WebGLFramebuffer;
          renderer.setRenderTarget(null);
          citizens.root.visible = citizenVisible; moduleRoot.visible = true; cachedCamera.copy(camera.matrixWorld); cacheReady = true;
        }
        for (const root of staticRoots) root.visible = false;
        const gl = renderer.getContext() as WebGL2RenderingContext;
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, cacheFramebuffer); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
        gl.blitFramebuffer(0, 0, 1920, 1080, 0, 0, 1920, 1080, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); renderer.resetState();
        renderer.autoClear = false; renderer.render(scene, camera); renderer.autoClear = true;
      } else composer.render(dt);
      stats.value.renderMs = performance.now() - renderStart; stats.value.triangles = renderer.info.render.triangles;
      materializer.rendered(camera);
      if (options.checkMode && options.probeId && elapsed - lastProbe > 0.75 && stats.value.moduleCount) {
        lastProbe = elapsed;
        const roots = host.visualRoots(options.probeId), parents = roots.map(root => root.parent);
        for (const root of roots) probeScene.add(root);
        renderer.setRenderTarget(probeTarget); renderer.render(probeScene, camera);
        renderer.readRenderTargetPixels(probeTarget, 0, 0, 96, 54, probePixels);
        let lit = 0; for (let i = 0; i < probePixels.length; i += 4) if (probePixels[i]! + probePixels[i+1]! + probePixels[i+2]! > 24) lit++;
        stats.value.modulePixels = lit;
        for (let i = 0; i < roots.length; i++) { roots[i]!.removeFromParent(); parents[i]?.add(roots[i]!); }
        renderer.setRenderTarget(null);
      }
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
      engineResources.dispose(environment); for (const material of replacedMaterials) material.dispose();
      cacheTarget.dispose();
      probeTarget.dispose();
      bloom.dispose(); output.dispose(); renderPass.dispose(); composer.dispose(); renderer.dispose();
    },
  };
}
