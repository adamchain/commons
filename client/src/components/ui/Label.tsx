import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

/** Section label above rows/groups — 10px / 600 / muted / UPPERCASE / ls 1.5 */
export function Label({ children, className = "" }: Props) {
  return <div className={`ui-label ${className}`.trim()}>{children}</div>;
}
