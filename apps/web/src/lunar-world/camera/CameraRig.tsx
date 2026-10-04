import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { MOON_RADIUS_KM } from '@/constants/frames';
import { liveEphemeris } from '@/solar-system/ephemerisDriver';
import { useCameraStore } from '@/state/cameraStore';
import { useWorldStore } from '@/state/worldStore';
import { simCamera } from '@/state/simStore';
import { vec3ToLatLon } from '@/utils/geo';
import { CameraDirector } from './CameraDirector';
import { poseFor } from './CameraPoses';

const EARTH = new Vector3();
const EARTH_STATES = new Set(['EARTH', 'EARTH_ORBIT']);

/**
 * CameraRig — owns the camera: executes flights from the cameraStore through the CameraDirector,
 * hands control back to OrbitControls when idle, and publishes telemetry for the HUD.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera);
  const controls = useRef<OrbitControlsImpl>(null);
  const director = useMemo(() => new CameraDirector(), []);
  const flight = useCameraStore((s) => s.flight);
  const exaggeration = useWorldStore((s) => s.elevationExaggeration);
  const lastTelemetry = useRef(0);
  const scratch = useRef({ position: new Vector3(), quaternion: camera.quaternion.clone() });
  const startedId = useRef(0);
  const simWasActive = useRef(false);
  // Earth-relative camera states ride along with the (ephemeris-driven) Earth when the world clock moves.
  const earthAtFlightStart = useRef<Vector3 | null>(null);
  const lastEarth = useRef<Vector3 | null>(null);

  // initial pose
  useEffect(() => {
    const p = poseFor('SPACE', null);
    camera.position.copy(p.position);
    camera.up.copy(p.up);
    camera.lookAt(p.target);
    controls.current?.target.copy(p.target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!flight || flight.id === startedId.current) return;
    startedId.current = flight.id;
    const current = { position: camera.position.clone(), target: controls.current?.target.clone() ?? new Vector3(), up: camera.up.clone() };
    director.start(current, flight.path, flight.focus, flight.legDuration, exaggeration);
    earthAtFlightStart.current = new Vector3(...liveEphemeris.geometry.earthPosScene);
    lastEarth.current = null;
    useCameraStore.getState().setFlying(true);
    if (controls.current) controls.current.enabled = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight]);

  useFrame((_, dt) => {
    const store = useCameraStore.getState();
    // Mission-simulation chase camera takes over while it is active; OrbitControls resume where it leaves off.
    if (simCamera.active) {
      if (director.active) director.cancel();
      if (controls.current) controls.current.enabled = false;
      camera.up.copy(simCamera.up);
      camera.position.copy(simCamera.position);
      camera.lookAt(simCamera.target);
      simWasActive.current = true;
      if (store.flying) store.setFlying(false);
    } else if (simWasActive.current) {
      simWasActive.current = false;
      if (controls.current) {
        controls.current.target.copy(simCamera.target);
        controls.current.enabled = true;
        controls.current.update();
      }
    }
    if (director.active) {
      const { legDone, done } = director.step(Math.min(dt, 0.05), scratch.current);
      camera.position.copy(scratch.current.position);
      camera.quaternion.copy(scratch.current.quaternion);
      if (legDone) store.setState(legDone);
      if (done) {
        const fin = director.finalPose;
        if (fin && controls.current) {
          camera.up.copy(fin.up);
          controls.current.target.copy(fin.target);
          // the pose was planned for the Earth position at flight start — carry over any movement since then
          // (re-read the store: setState(legDone) above may have just switched the state in this same frame)
          if (EARTH_STATES.has(useCameraStore.getState().state) && earthAtFlightStart.current) {
            const delta = EARTH.set(...liveEphemeris.geometry.earthPosScene).sub(earthAtFlightStart.current);
            camera.position.add(delta);
            controls.current.target.add(delta);
          }
          camera.lookAt(controls.current.target);
          controls.current.enabled = true;
          controls.current.update();
        }
        store.setFlying(false);
      }
    } else if (!simCamera.active && EARTH_STATES.has(store.state)) {
      // idle at the Earth: follow it (libration/distance change with the world clock) so the framing holds
      EARTH.set(...liveEphemeris.geometry.earthPosScene);
      if (lastEarth.current) {
        const delta = EARTH.clone().sub(lastEarth.current);
        if (delta.lengthSq() > 0) {
          camera.position.add(delta);
          controls.current?.target.add(delta);
        }
        lastEarth.current.copy(EARTH);
      } else lastEarth.current = EARTH.clone();
    } else {
      lastEarth.current = null;
    }
    const now = performance.now();
    if (now - lastTelemetry.current > 100) {
      lastTelemetry.current = now;
      const d = camera.position.length();
      const { latitude, longitude } = vec3ToLatLon(camera.position);
      store.setTelemetry({ distanceToMoonKm: d, altitudeKm: d - MOON_RADIUS_KM, subLat: latitude, subLon: longitude, distanceToEarthKm: camera.position.distanceTo(EARTH.set(...liveEphemeris.geometry.earthPosScene)) });
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={0.2}
      maxDistance={1.5e6}
      zoomSpeed={0.9}
      rotateSpeed={0.6}
      panSpeed={0.5}
      screenSpacePanning={false}
    />
  );
}
