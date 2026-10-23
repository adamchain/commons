import type { PlanDTO } from "../types/shared";
import { appleCalendarUrl, googleCalendarUrl } from "../lib/calendar";
import { BottomSheet } from "./ui/BottomSheet";

// Lets someone drop a plan onto Apple or Google calendar. Apple opens the
// server-built .ics (iOS shows "Add to Calendar"); Google opens a render URL.
export function AddToCalendarSheet({ plan, onClose }: { plan: PlanDTO; onClose: () => void }) {
  function open(href: string) {
    window.open(href, "_blank", "noopener,noreferrer");
    onClose();
  }

  return (
    <BottomSheet onClose={onClose} labelledBy="add-calendar-title">
      <div id="add-calendar-title" className="sheet-title">Add to calendar</div>
      <div className="sheet-actions">
        <button type="button" className="sheet-link" onClick={() => open(appleCalendarUrl(plan))}>
          Apple Calendar
        </button>
        <button type="button" className="sheet-link" onClick={() => open(googleCalendarUrl(plan))}>
          Google Calendar
        </button>
      </div>
      <button type="button" className="btn-link sheet-cancel" onClick={onClose}>
        Cancel
      </button>
    </BottomSheet>
  );
}
