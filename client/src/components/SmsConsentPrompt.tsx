import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { needsOnboarding } from "../lib/onboarding";
import { BottomSheet, Button } from "./ui";

const STORAGE_KEY = "commons:sms-consent-shown";

export function SmsConsentPrompt() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user || needsOnboarding(user)) return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    setOpen(true);
  }, [user?.id]);

  if (!open) return null;

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  }

  function goToSettings() {
    dismiss();
    navigate("/settings/notifications");
  }

  return (
    <BottomSheet onClose={dismiss} labelledBy="sms-consent-title">
      <h2 id="sms-consent-title" className="sheet-title">A heads-up about texts</h2>
      <p className="sheet-copy">
        COMMONS will send you SMS reminders for upcoming plans — like a day-before nudge so nothing slips through.
        You can turn these off anytime in Notification Settings.
      </p>
      <div className="sheet-actions">
        <Button variant="primary" block onClick={dismiss}>
          Got it
        </Button>
        <Button variant="secondary" block onClick={goToSettings}>
          Manage notifications
        </Button>
      </div>
    </BottomSheet>
  );
}
