/** Shared interaction contract. Runtime camera clamps and rendered builder guidance use these values. */
export const FOCUS_LIMITS=Object.freeze({minDuration:.25,maxDuration:5,minPriority:0,maxPriority:3,intervalMs:1000});
export const CHAT_PLAY=Object.freeze({players:10,normalWinSeconds:60,commandsPerPlayerToWin:6,minPlayerExtent:1,winMarkerLift:1.2,focusDuration:1.5,progressPriority:1,winPriority:FOCUS_LIMITS.maxPriority,maxCommands:4,bursts:3,commandSpacingMs:300});
