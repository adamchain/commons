import { useEffect, useState } from "react";
import { api } from "../api/http";
import { HOST_TAG_LABELS, type HostTag } from "../types/shared";

interface PendingItem {
  planId: string;
  planTitle: string;
  hostId: string;
}

const ALL_TAGS: HostTag[] = ["great_host", "would_do_again", "made_me_feel_welcome"];

export function FeedbackPrompt() {
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [thumb, setThumb] = useState<"up" | "down" | null>(null);
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<HostTag[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<PendingItem[]>("/api/feedback/pending").then(setPending).catch(() => undefined);
  }, []);

  if (pending.length === 0) return null;
  const current = pending[0];

  function reset() {
    setThumb(null);
    setNote("");
    setTags([]);
  }

  async function submit(skip = false) {
    setBusy(true);
    try {
      if (!skip && thumb) {
        await api("/api/feedback", {
          method: "POST",
          body: JSON.stringify({ planId: current.planId, thumb, note: note.trim() || undefined, hostTags: tags }),
        });
      }
      setPending((rest) => rest.slice(1));
      reset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="feedback-prompt">
      <div className="feedback-prompt-title">How was "{current.planTitle}"?</div>

      {thumb === null ? (
        <div className="feedback-thumbs">
          <button className="feedback-thumb" onClick={() => setThumb("up")}>👍</button>
          <button className="feedback-thumb" onClick={() => setThumb("down")}>👎</button>
          <button className="btn-link" onClick={() => void submit(true)}>Skip</button>
        </div>
      ) : (
        <>
          <textarea
            className="feedback-note"
            placeholder="Anything to call out? (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
          <div className="feedback-tags">
            {ALL_TAGS.map((t) => (
              <button
                key={t}
                type="button"
                className={`feedback-tag ${tags.includes(t) ? "is-active" : ""}`}
                onClick={() =>
                  setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))
                }
              >
                {HOST_TAG_LABELS[t]}
              </button>
            ))}
          </div>
          <div className="feedback-actions">
            <button className="btn-link" disabled={busy} onClick={() => void submit(true)}>Skip</button>
            <button className="btn-primary" disabled={busy} onClick={() => void submit(false)}>Done</button>
          </div>
        </>
      )}
    </div>
  );
}
