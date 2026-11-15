import { CAMERA_STATES, CAMERA_STATE_LABEL, CAMERA_STATE_INDEX } from '@/constants/cameraStates';
import { useCameraStore } from '@/state/cameraStore';

/**
 * StageRail — the Earth → Moon → Surface → Mission stepper, drawn as a horizontal strip under the top bar.
 * Clicking a stage flies the camera there around the current focus; stages that need a focus are disabled until one exists.
 */
export function StageRail() {
  const state = useCameraStore((s) => s.state);
  const focus = useCameraStore((s) => s.focus);
  const request = useCameraStore((s) => s.requestFlight);
  const cur = CAMERA_STATE_INDEX[state];
  return (
    <nav className="stage-strip" aria-label="Camera stage">
      {CAMERA_STATES.map((s, i) => {
        const idx = CAMERA_STATE_INDEX[s];
        const needsFocus = idx >= CAMERA_STATE_INDEX.LUNAR_SURFACE;
        const disabled = needsFocus && !focus;
        return (
          <button
            key={s}
            type="button"
            className={`stage${s === state ? ' active' : ''}${idx < cur ? ' done' : ''}`}
            disabled={disabled}
            aria-current={s === state ? 'step' : undefined}
            title={disabled ? 'Select a landing site or mission first' : `Fly to ${CAMERA_STATE_LABEL[s]}`}
            onClick={() => request([s], focus, 2.2)}
          >
            {i > 0 && <span className="stage-link" aria-hidden />}
            <span className="stage-dot" />
            <span className="stage-label">{CAMERA_STATE_LABEL[s]}</span>
          </button>
        );
      })}
    </nav>
  );
}
