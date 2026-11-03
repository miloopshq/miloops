/** Switch to a tracker that's ready; Connect or Edit a remote one. */
export function ConnectorActions(props: {
  canSwitch: boolean;
  remote: boolean;
  usable: boolean;
  configured: boolean;
  open: boolean;
  onSwitch: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="c-actions">
      {props.canSwitch && (
        <button className="btn sm" disabled={!props.usable} onClick={props.onSwitch}>
          Switch
        </button>
      )}
      {props.remote && (
        <button className={`btn sm ${props.open ? 'on' : ''}`} disabled={!props.usable} onClick={props.onToggle}>
          {props.configured ? 'Edit' : 'Connect'}
        </button>
      )}
    </div>
  );
}
