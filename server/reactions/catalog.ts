/** Original prerecorded visuals. Trigger names are text aliases, never emote artwork. */
export const REACTIONS = [
 {id:"laugh",label:"LUL storm",triggers:["lul","lulw","kekw","kek","omegalul","lol","lmao","lmfao","rofl","haha","hahaha","hahahaha","hehe"],description:"A cream creature tumbles with floating amber laughter droplets."},
 {id:"hype",label:"Hype",triggers:["pog","pogchamp","poggers","lets go","let's go","letsgo","lfg"],description:"Three rounded creatures bounce through a confetti celebration."},
 {id:"love",label:"Love",triggers:["<3","❤","❤️","♥","♥️","love","hearts"],description:"Rose creatures lift a ring of sculpted hearts."},
 {id:"w",label:"W",triggers:["w","win","winning","ws"],description:"Mint creatures hoist a golden W built from beams."},
 {id:"l",label:"L",triggers:["l","loss","ls"],description:"A lavender creature catches a wobbling geometric L."},
 {id:"gg",label:"GG",triggers:["gg","ggs","ggwp","good game"],description:"Two cream creatures meet beneath paired geometric Gs."},
 {id:"f",label:"Respects",triggers:["f","rip","biblethump","pepehands","respects"],description:"A quiet creature presents a beam-built F and warm petals."},
 {id:"dance",label:"Dance",triggers:["dinodance","catjam","dance","dancing","vibing"],description:"Mint and peach creatures swing in a staggered dance."},
 {id:"nervous",label:"Nervous",triggers:["monkas","monkaw","nervous","sweating"],description:"A trembling creature shelters under a cloud of teal droplets."},
 {id:"sleepy",label:"Sleepy",triggers:["residentsleeper","zzz","zzzz","zzzzz","zzzzzz","sleepy","snooze"],description:"A sleepy creature drifts across a crescent with small stars."},
 {id:"rage",label:"Rage",triggers:["smorc","mald","malding","rage","raging"],description:"A peach creature stomps, releasing soft geometric steam puffs."},
 {id:"sarcasm",label:"Sarcasm",triggers:["kappa","/s","surely","yeah right"],description:"A tilted lavender creature balances an exaggerated seesaw of stars."},
] as const;
export type ReactionId = typeof REACTIONS[number]["id"];
export type ClipId = ReactionId | "dog-carrot" | "worm-takeover";
export const CLIPS = [
 ...REACTIONS.map(r=>({...r,seconds:6,url:`/reactions/${r.id}.webm`})),
 {id:"dog-carrot",label:"Carrot chase",triggers:[],seconds:7,url:"/reactions/dog-carrot.webm",description:"A dog chases a bouncing carrot across the screen."},
 {id:"worm-takeover",label:"Worm takeover",triggers:[],seconds:7,url:"/reactions/worm-takeover.webm",description:"A worm grows, wiggles across the screen and retreats."},
] as const;
export function clip(id:ClipId) { return CLIPS.find(c=>c.id===id)!; }
// Match whole Unicode words, with explicit punctuation aliases (<3, /s, hearts).
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const matchers=REACTIONS.map(r=>({id:r.id,pattern:new RegExp(`(?:^|[^\\p{L}\\p{N}_])(?:${r.triggers.map(t=>escape(t).replace(/ /g,"\\s+")).join("|")})(?=$|[^\\p{L}\\p{N}_])`,"iu")}));
export function matchReactions(text:string):ReactionId[] {return matchers.filter(r=>r.pattern.test(text.replace(/[’‘]/g,"'"))).map(r=>r.id);}
