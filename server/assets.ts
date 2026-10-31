import { build } from "esbuild";

export async function buildClient() {
  const result = await build({
    entryPoints: { world: "world/main.ts", overlay: "overlay/main.ts" },
    bundle: true, outdir: "dist/assets", format: "esm", platform: "browser",
    target: "es2022", write: false,
  });
  return new Map(result.outputFiles.map(file => [file.path.split("/").at(-1)!, file.contents]));
}
