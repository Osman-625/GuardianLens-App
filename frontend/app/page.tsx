// Landing page (S1): leads with the browser extension, the main way to use the product, and says
// what GuardianLens checks, what it cannot guarantee, and how data is handled. The manual form
// stays available as the secondary action. It shows no example score: every number on this site
// comes from a real check, so a made-up one would be a false claim.
//
// Install steps describe loading the extension unpacked, because this is a research prototype that
// is not published on a web store. The zip is built with the site (frontend's prebuild script).
import Link from "next/link";
import { Icon } from "@guardianlens/shared";
import { InferenceStatus } from "@/components/InferenceStatus";

// The three steps of using the product, shown under the hero.
const STEPS: ReadonlyArray<{ title: string; text: string }> = [
  {
    title: "Open the browser extension",
    text: "Click GuardianLens on a supported product page. Review the captured fields before checking the listing.",
  },
  {
    title: "Review the three signals",
    text: "The side panel shows the score and, for photos, wording and seller details, the main factor behind each.",
  },
  {
    title: "Read the full report",
    text: "Open the same assessment on the website for every reason and suggested independent checks.",
  },
];

/** Renders the landing page: the pitch, the extension download and install steps, and the notes. */
export default function HomePage() {
  return (
    <main className="page page-wide">
      <section className="hero">
        <p className="eyebrow">Browser extension · Carousell &amp; Mudah.my</p>
        <h1>
          Check the listing <span className="hero-accent">where you find it.</span>
        </h1>
        <p className="hero-lead">
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
            <Icon name="arrow-right" />
          </a>
          <Link className="button button-secondary" href="/assess">
            Enter a listing manually
          </Link>
        </div>
        <p className="hero-note">
          <Icon name="lock" /> No buyer account required
        </p>
      </section>

      <section className="card install-card" aria-labelledby="install-heading">
        <h2 id="install-heading">Install the extension</h2>
        <ol className="install-steps">
          <li>Download the extension zip and unzip it.</li>
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

      <section className="process" aria-labelledby="process-heading">
        <div>
          <p className="eyebrow">The process</p>
          <h2 id="process-heading" className="section-title">
            Three sources of evidence. One clearer picture.
          </h2>
        </div>
        {/* role="list" keeps list semantics in Safari, which drops them when list-style is none. */}
        <ol className="steps" role="list">
          {STEPS.map(({ title, text }) => (
            <li key={title}>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="notice scope-banner" aria-label="What GuardianLens cannot do">
        <Icon name="info" />
        <div>
          <strong>Designed to support your judgement</strong>
          <p>
            GuardianLens estimates listing risk from available signals. It cannot verify a
            seller&apos;s identity, confirm a transaction is genuine, or guarantee that a listing is
            safe.
          </p>
          <p>
            Raw text is scrubbed for contact details before storage. The retention period is still
            awaiting approval.
          </p>
        </div>
      </section>

      <p className="footer-note">
        Works on Mudah.my and Carousell product listings written in English, Malay, or a mix.
      </p>
    </main>
  );
}
