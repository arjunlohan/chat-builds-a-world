import { Ajv2020 } from "ajv/dist/2020.js";
import standalone from "ajv/dist/standalone/index.js";
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import schema from "../server/summon/scene-spec.schema.json";
import { withoutNumericLimits } from "../server/summon/schema-structure.js";

const ajv = new Ajv2020({ strict: true, allErrors: true, code: { source: true, esm: true } });
const structural = withoutNumericLimits(schema) as typeof schema;
structural.$id += ":structure";
ajv.addSchema(schema); ajv.addSchema(structural);
const code = standalone(ajv, { validateSceneData: schema.$id, validateSceneStructure: structural.$id });
const result = await build({ stdin: { contents: code, loader: "js", resolveDir: process.cwd() }, bundle: true, write: false, format: "esm", platform: "browser", minify: true });
const generated = "// @ts-nocheck\n// Generated from the canonical Scene Spec schema by checks/generate-validator.ts. No runtime eval.\n" + result.outputFiles[0]!.text;
const path = "world/engine/scene-validators.generated.ts";
if (process.argv.includes("--check")) {
  if (await readFile(path, "utf8") !== generated) throw new Error("Scene validators are stale; run pnpm exec tsx checks/generate-validator.ts");
} else await writeFile(path, generated);
