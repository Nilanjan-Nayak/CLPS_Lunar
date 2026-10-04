import { CAMERA_STATES, CAMERA_STATE_LABEL, CAMERA_STATE_INDEX } from '@/constants/cameraStates';
import { useCameraStore } from '@/state/cameraStore';

/** Earth → Moon → Surface → Mission stage indicator; clicking a stage flies there around the current focus. */
export function StageRail() {
  const state = useCameraStore((s) => s.state);
  const focus = useCameraStore((s) => s.focus);
  const request = useCameraStore((s) => s.requestFlight);
  const cur = CAMERA_STATE_INDEX[state];
  return (
    <aside className="stage-rail">
      {CAMERA_STATES.map((s) => {
        const idx = CAMERA_STATE_INDEX[s];
        const needsFocus = idx >= CAMERA_STATE_INDEX.LUNAR_SURFACE;
        const disabled = needsFocus && !focus;
        return (
          <button
            key={s}
            className={`stage${s === state ? ' active' : ''}${idx < cur ? ' done' : ''}`}
            disabled={disabled}
            title={disabled ? 'Select a landing site or mission first' : `Fly to ${CAMERA_STATE_LABEL[s]}`}
            onClick={() => request([s], focus, 2.2)}
          >
            <span className="stage-dot" />
            <span className="stage-label">{CAMERA_STATE_LABEL[s]}</span>
          </button>
        );
      })}
    </aside>
  );
}
