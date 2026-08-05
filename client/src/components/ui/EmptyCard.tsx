import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type Props = {
  icon: ReactNode;
  tint?: string;
  title: string;
  body: string;
  cta?: { to: string; label: string };
  /** Only for group-chat — the sole place allowed to use rgba(193,59,59,0.08). */
  groupChat?: boolean;
  className?: string;
};

/** Shared empty-state card used across Messages, My Plans, Network, etc. */
export function EmptyCard({
  icon,
  tint = "rgba(237,229,216,0.8)",
  title,
  body,
  cta,
  groupChat,
  className = "",
}: Props) {
  return (
    <div className={`ref-empty-card ${className}`.trim()} role="status">
      <div
        className={`ref-empty-glyph${groupChat ? " ref-empty-glyph--group-chat" : ""}`}
        style={groupChat ? undefined : { background: tint }}
        aria-hidden="true"
      >
        {icon}
      </div>
      <h2 className="ref-empty-title">{title}</h2>
      <p className="ref-empty-body">{body}</p>
      {cta && (
        <Link to={cta.to} className="ref-empty-cta">
          {cta.label}
        </Link>
      )}
    </div>
  );
}
