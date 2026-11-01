/** Shared ownership catalog. Argument validation stays with each command handler. */
export const BUILTIN_COMMANDS = {
 jump:"physical", dance:"physical", home:"physical", follow:"physical",
 idea:"round", vote:"round", rollback:"round", react:"reaction", summon:"summon",
 pause:"moderation", skip:"moderation", veto:"moderation", clear:"moderation",
} as const;
export function builtinCommand(text:string){
 const name=/^!([^\s]+)(?:\s|$)/.exec(text.trim())?.[1]?.toLowerCase();
 return name&&Object.hasOwn(BUILTIN_COMMANDS,name)?name as keyof typeof BUILTIN_COMMANDS:undefined;
}
export const isBuiltinCommand=(text:string)=>builtinCommand(text)!==undefined;
/** Commands remain chat events for modules but are never spoken text. */
export const isChatCommand = (text: string) => /^!\S/.test(text.trimStart());
export const hasPhysicalReaction = (text: string) => {const name=builtinCommand(text);return !!name&&BUILTIN_COMMANDS[name]==="physical";};
