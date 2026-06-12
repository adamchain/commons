import type { PlanDTO } from "../types/shared";

// Deep links to the major maps + rideshare apps. PRD §17.
//
// Coords first, text fallback — every link prefers lat/lng so the pin lands on
// the actual venue instead of a fuzzy address match (which often dropped users
// at a generic city center).
export function GetThereSheet({ plan, onClose }: { plan: PlanDTO; onClose: () => void }) {
  const name = plan.location.name;
  const address = plan.location.address || name;
  const dest = encodeURIComponent(address);
  const named = encodeURIComponent(name);
  const lat = plan.location.lat;
  const lng = plan.location.lng;
  const hasCoords = lat !== undefined && lng !== undefined;

  const links: Array<{ label: string; href: string }> = [
    {
      label: "🚗 Uber",
      href: hasCoords
        ? `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=${lat}&dropoff[longitude]=${lng}&dropoff[nickname]=${named}`
        : `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[nickname]=${named}`,
    },
    {
      label: "🚙 Lyft",
      href: hasCoords
        ? `https://lyft.com/ride?id=lyft&destination[latitude]=${lat}&destination[longitude]=${lng}`
        : `https://lyft.com/ride?id=lyft`,
    },
    {
      label: "🗺 Apple Maps",
      href: hasCoords
        ? `https://maps.apple.com/?daddr=${lat},${lng}&q=${named}`
        : `https://maps.apple.com/?q=${dest}`,
    },
    {
      label: "🌎 Google Maps",
      href: hasCoords
        ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
        : `https://www.google.com/maps/dir/?api=1&destination=${dest}`,
    },
  ];

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-title">Get there</div>
        <div className="sheet-destination">
          <div className="sheet-destination-name">{name}</div>
          {address && address !== name && (
            <div className="sheet-destination-addr">{address}</div>
          )}
        </div>
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
