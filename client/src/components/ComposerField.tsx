import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { isNative } from "../lib/platform";

export type MentionPerson = { id: string; firstName: string };

/** The @token the caret is inside, if the user is mentioning someone. */
function activeMention(value: string, caret: number): { start: number; query: string } | null {
  const upto = value.slice(0, caret);
  const match = upto.match(/(^|\s)@([A-Za-z0-9'’-]{0,24})$/);
  if (!match) return null;
  const query = match[2] ?? "";
  return { start: caret - query.length - 1, query };
}

/**
 * Chat and bulletin composer. Grows with the draft, and offers people to @
 * when the caret is in an @token.
 */
export function ComposerField({
  value,
  onChange,
  onSubmit,
  placeholder,
  people,
  className,
  disabled,
  autoFocus,
  onEscape,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  placeholder: string;
  people: MentionPerson[];
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onEscape?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(value.length);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.overflowY = "hidden";
    const next = Math.min(el.scrollHeight, 200);
    el.style.height = `${next}px`;
    el.style.overflowY = next >= 200 ? "auto" : "hidden";
  }, [value]);

  const mention = activeMention(value, caret);
  const matches = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    const seen = new Set<string>();
    return people.filter((p) => {
      const name = p.firstName?.trim();
      if (!name || seen.has(p.id)) return false;
      seen.add(p.id);
      return !q || name.toLowerCase().startsWith(q);
    }).slice(0, 6);
  }, [mention, people]);

  function insert(person: MentionPerson) {
    if (!mention) return;
    const name = person.firstName.trim();
    const next = `${value.slice(0, mention.start)}@${name} ${value.slice(caret)}`;
    onChange(next);
    const place = mention.start + name.length + 2;
    setCaret(place);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(place, place);
    });
  }

  return (
    <div className="composer-field">
      {matches.length > 0 && (
        <ul className="composer-mentions" role="listbox" aria-label="Mention someone">
          {matches.map((p) => (
            <li key={p.id}>
              <button type="button" className="composer-mention" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(p)}>
                @{p.firstName}
              </button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        ref={ref}
        rows={1}
        className={className}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        enterKeyHint={isNative() ? "enter" : "send"}
        onChange={(e) => {
          onChange(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
        }}
        onClick={(e) => setCaret(e.currentTarget.selectionStart ?? value.length)}
        onKeyUp={(e) => setCaret(e.currentTarget.selectionStart ?? value.length)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onEscape?.();
            return;
          }
          // On iOS the return key is the only way to start a new line. Send stays on the button.
          if (e.key === "Enter" && !e.shiftKey && !isNative()) {
            e.preventDefault();
            if (matches[0] && mention && mention.query !== "") {
              insert(matches[0]);
              return;
            }
            onSubmit();
          }
        }}
      />
    </div>
  );
}

/** Turns @Name into a profile link when that person is in the thread. */
export function MentionText({ text, people }: { text: string; people: MentionPerson[] }) {
  const byName = new Map(
    people
      .filter((p) => p.firstName?.trim())
      .map((p) => [p.firstName.trim().toLowerCase(), p]),
  );
  const parts = text.split(/(@[A-Za-z0-9'’-]{1,24})/g);
  return (
    <>
      {parts.map((part, i) => {
        if (!part.startsWith("@")) return <span key={i}>{part}</span>;
        const person = byName.get(part.slice(1).toLowerCase());
        if (!person) return <span key={i}>{part}</span>;
        return (
          <Link key={i} to={`/profile/${person.id}`} className="mention-link" onClick={(e) => e.stopPropagation()}>
            {part}
          </Link>
        );
      })}
    </>
  );
}
