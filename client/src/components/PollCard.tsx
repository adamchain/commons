import { useMemo } from "react";
import { Avatar } from "./Avatar";
import type { PollDTO, PublicUser } from "../types/shared";

interface PollCardProps {
  poll: PollDTO;
  /** Who posted the poll. */
  author: PublicUser;
  /** Everyone in the conversation — used to resolve voter avatars/names. */
  participants: PublicUser[];
  /** Called with the tapped option id. Re-tapping your option clears the vote. */
  onVote: (optionId: string) => void;
  /** Present only when the viewer may close the poll (author or host). */
  onClose?: () => void;
  /** Present only when the viewer may re-open a closed poll (author or host). */
  onReopen?: () => void;
  /** "card" for the inline message stream, "pinned" for the compact top bar. */
  variant?: "card" | "pinned";
  /** Hide the question header — used when a pinned dropdown already shows it. */
  showQuestion?: boolean;
  /** Disables interaction while a request is in flight. */
  busy?: boolean;
}

export function PollCard({
  poll,
  author,
  participants,
  onVote,
  onClose,
  onReopen,
  variant = "card",
  showQuestion = true,
  busy = false,
}: PollCardProps) {
  const byId = useMemo(() => {
    const map = new Map<string, PublicUser>();
    for (const p of participants) map.set(p.id, p);
    return map;
  }, [participants]);

  // Results stay hidden until the viewer votes (Instagram-style) or the poll
  // closes — then everyone sees the bars.
  const revealed = poll.myVote !== null || poll.closed;
  const total = poll.totalVotes;

  return (
    <div className={`poll-card poll-card--${variant} ${poll.closed ? "is-closed" : ""}`}>
      {showQuestion && (
        <div className="poll-card-head">
          <span className="poll-card-badge" aria-hidden="true">📊</span>
          <div className="poll-card-question">{poll.question}</div>
        </div>
      )}

      <ul className="poll-card-options">
        {poll.options.map((opt) => {
          const count = opt.voterIds.length;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const mine = poll.myVote === opt.id;
          const voters = opt.voterIds.map((id) => byId.get(id)).filter(Boolean) as PublicUser[];
          return (
            <li key={opt.id}>
              <button
                type="button"
                className={`poll-option ${revealed ? "is-revealed" : ""} ${mine ? "is-mine" : ""}`}
                onClick={() => onVote(opt.id)}
                disabled={busy || poll.closed}
                aria-pressed={mine}
              >
                {revealed && (
                  <span className="poll-option-fill" style={{ width: `${pct}%` }} aria-hidden="true" />
                )}
                <span className="poll-option-label">
                  {mine && <span className="poll-option-check" aria-hidden="true">✓</span>}
                  <span className="poll-option-text">{opt.text}</span>
                </span>
                {revealed && (
                  <span className="poll-option-stats">
                    {variant === "card" && voters.length > 0 && (
                      <span className="poll-option-voters" aria-hidden="true">
                        {voters.slice(0, 3).map((v) => (
                          <span key={v.id} className="poll-option-voter">
                            <Avatar
                              seed={v.avatarSeed}
                              style={v.avatarStyle}
                              photoDataUrl={v.avatarPhotoDataUrl}
                              params={v.avatarParams}
                              size="xs"
                            />
                          </span>
                        ))}
                      </span>
                    )}
                    <span className="poll-option-pct">{pct}%</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="poll-card-foot">
        <span className="poll-card-meta">
          {author.firstName} · {total} {total === 1 ? "vote" : "votes"}
          {poll.closed && " · Final results"}
        </span>
        {!poll.closed && onClose && (
          <button type="button" className="poll-card-close" onClick={onClose} disabled={busy}>
            Close poll
          </button>
        )}
        {poll.closed && onReopen && (
          <button type="button" className="poll-card-close" onClick={onReopen} disabled={busy}>
            Reopen poll
          </button>
        )}
      </div>
    </div>
  );
}
