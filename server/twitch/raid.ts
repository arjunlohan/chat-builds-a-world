import { parseRaid } from "../pipeline.js";
/** Shared EventSub decoding/filtering for the live socket and explicit local raid simulator. */
export function incomingRaid(message: unknown, broadcasterId: string) {
 const value=message as {metadata?:{message_type?:string;message_id?:string};payload?:{subscription?:{type?:string};event?:Record<string,unknown>}};
 if(value?.metadata?.message_type!=="notification"||value.payload?.subscription?.type!=="channel.raid"||value.payload.event?.to_broadcaster_user_id!==broadcasterId)return;
 const event=value.payload.event;
 try{return parseRaid({id:value.metadata.message_id,broadcasterId:event.from_broadcaster_user_id,broadcasterName:event.from_broadcaster_user_name,viewerCount:event.viewers});}catch{return;}
}
export function raidFixture(broadcasterId: string, viewers: number, channel: string, id: string) {
 return {metadata:{message_type:"notification",message_id:id},payload:{subscription:{type:"channel.raid",version:"1",condition:{to_broadcaster_user_id:broadcasterId}},event:{from_broadcaster_user_id:"900000001",from_broadcaster_user_login:channel.toLowerCase(),from_broadcaster_user_name:channel,to_broadcaster_user_id:broadcasterId,to_broadcaster_user_login:"local",to_broadcaster_user_name:"Local",viewers}}};
}
