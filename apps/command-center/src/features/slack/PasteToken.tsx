import { useState } from 'react';
import { Button } from '../../components/ui';

/** Fallback for the paste shortcut: reads the clipboard on click, or takes the token in a field. */
export function PasteToken(props: {
  busy: boolean;
  placeholder: string;
  onToken: (token: string, gesture: boolean) => void;
}) {
  const [manual, setManual] = useState(false);
  const [value, setValue] = useState('');
  const paste = async () => {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setManual(true);
      return;
    }
    if (!text.trim()) setManual(true);
    else props.onToken(text, true);
  };
  return (
    <div className="sl-paste">
      <Button variant="primary" disabled={props.busy} onClick={() => void paste()}>
        {props.busy ? 'Checking…' : 'Paste'}
      </Button>
      {manual ? (
        <form
          className="sl-paste-field"
          onSubmit={(e) => {
            e.preventDefault();
            props.onToken(value, true);
            setValue('');
          }}
        >
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            value={value}
            placeholder={props.placeholder}
            aria-label="Token"
            onChange={(e) => setValue(e.target.value)}
          />
          <Button type="submit" disabled={props.busy || !value.trim()}>
            Save
          </Button>
        </form>
      ) : (
        <button type="button" className="link" onClick={() => setManual(true)}>
          Type it instead
        </button>
      )}
    </div>
  );
}
