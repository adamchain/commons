import type { PlanDTO } from "../types/shared";

// Deep links to the major maps + rideshare apps. PRD §17.
export function GetThereSheet({ plan, onClose }: { plan: PlanDTO; onClose: () => void }) {
  const dest = encodeURIComponent(plan.location.address || plan.location.name);
  const lat = plan.location.lat;
  const lng = plan.location.lng;

  const links: Array<{ label: string; href: string }> = [
    {
      label: "🚗 Uber",
      href:
        lat !== undefined && lng !== undefined
          ? `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=${lat}&dropoff[longitude]=${lng}&dropoff[nickname]=${dest}`
          : `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[nickname]=${dest}`,
    },
    {
      label: "🚙 Lyft",
      href:
        lat !== undefined && lng !== undefined
          ? `https://lyft.com/ride?id=lyft&destination[latitude]=${lat}&destination[longitude]=${lng}`
          : `https://lyft.com/ride?id=lyft`,
    },
    {
      label: "🗺 Apple Maps",
      href:
        lat !== undefined && lng !== undefined
          ? `https://maps.apple.com/?daddr=${lat},${lng}`
          : `https://maps.apple.com/?q=${dest}`,
    },
    {
      label: "🌎 Google Maps",
      href: `https://www.google.com/maps/dir/?api=1&destination=${dest}`,
    },
  ];

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-title">Get there</div>
        {links.map((l) => (
          <a key={l.label} className="sheet-link" href={l.href} target="_blank" rel="noopener noreferrer">
            {l.label}
          </a>
        ))}
        <button className="btn-link sheet-cancel" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
