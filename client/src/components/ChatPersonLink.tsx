import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { NavFromState } from "../lib/navState";

/** Avatar or name in a thread that opens that person's profile. */
export function ChatPersonLink({
  userId,
  name,
  state,
  className,
  children,
}: {
  userId: string;
  name: string;
  state: NavFromState;
  className?: string;
  children: ReactNode;
}) {
  const label = name.trim() || "this person";
  return (
    <Link
      to={`/profile/${userId}`}
      state={state}
      className={className ? `chat-person-link ${className}` : "chat-person-link"}
      aria-label={`Open ${label}'s profile`}
    >
      {children}
    </Link>
  );
}
