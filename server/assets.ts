import { build } from "esbuild";

export async function buildClient() {
  const result = await build({
    entryPoints: { world: "world/main.ts", overlay: "overlay/main.ts", history: "world/history.ts" },
    bundle: true, outdir: "dist/assets", format: "esm", platform: "browser",
    target: "es2022", write: false,
    plugins: [{ name: "shared-three", setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: "/assets/three.js", external: true })); } }],
  });
  const three = await build({ stdin: { contents: 'export * from "three";', resolveDir: process.cwd() }, bundle: true, format: "esm", platform: "browser", target: "es2022", write: false });
  const assets = new Map(result.outputFiles.map(file => [file.path.split("/").at(-1)!, file.contents]));
  assets.set("three.js", three.outputFiles[0]!.contents); return assets;
}
