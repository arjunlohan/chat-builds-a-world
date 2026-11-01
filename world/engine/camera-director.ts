import type {WorldLook} from "./render-profile.js";
import {FOCUS_LIMITS as F} from "../shared/chat-play.js";
import { MathUtils, Vector3, type PerspectiveCamera } from "three";
import { clampToWorld } from "../shared/limits.js";
import type { WorldServices } from "./api.js";

export const HOME_POSES=Object.freeze({classic:{angle:-.65,radius:34,height:15.5,lookAt:[0,-.25,0] as const},new:{angle:-.65,radius:24,height:10.5,lookAt:[0,1.5,0] as const}});
export const establishingPose=(look:WorldLook="new")=>HOME_POSES[look];
const smooth = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Slow establishing shot; focus transitions retarget from the current pose. */
export class CameraDirector {
  private time = 0;
  private flight = 0;
  private duration = 2.5;
  private hold = 0;
  private priority = -1;
  private returning = false;
  private readonly home:Vector3;
  private readonly pose:ReturnType<typeof establishingPose>;
  private readonly look = new Vector3();
  private readonly fromLook = new Vector3();
  private readonly target = new Vector3();
  private readonly from = new Vector3();
  private readonly destination = new Vector3();
  private readonly drift = new Vector3();
  private readonly offset = new Vector3();
  private readonly pendingTarget = new Vector3();
  private pendingPriority = -1;
  private pendingCount = 0;
  private lastAutomatic = -Infinity;
  private lastFocus = -Infinity;
  private automaticCount = 0;
  get focusPoint(): Readonly<Vector3> | undefined { return this.hold > 0 ? this.target : undefined; }
  get automaticFocuses() { return this.automaticCount; }

  /** Coalesce a burst to one weighted target; automatic shots are >=8 seconds apart. */
  notice(target: Readonly<Vector3>, priority = 0) {
    if (![target.x, target.y, target.z].every(Number.isFinite) || priority < this.pendingPriority) return;
    if (priority > this.pendingPriority) { this.pendingPriority = priority; this.pendingCount = 0; }
    const weight = 1 / Math.min(80, ++this.pendingCount);
    this.pendingTarget.lerp(target, weight);
  }

  constructor(private readonly camera: PerspectiveCamera, private readonly reducedMotion = false,look:WorldLook="new") {
    this.pose=establishingPose(look);this.home=new Vector3(...this.pose.lookAt);this.look.copy(this.home);
    this.driftPosition();
    camera.position.copy(this.drift);
    camera.lookAt(this.look);
  }

  private driftPosition() {
    const p=this.pose,angle = p.angle + (this.reducedMotion ? 0 : Math.sin(this.time * 0.023) * 0.24);
    this.drift.set(Math.sin(angle) * p.radius, p.height + Math.sin(this.time * 0.06) * (this.reducedMotion ? 0 : 0.6), Math.cos(angle) * p.radius);
  }

  readonly focus: WorldServices["camera"]["focus"] = (position, options = {}) => {
    if (![position.x, position.y, position.z].every(Number.isFinite)) return;
    const priority = MathUtils.clamp(Math.round(options.priority ?? 1), F.minPriority, F.maxPriority);
    if (this.hold > 0 && (priority < this.priority || (priority < F.maxPriority && priority === this.priority && this.time - this.lastFocus < 6))) return;
    this.lastFocus = this.time;
    this.priority = priority;
    this.duration = this.reducedMotion ? F.minDuration : MathUtils.clamp(options.duration ?? 2.5, F.minDuration, F.maxDuration);
    clampToWorld(this.target.copy(position));
    this.from.copy(this.camera.position);
    this.fromLook.copy(this.look);
    this.offset.copy(this.camera.position).sub(this.look).normalize();
    this.destination.copy(this.target).addScaledVector(this.offset, 14);
    this.destination.y = Math.max(this.destination.y, this.target.y + 7);
    this.flight = 0;
    this.hold = this.duration + 4;
    this.returning = false;
  };

  update(dt: number) {
    this.time += dt;
    if (this.pendingPriority >= 0 && this.time - this.lastAutomatic >= 8 && this.time - this.lastFocus >= 7 && (this.hold === 0 || this.pendingPriority > this.priority)) {
      this.focus(this.pendingTarget, { duration: 2.8, priority: this.pendingPriority });
      this.lastAutomatic = this.time; this.automaticCount++;
      this.pendingPriority = -1; this.pendingCount = 0;
    }
    this.driftPosition();
    if (this.hold > 0 || this.returning) {
      this.flight = Math.min(this.duration, this.flight + dt);
      const t = smooth(this.flight / this.duration);
      if (this.returning) this.destination.copy(this.drift);
      this.camera.position.lerpVectors(this.from, this.destination, t);
      this.look.lerpVectors(this.fromLook, this.returning ? this.home : this.target, t);
      this.hold = Math.max(0, this.hold - dt);
      if (!this.returning && this.hold === 0) {
        this.from.copy(this.camera.position);
        this.fromLook.copy(this.look);
        this.duration = this.reducedMotion ? F.minDuration : F.maxDuration;
        this.flight = 0;
        this.returning = true;
      } else if (this.returning && t === 1) {
        this.returning = false;
        this.priority = -1;
      }
    } else {
      this.camera.position.copy(this.drift);
      this.look.copy(this.home);
    }
    this.camera.lookAt(this.look);
  }
}
