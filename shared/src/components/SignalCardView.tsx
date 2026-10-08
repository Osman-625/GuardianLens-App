// One signal card (visual, textual, or behavioural). All three use this single template so
// they read as a set (Design Brief: Similarity rule).
import type { ElementType, ReactNode } from "react";
import { SIGNAL_ICONS, SIGNAL_NAMES } from "../copy";
import type { SignalCard } from "../types";
import { Icon } from "./Icon";

/** The props a link component must accept. A plain <a> and Next.js's Link both do. */
interface LinkProps {
  href: string;
  className?: string;
  children: ReactNode;
}

/** Props of a signal card: the card data plus how, if at all, the card can be opened. */
export interface SignalCardViewProps {
  card: SignalCard;
  /** Where the card links to (its section on the explanation page). Omit for a button/plain card. */
  href?: string;
  /** Link component used when `href` is set. Defaults to a plain anchor; the website passes next/link. */
  LinkComponent?: ElementType<LinkProps>;
  /**
   * When there is no `href`, the card is a link whose click calls this instead of navigating
   * (the side panel opens the website itself, with a session handoff it must build first).
   */
  onOpen?: () => void;
}

/**
 * Renders a signal card. An unavailable signal gets the dashed `signal-unavailable` style plus a
 * question icon beside its status word, and keeps the API's summary text, which says the signal is
 * unknown rather than safe or suspicious. With neither `href` nor `onOpen` it is a plain,
 * non-interactive card.
 */
export function SignalCardView({ card, href, LinkComponent, onOpen }: SignalCardViewProps) {
  const className = `signal-card ${card.available ? "" : "signal-unavailable"}`.trim();
  const body = (
    <>
      <div className="signal-heading">
        <span className="signal-icon">
          <Icon name={SIGNAL_ICONS[card.signal]} />
        </span>
        <div>
          <h2>{SIGNAL_NAMES[card.signal]}</h2>
          <span className="signal-status">
            {!card.available && <Icon name="question-circle" />}
            {card.status_word}
          </span>
        </div>
        <span className="chevron">
          <Icon name="chevron-right" />
        </span>
      </div>
      <p>{card.summary}</p>
    </>
  );

  if (href !== undefined) {
    const Link: ElementType<LinkProps> = LinkComponent ?? "a";
    return (
      <Link className={className} href={href}>
        {body}
      </Link>
    );
  }
  if (onOpen) {
    // href="#" keeps it a real, keyboard-focusable link; preventDefault stops the jump to "#".
    return (
      <a
        className={className}
        href="#"
        onClick={(event) => {
          event.preventDefault();
          onOpen();
        }}
      >
        {body}
      </a>
    );
  }
  return <div className={className}>{body}</div>;
}
