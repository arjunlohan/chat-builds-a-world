import { Color, PerspectiveCamera, Scene, WebGLRenderer } from "three";

/** Phase 1 canvas only. TODO: island, water, terrain, sky, light and instancing. */
export function createRenderer(canvas: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new Scene();
  scene.background = new Color("#0d1928");
  const camera = new PerspectiveCamera(45, 16 / 9, 0.1, 500);
  camera.position.set(0, 4, 10);
  camera.lookAt(0, 0, 0);
  const resize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };
  window.addEventListener("resize", resize);
  resize();
  return {
    renderer, scene, camera,
    dispose() {
      window.removeEventListener("resize", resize);
      renderer.dispose();
    },
  };
}
