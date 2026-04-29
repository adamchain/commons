interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
}

export function Avatar({ name, size = "md" }: AvatarProps) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  const cls = size === "sm" ? "avatar avatar-sm" : size === "lg" ? "avatar avatar-lg" : "avatar";
  return <span className={cls}>{initials || "?"}</span>;
}
