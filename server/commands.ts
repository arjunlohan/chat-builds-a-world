/** Commands remain chat events for modules but are never spoken text. */
export const isChatCommand = (text: string) => /^!\S/.test(text.trimStart());
export const hasPhysicalReaction = (text: string) => /^!(jump|dance|home|follow)(?:\s|$)/i.test(text.trim());
