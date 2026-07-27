import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  /** Tan fill (default) vs outline-only */
  tone?: "tan" | "outline" | "red-outline";
  children: ReactNode;
};

/**
 * Interest / toggle chip. Outside onboarding, prefer tan fill.
 * Selected states use red outline on white when tone="red-outline".
 */
export function Chip({
  active = false,
  tone = "tan",
  className = "",
  children,
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`ui-chip ui-chip--${tone}${active ? " is-active" : ""} ${className}`.trim()}
      aria-pressed={active}
      {...rest}
    >
      {children}
    </button>
  );
}
