import type { ButtonHTMLAttributes, ReactNode } from "react";

type TabProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  children: ReactNode;
};

/** Underline tab — muted text, thin red underline when active. */
export function Tab({ active = false, className = "", children, type = "button", ...rest }: TabProps) {
  return (
    <button
      type={type}
      className={`ui-tab${active ? " is-active" : ""} ${className}`.trim()}
      aria-selected={active}
      {...rest}
    >
      {children}
    </button>
  );
}

type TabListProps = {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
};

export function TabList({ children, className = "", ...rest }: TabListProps) {
  return (
    <div className={`ui-tab-list ${className}`.trim()} role="tablist" {...rest}>
      {children}
    </div>
  );
}
