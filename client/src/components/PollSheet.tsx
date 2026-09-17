import { useState } from "react";
import { BottomSheet } from "./ui/BottomSheet";
import { Button } from "./ui/Button";

export function PollSheet({
  onClose,
  onSubmit,
  submitting,
}: {
  onClose: () => void;
  onSubmit: (question: string, options: string[]) => Promise<void> | void;
  submitting: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const canSubmit = question.trim().length > 0 && options.filter((o) => o.trim()).length >= 2;

  return (
    <BottomSheet
      onClose={onClose}
      closeDisabled={submitting}
      labelledBy="poll-sheet-title"
    >
      <h2 id="poll-sheet-title" className="sheet-title">
        New poll
      </h2>
      <input
        type="text"
        className="poll-modal-question"
        placeholder="Ask a question…"
        value={question}
        maxLength={140}
        autoFocus
        onChange={(e) => setQuestion(e.target.value)}
      />
      <div className="sheet-section-label">Options</div>
      <div className="poll-modal-options">
        {options.map((opt, i) => (
          <div key={i} className="poll-modal-option-row">
            <input
              type="text"
              placeholder={`Option ${i + 1}`}
              value={opt}
              maxLength={80}
              onChange={(e) =>
                setOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))
              }
            />
            {options.length > 2 && (
              <button
                type="button"
                className="poll-modal-remove"
                aria-label={`Remove option ${i + 1}`}
                onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      {options.length < 6 && (
        <button
          type="button"
          className="poll-modal-add"
          onClick={() => setOptions((prev) => [...prev, ""])}
        >
          + Add option
        </button>
      )}
      <div className="sheet-actions">
        <Button
          variant="primary"
          block
          disabled={!canSubmit || submitting}
          onClick={() => void onSubmit(question.trim(), options.map((o) => o.trim()).filter(Boolean))}
        >
          {submitting ? "Posting…" : "Post poll"}
        </Button>
        <Button variant="secondary" block disabled={submitting} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </BottomSheet>
  );
}
