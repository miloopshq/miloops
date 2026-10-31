import { VERIFICATION_LEVELS, type VerificationLevel } from '@miloops-hq/core';
import { LEVEL_TEXT } from '../../lib/verification';

const INHERIT = '';

/**
 * Verification level picker for the operator. `inherit` names what an empty
 * choice falls back to (the mission level for a ticket); without it the
 * choice is always a level.
 */
export function LevelControl(props: {
  value?: VerificationLevel;
  inherit?: string;
  onChange: (level: VerificationLevel | null) => void;
}) {
  return (
    <select
      className="vf-level"
      value={props.value ?? INHERIT}
      onChange={(e) => props.onChange(e.target.value === INHERIT ? null : (e.target.value as VerificationLevel))}
    >
      {props.inherit !== undefined && <option value={INHERIT}>{props.inherit}</option>}
      {props.inherit === undefined && props.value === undefined && <option value={INHERIT}>Off (not set)</option>}
      {VERIFICATION_LEVELS.map((l) => (
        <option key={l} value={l}>
          {LEVEL_TEXT[l]}
        </option>
      ))}
    </select>
  );
}
