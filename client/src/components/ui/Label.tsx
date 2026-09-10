import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

/** Section label — Label role: 10px / 600 / muted / uppercase / tracked. */
export function Label({ children, className = "" }: Props) {
  return <div className={`ui-label ${className}`.trim()}>{children}</div>;
}
