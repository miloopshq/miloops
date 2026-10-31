import { forwardRef, type TextareaHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib';
import { Button } from './Button';

/** Textarea + action button on one aligned row. Enter submits; Shift+Enter adds a line. */
export const InputRow = forwardRef<
  HTMLTextAreaElement,
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onSubmit'> & {
    value: string;
    onValueChange: (v: string) => void;
    onSubmit: (v: string) => void;
    action?: ReactNode;
    actionDisabled?: boolean;
    className?: string;
  }
>(function InputRow({ value, onValueChange, onSubmit, action = 'Send', actionDisabled, className, ...rest }, ref) {
  return (
    <form
      className={cx('input-row', className)}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
    >
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSubmit(value);
          }
        }}
        {...rest}
      />
      <Button type="submit" variant="primary" disabled={actionDisabled ?? (rest.disabled || !value.trim())}>
        {action}
      </Button>
    </form>
  );
});
