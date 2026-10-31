import ts from "typescript-api";
import { readFile } from "node:fs/promises";
import { resolve, dirname, relative, posix } from "node:path";
import { build } from "esbuild";
import { THREE_IMPORTS } from "./imports.js";
const vetted = new Set(THREE_IMPORTS);
const denied = new Set("window document globalThis self global process require fetch XMLHttpRequest WebSocket Worker navigator location eval Function setTimeout setInterval requestAnimationFrame queueMicrotask Promise performance Date console importScripts Reflect Proxy".split(" "));
export function inspectModule(source: string, file: string) {
  if (Buffer.byteLength(source) > 65536) throw new Error("Module source exceeds 64 KiB.");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  for (const statement of ast.statements) {
    if (ts.isImportDeclaration(statement)) {
      const from = (statement.moduleSpecifier as ts.StringLiteral).text;
      if (from === "three") {
        const bindings = statement.importClause?.namedBindings;
        if (statement.importClause?.name || !bindings || !ts.isNamedImports(bindings) || bindings.elements.some(e => !vetted.has((e.propertyName ?? e.name).text))) throw new Error(`Only vetted named Three.js imports are allowed: ${THREE_IMPORTS.join(", ")}.`);
      } else if (!statement.importClause?.isTypeOnly || !["world/engine/api.js", "world/engine/api.ts"].includes(posix.normalize(posix.join(posix.dirname(file), from)))) throw new Error("Only API type imports and vetted Three.js imports are allowed.");
    } else if (ts.isVariableStatement(statement)) {
      for (const item of statement.declarationList.declarations) if (item.initializer && !ts.isArrowFunction(item.initializer) && !ts.isFunctionExpression(item.initializer) && !ts.isLiteralExpression(item.initializer)) throw new Error("Top-level side effects are forbidden.");
    } else if (!ts.isFunctionDeclaration(statement) && !ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement) && !ts.isExportAssignment(statement)) throw new Error("Unsupported top-level module statement.");
    if (ts.isExportAssignment(statement) && !ts.isIdentifier(statement.expression) && !ts.isArrowFunction(statement.expression) && !ts.isFunctionExpression(statement.expression)) throw new Error("Default export must be a factory.");
  }
  function visit(node: ts.Node) {
    if (ts.isNewExpression(node) && /Geometry$|Material$|BufferAttribute$|^(Float32|Float64|Uint8|Uint16|Uint32|Int8|Int16|Int32)Array$/.test(node.expression.getText(ast))) {
      for (let parent = node.parent; parent; parent = parent.parent) {
        if ((ts.isMethodDeclaration(parent) || ts.isPropertyAssignment(parent)) && parent.name?.getText(ast) === "update") throw new Error("Per-frame geometry/material/buffer creation is forbidden.");
      }
    }
    if (ts.isIdentifier(node) && (denied.has(node.text) || ["constructor", "__proto__", "prototype", "parent", "onBeforeRender", "onAfterRender", "onBeforeCompile", "addEventListener", "removeEventListener"].includes(node.text))) throw new Error(`Forbidden module capability: ${node.text}`);
    if (node.kind === ts.SyntaxKind.AnyKeyword || (ts.isElementAccessExpression(node) && !ts.isNumericLiteral(node.argumentExpression) && !ts.isIdentifier(node.argumentExpression))) throw new Error("Unchecked types and dynamic property access are forbidden.");
    if (ts.isStringLiteral(node) && ["constructor", "__proto__", "prototype", "parent", "onBeforeRender", "onAfterRender", "onBeforeCompile", "addEventListener", "removeEventListener"].includes(node.text)) throw new Error("Forbidden property indirection.");
    if (ts.isAwaitExpression(node) || node.kind === ts.SyntaxKind.AsyncKeyword || (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)) throw new Error("Modules must be synchronous; no dynamic imports.");
    if (ts.isStringLiteral(node) && /https?:\/\/|wss?:\/\/|file:\/\//i.test(node.text)) throw new Error("External references are forbidden.");
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
export async function compileModule(root: string, file: string, id: string, nodeModules: string, files: readonly string[] = [file]) {
  const path = resolve(root, file); if (!relative(root, path).startsWith("world/modules/")) throw new Error("Invalid entrypoint.");
  for (const name of files) inspectModule(await readFile(resolve(root, name), "utf8"), name);
  const result = await build({ entryPoints: [path], bundle: true, format: "esm", platform: "browser", target: "es2022", write: false,
    nodePaths: [nodeModules], plugins: [{ name: "shared-three", setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: "/assets/three.js", external: true })); } }] });
  const code = result.outputFiles[0]!.text;
  // Type check the candidate against the locked API without installing worktree dependencies.
  const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, resolveJsonModule: true, esModuleInterop: true, noEmit: true, skipLibCheck: true, types: ["node"], typeRoots: [resolve(nodeModules, "@types")], baseUrl: dirname(nodeModules), paths: { "*": [resolve(nodeModules, "*")], "three": [resolve(nodeModules, "@types/three/index.d.ts")], "three/addons/*": [resolve(nodeModules, "@types/three/examples/jsm/*")] } };
  const program = ts.createProgram(files.map(file => resolve(root, file)), options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) throw new Error(`Candidate TypeScript check failed: ${ts.flattenDiagnosticMessageText(diagnostics[0]!.messageText, " ").slice(0, 120)}`);
  return { id, code };
}
