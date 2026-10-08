// Landing page (S1): says what GuardianLens checks, what it cannot guarantee, and how data is
// handled, and leads with the browser extension, the main way to use the product. The manual form
// stays available as the secondary action.
//
// Install steps describe loading the extension unpacked, because this is a research prototype that
// is not published on a web store. The zip is produced by `npm run package:site -w extension`.
import Link from "next/link";
import { InferenceStatus } from "@/components/InferenceStatus";

/** Renders the landing page: the pitch, the extension download and install steps, and the notes. */
export default function HomePage() {
  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Pre-purchase decision support</p>
        <h1>Check a marketplace listing before you pay.</h1>
        <p>
          GuardianLens reviews listing photos, wording, and visible seller details, then explains
          the warning signs it found and what you should verify yourself.
        </p>
        <InferenceStatus />
        <div className="hero-actions">
          <a
            className="button button-primary"
            href="/downloads/guardianlens-extension.zip"
            download
          >
            Get the extension
          </a>
          <Link className="button button-secondary" href="/assess">
            Enter a listing manually
          </Link>
        </div>
      </section>

      <section className="card install-card" aria-labelledby="install-heading">
        <h2 id="install-heading">Install the extension</h2>
        <ol className="install-steps">
          <li>Download the extension zip above and unzip it.</li>
          <li>
            Open <code>chrome://extensions</code> (or <code>edge://extensions</code>) and turn on
            Developer mode.
          </li>
          <li>Choose Load unpacked and select the unzipped folder.</li>
          <li>
            Open a Mudah.my or Carousell listing and click the GuardianLens icon. The result appears
            beside the page.
          </li>
        </ol>
        <p className="helper">
          The extension reads a listing only when you click its icon, and only that one page. This
          prototype is loaded unpacked rather than from a web store.
        </p>
      </section>

      <section id="how-it-works" className="explainer-grid" aria-label="How GuardianLens works">
        <article className="explainer-card">
          <h2>What it checks</h2>
          <p>Photos, listing text, and the seller details that are visible to you.</p>
        </article>
        <article className="explainer-card">
          <h2>What it cannot guarantee</h2>
          <p>A score is a second opinion. It cannot confirm that a seller or listing is safe.</p>
        </article>
        <article className="explainer-card">
          <h2>How data is handled</h2>
          <p>
            Raw text is scrubbed for contact details before storage. The retention period is still
            awaiting approval.
          </p>
        </article>
      </section>

      {/* The closing call to action repeats the page's one primary action; the manual form stays secondary. */}
      <div className="hero-actions">
        <a className="button button-primary" href="/downloads/guardianlens-extension.zip" download>
          Get the extension
        </a>
        <Link className="button button-secondary" href="/assess">
          Enter a listing manually
        </Link>
      </div>
      <p className="footer-note">
        Designed for Mudah.my and Carousell product listings in English, Malay, or mixed text.
      </p>
    </main>
  );
}
