import { VERIFICATION_LEVELS, type VerificationLevel } from '@miloops-hq/core';
import { Select, type SelectOption } from '../../components/ui';
import { LEVEL_HELP, LEVEL_TEXT } from '../../lib/verification';

const INHERIT = '';
type Choice = VerificationLevel | typeof INHERIT;

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
  const options: SelectOption<Choice>[] = [
    ...(props.inherit !== undefined
      ? [{ value: INHERIT, label: props.inherit, hint: 'Use the mission’s level for this ticket.' } as const]
      : props.value === undefined
        ? [{ value: INHERIT, label: 'Off (not set)' } as const]
        : []),
    ...VERIFICATION_LEVELS.map((l) => ({ value: l, label: LEVEL_TEXT[l], hint: LEVEL_HELP[l] })),
  ];
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
