import { VERIFICATION_LEVELS, type VerificationLevel } from '@teamtrail/core';
import { Select, type SelectOption } from '../../components/ui';
import { LEVEL_HELP, LEVEL_TEXT } from '../../lib/verification';

const INHERIT = '';
type Choice = VerificationLevel | typeof INHERIT;

/**
 * Verification level picker for the trail lead. `inherit` names what an empty
 * choice falls back to (the trail level for a ticket); without it the
 * choice is always a level.
 */
export function LevelControl(props: {
  value?: VerificationLevel;
  inherit?: string;
  onChange: (level: VerificationLevel | null) => void;
}) {
  const levels: SelectOption<Choice>[] = VERIFICATION_LEVELS.map((l) => ({
    value: l,
    label: LEVEL_TEXT[l],
    hint: LEVEL_HELP[l],
  }));
  const options: SelectOption<Choice>[] = [...inheritOption(props), ...levels];
  return (
    <Select<Choice>
      compact
      className="vf-level"
      aria-label="Verification level"
      value={props.value ?? INHERIT}
      options={options}
      onChange={(v) => props.onChange(v === INHERIT ? null : v)}
    />
  );
}

/** A ticket can fall back to the trail's level; an unset trail level shows as Off. */
function inheritOption(props: { value?: VerificationLevel; inherit?: string }): SelectOption<Choice>[] {
  if (props.inherit !== undefined) {
    return [{ value: INHERIT, label: props.inherit, hint: 'Use the trail’s level for this ticket.' }];
  }
  if (props.value === undefined) return [{ value: INHERIT, label: 'Off (not set)' }];
  return [];
}
