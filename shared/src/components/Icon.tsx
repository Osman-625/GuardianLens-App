// Decorative icons as inline SVG, one small set shared by the website and the side panel.
//
// Why SVG and not text glyphs: the Design Brief asks for a DISTINCT icon shape per risk band (tick
// circle, alert triangle, alert octagon) so that colour is never the only difference, and for
// neutral glyphs for the three signals. Inline SVG scales cleanly, takes the colour of the text
// around it (stroke is currentColor), and is hidden from screen readers because the meaning is
// always also written as words next to it.
import type { ReactElement } from "react";

/** Every icon the product uses. */
export type IconName =
  | "tick-circle"
  | "alert-triangle"
  | "alert-octagon"
  | "question-circle"
  | "image"
  | "text-lines"
  | "person-clock"
  | "chevron-right"
  | "check";

// The drawing of each icon on a 24 x 24 grid. Small filled circles are the dots of "!" and "?".
const SHAPES: Record<IconName, ReactElement> = {
  "tick-circle": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.7 2.7L16 9.5" />
    </>
  ),
  "alert-triangle": (
    <>
      <path d="M12 3.5L2.8 19.5h18.4L12 3.5z" />
      <path d="M12 10v4.5" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  "alert-octagon": (
    <>
      <path d="M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3L8.3 3z" />
      <path d="M12 8v5" />
      <circle cx="12" cy="16" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  "question-circle": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.6" />
      <circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M21 16l-5-5-8 9" />
    </>
  ),
  "text-lines": <path d="M4 6h16M4 10h16M4 14h10M4 18h12" />,
  "person-clock": (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6" />
      <circle cx="17" cy="16" r="4" />
      <path d="M17 14v2.2l1.4 1" />
    </>
  ),
  "chevron-right": <path d="M9 6l6 6-6 6" />,
  check: <path d="M5 12.5l4.2 4.2L19 7" />,
};

/** Props of an icon: which drawing to show, and optional extra class names. */
export interface IconProps {
  name: IconName;
  /** Extra class names, added after the base "icon" class. */
  className?: string;
}

/**
 * Renders one icon. It is always decorative (aria-hidden, not focusable): wherever an icon carries
 * meaning, that meaning is also written as text beside it.
 */
export function Icon({ name, className }: IconProps) {
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      data-icon={name}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {SHAPES[name]}
    </svg>
  );
}
