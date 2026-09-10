import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "soft" | "secondary" | "ghost" | "link";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  block?: boolean;
  children: ReactNode;
};

/**
 * Shared button. Primary = brand red; soft = #965252 sibling; secondary = #ab9393 utility.
 * Disabled uses a beige fill — never faded red/pink.
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
      : variant === "soft"
        ? "btn-soft"
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
