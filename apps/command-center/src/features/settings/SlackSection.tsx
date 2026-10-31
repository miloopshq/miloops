import { useSlackStatus, SlackSettings } from '../slack';
import { SettingsSection } from './SettingsSection';

/** No local server (the static demo): no Slack section. */
export function SlackSection(props: { focus: boolean }) {
  const [s] = useSlackStatus();
  if (!s) return null;
  return (
    <SettingsSection title="Slack">
      <SlackSettings focus={props.focus} />
    </SettingsSection>
  );
}
