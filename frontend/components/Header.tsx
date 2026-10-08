// The site header shown on every page: the GuardianLens wordmark (links home) and a link to this
// session's history.
import Link from "next/link";

/** Renders the site header with the home link and the primary navigation. */
export function Header() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="wordmark" href="/" aria-label="GuardianLens home">
          <span className="lens-mark" aria-hidden="true" />
          GuardianLens
        </Link>
        <nav aria-label="Primary navigation">
          <Link href="/history">This session</Link>
        </nav>
      </div>
    </header>
  );
}
