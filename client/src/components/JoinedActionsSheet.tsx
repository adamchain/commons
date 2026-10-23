import type { PlanDTO } from "../types/shared";
import { appleCalendarUrl, canAddToCalendar, googleCalendarUrl } from "../lib/calendar";
import { BottomSheet } from "./ui/BottomSheet";

// Shown right after someone Joins a plan with a set date — the quick "you're in,
// now lock it in" moment: drop it on a calendar or share it. Calendar rows are
// hidden for flexible-date plans (there's no real day to add yet).
export function JoinedActionsSheet({
  plan,
  onShare,
  onClose,
}: {
  plan: PlanDTO;
  onShare: () => void;
  onClose: () => void;
}) {
  const showCalendar = canAddToCalendar(plan);

  function open(href: string) {
    window.open(href, "_blank", "noopener,noreferrer");
    onClose();
  }

  return (
    <BottomSheet onClose={onClose} labelledBy="joined-actions-title">
      <div id="joined-actions-title" className="sheet-title">You're in — see you there</div>
      <p className="sheet-copy" style={{ textAlign: "center" }}>Lock it in or bring someone along.</p>
      <div className="sheet-actions">
        {showCalendar && (
          <>
            <button type="button" className="sheet-link" onClick={() => open(appleCalendarUrl(plan))}>
              Add to Apple Calendar
            </button>
            <button type="button" className="sheet-link" onClick={() => open(googleCalendarUrl(plan))}>
              Add to Google Calendar
            </button>
          </>
        )}
        <button type="button" className="sheet-link" onClick={onShare}>
          Share this plan
        </button>
      </div>
      <button type="button" className="btn-link sheet-cancel" onClick={onClose}>
        Done
      </button>
    </BottomSheet>
  );
}
