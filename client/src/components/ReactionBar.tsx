import { useState } from "react";
import { PeopleListSheet } from "./PeopleListSheet";
import type { NavFromState } from "../lib/navState";
import type { PublicUser } from "../types/shared";

/**
 * Heart toggle plus, once anyone has reacted, a tappable count that opens a
 * sheet of who reacted. Shared across every chat surface (plan, community, DM,
 * network group).
 */
export function ReactionBar({
  hearts,
  meId,
  people,
  profileFrom,
  onToggle,
}: {
  /** User ids who reacted with ❤️. */
  hearts: string[];
  meId: string | undefined;
  /** Roster used to resolve reactor names/avatars. */
  people: PublicUser[];
  profileFrom?: NavFromState;
  onToggle: () => void;
}) {
  const [showWho, setShowWho] = useState(false);
  const iReacted = meId ? hearts.includes(meId) : false;
  return (
    <span className="chat-react-wrap">
      <button
        type="button"
        className={`chat-react-btn ${iReacted ? "is-reacted" : ""}`}
        onClick={onToggle}
        aria-label={iReacted ? "Remove heart" : "React with heart"}
        aria-pressed={iReacted}
      >
        <span aria-hidden="true">❤️</span>
      </button>
      {hearts.length > 0 && (
        <button
          type="button"
          className="chat-react-count-btn"
          onClick={() => setShowWho(true)}
          aria-label={`See who reacted (${hearts.length})`}
        >
          {hearts.length}
        </button>
      )}
      {showWho && (
        <PeopleListSheet
          title={hearts.length === 1 ? "1 reaction" : `${hearts.length} reactions`}
          userIds={hearts}
          people={people}
          profileFrom={profileFrom}
          onClose={() => setShowWho(false)}
        />
      )}
    </span>
  );
}
