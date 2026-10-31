import { Choice } from '../../components/ui';
import type { Prefs } from '../../lib';

export const AWAY_MINUTES = [5, 15, 30, 60];

export function BriefingChoice(props: { value: Prefs['briefing']; onChange: (v: Prefs['briefing']) => void }) {
  const { value } = props;
  return (
    <div className="choice-row compact">
      <Choice on={!value.enabled} title="Off" onClick={() => props.onChange({ ...value, enabled: false })} />
      {AWAY_MINUTES.map((m) => (
        <Choice
          key={m}
          on={value.enabled && value.awayMinutes === m}
          title={`Away ${m} min`}
          onClick={() => props.onChange({ enabled: true, awayMinutes: m })}
        />
      ))}
    </div>
  );
}
