import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: ReactNode;
  className?: string;
};

/** Screen title with red underline bar — Messages, Profile section heads, etc. */
export function ScreenTitle({ title, subtitle, className = "" }: Props) {
  return (
    <div className={`screen-title ${className}`.trim()}>
      <h1 className="screen-title-text">{title}</h1>
      <div className="screen-title-bar" aria-hidden="true" />
      {subtitle != null && subtitle !== false && (
        <p className="screen-title-sub">{subtitle}</p>
      )}
    </div>
  );
}
