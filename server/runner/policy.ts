import ts from "typescript-api";
import { readFile } from "node:fs/promises";
import { resolve, dirname, relative, posix } from "node:path";
import { build } from "esbuild";
import { THREE_IMPORTS } from "./imports.js";
import {DENIED_GLOBALS,DENIED_PROPERTIES,POLICY_LIMITS,POLICY_RULES} from "./policy-rules.js";
import {CandidateCodeError} from "./verdict.js";
const vetted = new Set(THREE_IMPORTS);
const denied = new Set(DENIED_GLOBALS);
export function inspectModule(source: string, file: string) {
  if (Buffer.byteLength(source) > POLICY_LIMITS.sourceBytes) throw new CandidateCodeError(`Module source exceeds ${POLICY_LIMITS.sourceBytes} bytes.`);
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  for (const statement of ast.statements) {
    if (ts.isImportDeclaration(statement)) {
      const from = (statement.moduleSpecifier as ts.StringLiteral).text;
      if (from === "three") {
        const bindings = statement.importClause?.namedBindings;
        if (statement.importClause?.name || !bindings || !ts.isNamedImports(bindings) || bindings.elements.some(e => !vetted.has((e.propertyName ?? e.name).text))) throw new CandidateCodeError(`Only vetted named Three.js imports are allowed: ${THREE_IMPORTS.join(", ")}.`);
      } else if (!statement.importClause?.isTypeOnly || !["world/engine/api.js", "world/engine/api.ts"].includes(posix.normalize(posix.join(posix.dirname(file), from)))) throw new CandidateCodeError("Only API type imports and vetted Three.js imports are allowed.");
    } else if (ts.isVariableStatement(statement)) {
      for (const item of statement.declarationList.declarations) if (item.initializer && !ts.isArrowFunction(item.initializer) && !ts.isFunctionExpression(item.initializer) && !ts.isLiteralExpression(item.initializer)) throw new CandidateCodeError("Top-level side effects are forbidden.");
    } else if (!ts.isFunctionDeclaration(statement) && !ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement) && !ts.isExportAssignment(statement)) throw new CandidateCodeError(POLICY_RULES.topLevel.error);
    if (ts.isExportAssignment(statement) && !ts.isIdentifier(statement.expression) && !ts.isArrowFunction(statement.expression) && !ts.isFunctionExpression(statement.expression)) throw new CandidateCodeError("Default export must be a factory.");
  }
  const commands:string[]=[];let hasOnChatLogic=false;
  function visit(node: ts.Node) {
    if(ts.isStringLiteralLike(node)&&/^![a-z][a-z0-9_-]{0,23}$/i.test(node.text))commands.push(node.text);
    if(ts.isMethodDeclaration(node)&&node.name.getText(ast)==="onChat"&&node.body?.statements.length)hasOnChatLogic=true;
    if(ts.isPropertyAssignment(node)&&node.name.getText(ast)==="onChat"&&(ts.isArrowFunction(node.initializer)||ts.isFunctionExpression(node.initializer)))hasOnChatLogic=hasOnChatLogic||!ts.isBlock(node.initializer.body)||node.initializer.body.statements.length>0;
    if (ts.isNewExpression(node) && /Geometry$|Material$|BufferAttribute$|^(Float32|Float64|Uint8|Uint16|Uint32|Int8|Int16|Int32)Array$/.test(node.expression.getText(ast))) {
      for (let parent = node.parent; parent; parent = parent.parent) {
        if ((ts.isMethodDeclaration(parent) || ts.isPropertyAssignment(parent)) && parent.name?.getText(ast) === "update") throw new CandidateCodeError(POLICY_RULES.allocation.error);
      }
    }
    if (ts.isIdentifier(node) && (denied.has(node.text) || DENIED_PROPERTIES.includes(node.text))) throw new CandidateCodeError(`Forbidden module capability: ${node.text}`);
    if (node.kind === ts.SyntaxKind.AnyKeyword || (ts.isElementAccessExpression(node) && !ts.isNumericLiteral(node.argumentExpression) && !ts.isIdentifier(node.argumentExpression))) throw new CandidateCodeError(POLICY_RULES.typing.error);
    if (ts.isStringLiteral(node) && DENIED_PROPERTIES.includes(node.text)) throw new CandidateCodeError("Forbidden property indirection.");
    if (ts.isAwaitExpression(node) || node.kind === ts.SyntaxKind.AsyncKeyword || (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)) throw new CandidateCodeError(POLICY_RULES.synchronous.error);
    if (ts.isStringLiteral(node) && /https?:\/\/|wss?:\/\/|file:\/\//i.test(node.text)) throw new CandidateCodeError("External references are forbidden.");
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return {commands:[...new Set(commands)],hasOnChatLogic};
}
export async function compileModule(root: string, file: string, id: string, nodeModules: string, files: readonly string[] = [file]) {
  const path = resolve(root, file); if (!relative(root, path).startsWith("world/modules/")) throw new Error("Invalid entrypoint.");
  for (const name of files) inspectModule(await readFile(resolve(root, name), "utf8"), name);
  const result = await build({ entryPoints: [path], bundle: true, format: "esm", platform: "browser", target: "es2022", write: false,
    nodePaths: [nodeModules], plugins: [{ name: "shared-three", setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: "/assets/three.js", external: true })); } }] }).catch(error=>{if(Array.isArray(error?.errors))throw new CandidateCodeError(`Candidate bundle failed: ${String(error.errors[0]?.text??"invalid source").slice(0,120)}`);throw error;});
  const code = result.outputFiles[0]!.text;
  // Type check the candidate against the locked API without installing worktree dependencies.
  const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, resolveJsonModule: true, esModuleInterop: true, noEmit: true, skipLibCheck: true, types: ["node"], typeRoots: [resolve(nodeModules, "@types")], baseUrl: dirname(nodeModules), paths: { "*": [resolve(nodeModules, "*")], "three": [resolve(nodeModules, "@types/three/index.d.ts")], "three/addons/*": [resolve(nodeModules, "@types/three/examples/jsm/*")] } };
  const program = ts.createProgram(files.map(file => resolve(root, file)), options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) throw new CandidateCodeError(`Candidate TypeScript check failed: ${ts.flattenDiagnosticMessageText(diagnostics[0]!.messageText, " ").slice(0, 120)}`);
  return { id, code };
}
