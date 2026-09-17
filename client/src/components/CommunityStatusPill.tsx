import type { CommunityMemberStatus } from "../types/shared";

/** Label for a viewer's community membership. Pending requests are never "Joined". */
export function communityMembershipLabel(
  status: CommunityMemberStatus | null | undefined,
): "Joined" | "Requested" | null {
  if (status === "active") return "Joined";
  if (status === "pending") return "Requested";
  return null;
}

export function CommunityStatusPill({
  status,
  className,
}: {
  status: CommunityMemberStatus | null | undefined;
  className?: string;
}) {
  const label = communityMembershipLabel(status);
  if (!label) return null;
  return (
    <span
      className={[
        "community-status-pill",
        label === "Joined" ? "community-status-pill--joined" : "community-status-pill--requested",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {label}
    </span>
  );
}
