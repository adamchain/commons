import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { appPathFromHref } from "../lib/appLinks";

/**
 * Renders a bio, chat message, or description with clickable links.
 * Commons plan, profile, and community URLs stay inside the app. Everything
 * else that is http(s) opens in a new tab.
 */
const TOKEN =
  /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/(?:profile|communities|plans|dm)\/[A-Za-z0-9_-]+(?:\/(?:edit|chat))?(?:\?[^\s)]*)?)\)|https?:\/\/[^\s<]+/g;

export function LinkedText({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  const re = new RegExp(TOKEN.source, "g");
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const consumed = match[0];
    const isMarkdown = Boolean(match[1] && match[2]);
    const trail = !isMarkdown ? (consumed.match(/[).,]+$/)?.[0] ?? "") : "";
    const href = isMarkdown ? match[2] : consumed.slice(0, consumed.length - trail.length);
    const label = isMarkdown ? match[1] : href.replace(/^https?:\/\//, "");
    const internal = appPathFromHref(href);
    if (internal) {
      nodes.push(
        <Link
          key={`${match.index}-in`}
          to={internal}
          className="linked-text-link"
          onClick={(event) => event.stopPropagation()}
        >
          {label}
        </Link>,
      );
    } else if (/^https?:\/\//.test(href)) {
      nodes.push(
        <a
          key={`${match.index}-out`}
          href={href}
          className="linked-text-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          {label}
        </a>,
      );
    } else {
      nodes.push(consumed);
    }
    if (trail) nodes.push(trail);
    last = match.index + consumed.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}
