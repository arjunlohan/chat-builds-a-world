import ts from 'typescript-api';
import {MODEL_KIT,PRIMITIVE_KINDS,isModelKind,type ModelName} from '../../world/shared/model-kit.js';
/** Read source/type facts, never execute candidate code. Broad dynamic kinds conservatively name the closed catalog. */
export function modelKinds(ast:ts.SourceFile,checker?:ts.TypeChecker):ModelName[]{
 const found=new Set<ModelName>();let spawn=false,knownGeometry=false,dynamic=false;
 const known=(text:string)=>{if(isModelKind(text)){found.add(text);knownGeometry=true;}else if((PRIMITIVE_KINDS as readonly string[]).includes(text))knownGeometry=true;};
 const typed=(type:ts.Type)=>{if(type.isUnion()){for(const item of type.types)typed(item);}else if(type.isStringLiteral())known(type.value);};
 function visit(node:ts.Node){
  if(ts.isStringLiteralLike(node))known(node.text);
  if(ts.isIdentifier(node)&&node.text==='spawnSpec')spawn=true;
  if(checker){
   if(ts.isIdentifier(node)||ts.isAsExpression(node))typed(checker.getTypeAtLocation(node));
   if(ts.isPropertyAssignment(node)||ts.isShorthandPropertyAssignment(node)){
    if(node.name.getText(ast).replaceAll('"','').replaceAll("'",'')==='kind'){
     const type=checker.getTypeAtLocation(ts.isPropertyAssignment(node)?node.initializer:node.name);typed(type);
     if(type.flags&(ts.TypeFlags.Any|ts.TypeFlags.String|ts.TypeFlags.Unknown|ts.TypeFlags.Never))dynamic=true;
    }
   }
   if(ts.isCallExpression(node)&&checker.getTypeAtLocation(node).flags&ts.TypeFlags.Any)dynamic=true;
  }
  ts.forEachChild(node,visit);
 }
 visit(ast);return !spawn?[]:dynamic||!knownGeometry?Object.keys(MODEL_KIT) as ModelName[]:[...found].sort();
}
/** Legacy immutable bundles have no TypeScript annotations; use AST facts, not substring search. */
export function bundledModelKinds(source:string,file='module.js'){return modelKinds(ts.createSourceFile(file,source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS));}
