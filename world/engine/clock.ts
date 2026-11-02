import {SIMULATION_MAX_DT} from '../shared/time.js';
import type {CitizenState} from '../../server/contracts.js';
/** The only presentation clock. A hitch pauses all simulation by the same amount. */
export class SimulationClock{
 private epoch:number;private elapsed=0;dt=0;
 constructor(epoch=0){this.epoch=epoch;}
 get seconds(){return this.elapsed;}
 readonly now=()=>this.epoch+this.elapsed*1000;
 anchor(timestamp:number){if(!Number.isFinite(timestamp))throw new Error('Invalid simulation epoch');this.epoch=timestamp-this.elapsed*1000;}
 reset(timestamp:number){this.elapsed=0;this.dt=0;this.anchor(timestamp);}
 advance(seconds:number){this.dt=Number.isFinite(seconds)?Math.max(0,Math.min(SIMULATION_MAX_DT,seconds)):0;this.elapsed+=this.dt;return this.dt;}
 /** Translate authoritative ages at ingress, rather than mixing wall time into frame updates. */
 citizen(state:CitizenState,sourceNow:number):CitizenState{const delta=this.now()-sourceNow;return {...state,lastActive:state.lastActive+delta,speechAt:state.speechAt===0?0:state.speechAt+delta,commandAt:state.commandAt===0?0:state.commandAt+delta,...(state.entry?{entry:{...state.entry,at:state.entry.at+delta}}:{})};}
}
