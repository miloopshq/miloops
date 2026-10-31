import type { CredentialSource } from '@miloops-hq/core';
import { useState } from 'react';
import { SOURCE } from './labels';

export function Credential(props: {
  source: CredentialSource | null;
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
  link?: { href: string; text: string };
}) {
  const [paste, setPaste] = useState(!props.source);
  if (props.source && !paste)
    return (
      <div className="ts-auth">
        <span className="mono-label">{props.label}</span>
        <span className="pill on">{SOURCE[props.source]}</span>
        <button type="button" className="btn ghost sm" onClick={() => setPaste(true)}>
          Use another
        </button>
      </div>
    );
  return (
    <label className="field">
      <span className="ts-label">
        {props.label}
        {props.link && (
          <a href={props.link.href} target="_blank" rel="noreferrer">
            {props.link.text}
          </a>
        )}
      </span>
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}
