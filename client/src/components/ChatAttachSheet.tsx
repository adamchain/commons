import { BarChart2, CalendarPlus, ImagePlus } from "lucide-react";
import { Link } from "react-router-dom";
import { BottomSheet } from "./ui/BottomSheet";

export function ChatAttachSheet({
  onClose,
  onPhoto,
  onPoll,
  photoBusy,
  plan,
}: {
  onClose: () => void;
  onPhoto: () => void;
  onPoll: () => void;
  photoBusy?: boolean;
  plan?: { label: string; href: string } | null;
}) {
  return (
    <BottomSheet onClose={onClose} labelledBy="chat-attach-title">
      <h2 id="chat-attach-title" className="sheet-title">
        Add to the conversation
      </h2>
      <div className="chat-attach-grid">
        <button type="button" onClick={onPhoto} disabled={photoBusy}>
          <span>
            <ImagePlus size={21} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <strong>{photoBusy ? "Adding…" : "Photo"}</strong>
        </button>
        <button type="button" onClick={onPoll}>
          <span>
            <BarChart2 size={21} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <strong>Poll</strong>
        </button>
        {plan ? (
          <Link to={plan.href} onClick={onClose}>
            <span>
              <CalendarPlus size={21} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <strong>{plan.label}</strong>
          </Link>
        ) : null}
      </div>
    </BottomSheet>
  );
}
