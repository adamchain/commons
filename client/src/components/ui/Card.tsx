import type { HTMLAttributes, ReactNode } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  padded?: boolean;
};

/** Surface card with the shared warm shadow + inner light line. */
export function Card({ children, padded = true, className = "", ...rest }: Props) {
  return (
    <div className={`ui-card${padded ? " ui-card--padded" : ""} ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}
