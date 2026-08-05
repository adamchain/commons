import { useMemo, useState } from "react";
import { BarChart2, Check, ChevronDown } from "lucide-react";
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
  /** When true, tapping the question header collapses/expands the poll body. */
  collapsible?: boolean;
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
  collapsible = false,
  busy = false,
}: PollCardProps) {
  const byId = useMemo(() => {
    const map = new Map<string, PublicUser>();
    for (const p of participants) map.set(p.id, p);
    return map;
  }, [participants]);

  // Collapsible polls start open; once someone has voted or it closed, keep it
  // open so results are visible without a tap.
  const [open, setOpen] = useState(true);
  const collapsed = collapsible && !open;

  // Results stay hidden until the viewer votes (Instagram-style) or the poll
  // closes — then everyone sees the bars.
  const revealed = poll.myVote !== null || poll.closed;
  const total = poll.totalVotes;

  const maxVotes = useMemo(() => {
    if (!revealed || total === 0) return 0;
    return Math.max(...poll.options.map((o) => o.voterIds.length));
  }, [poll.options, revealed, total]);

  return (
    <div className={`poll-card poll-card--${variant} ${poll.closed ? "is-closed" : ""} ${collapsed ? "is-collapsed" : ""}`}>
      {showQuestion && (
        collapsible ? (
          <button
            type="button"
            className="poll-card-head poll-card-head--toggle"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            <span className="poll-card-badge" aria-hidden="true">
              <BarChart2 size={14} strokeWidth={1.8} />
            </span>
            <div className="poll-card-question">{poll.question}</div>
            <span className={`poll-card-chevron ${open ? "is-open" : ""}`} aria-hidden="true">
              <ChevronDown size={12} strokeWidth={2} />
            </span>
          </button>
        ) : (
          <div className="poll-card-head">
            <span className="poll-card-badge" aria-hidden="true">
              <BarChart2 size={14} strokeWidth={1.8} />
            </span>
            <div className="poll-card-question">{poll.question}</div>
          </div>
        )
      )}

      {collapsed && (
        <div className="poll-card-collapsed-meta">
          {total} {total === 1 ? "vote" : "votes"}{poll.closed ? " · Final" : ""}
        </div>
      )}

      {!collapsed && (
      <>
      <ul className="poll-card-options">
        {poll.options.map((opt) => {
          const count = opt.voterIds.length;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const mine = poll.myVote === opt.id;
          const isWinner = revealed && maxVotes > 0 && count === maxVotes;
          const showCheck = isWinner || (!revealed && mine);
          const voters = opt.voterIds.map((id) => byId.get(id)).filter(Boolean) as PublicUser[];
          return (
            <li key={opt.id}>
              <button
                type="button"
                className={`poll-option ${revealed ? "is-revealed" : ""} ${mine ? "is-mine" : ""} ${isWinner ? "is-winner" : ""}`}
                onClick={() => onVote(opt.id)}
                disabled={busy || poll.closed}
                aria-pressed={mine}
              >
                <span className="poll-option-label">
                  {showCheck && (
                    <Check className="poll-option-check" size={11} strokeWidth={2.5} aria-hidden="true" />
                  )}
                  <span className={`poll-option-text ${isWinner ? "is-winner-text" : ""}`}>{opt.text}</span>
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
      </>
      )}
    </div>
  );
}
