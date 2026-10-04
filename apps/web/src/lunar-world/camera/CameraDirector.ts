import { Quaternion, Vector3, Matrix4 } from 'three';
import type { CameraState } from '@/constants/cameraStates';
import type { CameraFocus } from '@/state/cameraStore';
import { easeInOutCubic } from '@/utils/easing';
import { poseFor, type CameraPose } from './CameraPoses';

export interface FlightLeg { from: CameraPose; to: CameraPose; state: CameraState; duration: number }

const _m = new Matrix4();
const _q = new Quaternion();

function orientation(p: CameraPose) {
  _m.lookAt(p.position, p.target, p.up);
  return _q.setFromRotationMatrix(_m).clone();
}

/**
 * CameraDirector — turns a requested path of camera states into timed legs and interpolates them.
 * Positions are interpolated with a slight outward bulge so legs never cut through the Moon/Earth;
 * orientation is slerped between the look-at quaternions of the endpoints.
 */
export class CameraDirector {
  legs: FlightLeg[] = [];
  private legIndex = 0;
  private t = 0;
  private fromQ = new Quaternion();
  private toQ = new Quaternion();
  active = false;

  /** Abort the current flight (e.g. when the mission simulation takes the camera). */
  cancel() {
    this.legs = [];
    this.active = false;
  }

  start(current: CameraPose, path: CameraState[], focus: CameraFocus | null, legDuration: number, exaggeration: number) {
    this.legs = [];
    let prev = current;
    path.forEach((state, i) => {
      const to = poseFor(state, focus, exaggeration);
      const dist = prev.position.distanceTo(to.position);
      const duration = i === path.length - 1 ? legDuration * 1.15 : legDuration * (dist < 2000 ? 0.7 : 1);
      this.legs.push({ from: prev, to, state, duration });
      prev = to;
    });
    this.legIndex = 0;
    this.t = 0;
    this.active = this.legs.length > 0;
    this.prepareLeg();
  }

  private prepareLeg() {
    const leg = this.legs[this.legIndex];
    if (!leg) return;
    this.fromQ.copy(orientation(leg.from));
    this.toQ.copy(orientation(leg.to));
  }

  /** Advance; returns the current pose + leg state, and whether a leg (or the flight) finished this step. */
  step(dt: number, out: { position: Vector3; quaternion: Quaternion }): { legDone: CameraState | null; done: boolean } {
    if (!this.active) return { legDone: null, done: true };
    const leg = this.legs[this.legIndex];
    this.t = Math.min(1, this.t + dt / leg.duration);
    const k = easeInOutCubic(this.t);
    out.position.lerpVectors(leg.from.position, leg.to.position, k);
    // arc bulge: push mid-leg positions away from the nearer body so we do not fly through it
    const bulge = Math.sin(k * Math.PI);
    const rFrom = leg.from.position.length(), rTo = leg.to.position.length();
    const rMid = out.position.length();
    const rWanted = Math.max(rMid, Math.min(rFrom, rTo) * 0.98);
    if (rMid > 1e-6 && rWanted > rMid) out.position.multiplyScalar(1 + ((rWanted - rMid) / rMid) * bulge);
    out.quaternion.slerpQuaternions(this.fromQ, this.toQ, k);
    if (this.t >= 1) {
      const finished = leg.state;
      this.legIndex += 1;
      this.t = 0;
      if (this.legIndex >= this.legs.length) {
        this.active = false;
        return { legDone: finished, done: true };
      }
      this.prepareLeg();
      return { legDone: finished, done: false };
    }
    return { legDone: null, done: false };
  }

  get finalPose(): CameraPose | null {
    return this.legs.length ? this.legs[this.legs.length - 1].to : null;
  }
}
