import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string | null;
};

/** White surface input — never tan. Red focus ring via global input:focus. */
export function Input({ label, error, className = "", id, ...rest }: InputProps) {
  const inputId = id ?? (label ? `input-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  return (
    <div className="ui-field">
      {label && (
        <label className="ui-field-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input id={inputId} className={`ui-input ${className}`.trim()} {...rest} />
      {error ? <p className="luma-inline-error">{error}</p> : null}
    </div>
  );
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string | null;
};

export function TextArea({ label, error, className = "", id, ...rest }: TextAreaProps) {
  const inputId = id ?? (label ? `ta-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  return (
    <div className="ui-field">
      {label && (
        <label className="ui-field-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <textarea id={inputId} className={`ui-input ui-textarea ${className}`.trim()} {...rest} />
      {error ? <p className="luma-inline-error">{error}</p> : null}
    </div>
  );
}
