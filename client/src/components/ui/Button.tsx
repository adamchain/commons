import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "link";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  block?: boolean;
  children: ReactNode;
};

/**
 * Shared button. Primary = solid red #C13B3B; disabled = same red at 38% opacity.
 */
export function Button({
  variant = "primary",
  block = false,
  className = "",
  children,
  type = "button",
  ...rest
}: Props) {
  const base =
    variant === "primary"
      ? "btn-primary"
      : variant === "secondary"
        ? "btn-secondary"
        : variant === "link"
          ? "btn-link"
          : "btn-pill-ghost";
  return (
    <button
      type={type}
      className={`${base}${block ? " btn-block" : ""} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
