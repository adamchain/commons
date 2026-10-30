import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, ChevronRight, Lightbulb, X } from "lucide-react";
import { BottomSheet } from "./ui/BottomSheet";

export const OPEN_CREATE_LAUNCHER = "commons:open-create";

export function openCreateLauncher() {
  window.dispatchEvent(new Event(OPEN_CREATE_LAUNCHER));
}

export function CreateLauncher() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_CREATE_LAUNCHER, show);
    return () => window.removeEventListener(OPEN_CREATE_LAUNCHER, show);
  }, []);

  if (!open) return null;

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <BottomSheet
      className="create-launcher-sheet"
      labelledBy="create-launcher-title"
      onClose={() => setOpen(false)}
    >
      <div className="create-launcher-head">
        <div>
          <p className="create-launcher-eyebrow">Start something</p>
          <h2 id="create-launcher-title">What do you have in mind?</h2>
        </div>
        <button type="button" className="create-launcher-close" aria-label="Close" onClick={() => setOpen(false)}>
          <X size={19} strokeWidth={2} />
        </button>
      </div>
      <div className="create-launcher-tiles">
        <button type="button" className="create-tile create-tile--plan" onClick={() => go("/plans/new?kind=plan")}>
          <span className="create-tile-icon" aria-hidden="true">
            <CalendarDays size={24} />
          </span>
          <span className="create-tile-copy">
            <strong>Make a plan</strong>
            <small>Set the details and see who&apos;s in.</small>
          </span>
          <ChevronRight size={20} aria-hidden="true" />
        </button>
        <button type="button" className="create-tile create-tile--idea" onClick={() => go("/plans/new?kind=idea")}>
          <span className="create-tile-icon" aria-hidden="true">
            <Lightbulb size={24} />
          </span>
          <span className="create-tile-copy">
            <strong>Just an idea</strong>
            <small>See who&apos;s interested before committing.</small>
          </span>
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
      <button type="button" className="create-community-link" onClick={() => go("/communities/new")}>
        Building something ongoing? <strong>Create a community →</strong>
      </button>
    </BottomSheet>
  );
}
