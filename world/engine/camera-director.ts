import { MathUtils, Vector3, type PerspectiveCamera } from "three";
import type { WorldServices } from "./api.js";

const home = new Vector3(0, -0.25, 0);
const smooth = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Slow establishing shot; focus transitions retarget from the current pose. */
export class CameraDirector {
  private time = 0;
  private flight = 0;
  private duration = 2.5;
  private hold = 0;
  private priority = -1;
  private returning = false;
  private readonly look = home.clone();
  private readonly fromLook = home.clone();
  private readonly target = home.clone();
  private readonly from = new Vector3();
  private readonly destination = new Vector3();
  private readonly drift = new Vector3();
  private readonly offset = new Vector3();

  constructor(private readonly camera: PerspectiveCamera, private readonly reducedMotion = false) {
    this.driftPosition();
    camera.position.copy(this.drift);
    camera.lookAt(this.look);
  }

  private driftPosition() {
    const angle = -0.65 + (this.reducedMotion ? 0 : Math.sin(this.time * 0.023) * 0.24);
    this.drift.set(Math.sin(angle) * 34, 15.5 + Math.sin(this.time * 0.06) * (this.reducedMotion ? 0 : 0.6), Math.cos(angle) * 34);
  }

  readonly focus: WorldServices["camera"]["focus"] = (position, options = {}) => {
    if (![position.x, position.y, position.z].every(Number.isFinite)) return;
    const priority = MathUtils.clamp(Math.round(options.priority ?? 1), 0, 3);
    if (this.hold > 0 && priority < this.priority) return;
    this.priority = priority;
    this.duration = this.reducedMotion ? 0.25 : MathUtils.clamp(options.duration ?? 2.5, 0.25, 5);
    this.target.set(MathUtils.clamp(position.x, -64, 64), MathUtils.clamp(position.y, -8, 48), MathUtils.clamp(position.z, -64, 64));
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
    this.driftPosition();
    if (this.hold > 0 || this.returning) {
      this.flight = Math.min(this.duration, this.flight + dt);
      const t = smooth(this.flight / this.duration);
      if (this.returning) this.destination.copy(this.drift);
      this.camera.position.lerpVectors(this.from, this.destination, t);
      this.look.lerpVectors(this.fromLook, this.returning ? home : this.target, t);
      this.hold = Math.max(0, this.hold - dt);
      if (!this.returning && this.hold === 0) {
        this.from.copy(this.camera.position);
        this.fromLook.copy(this.look);
        this.duration = this.reducedMotion ? 0.25 : 5;
        this.flight = 0;
        this.returning = true;
      } else if (this.returning && t === 1) {
        this.returning = false;
        this.priority = -1;
      }
    } else {
      this.camera.position.copy(this.drift);
      this.look.copy(home);
    }
    this.camera.lookAt(this.look);
  }
}
