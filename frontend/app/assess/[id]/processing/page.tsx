// Processing page for the website's manual form: shows the five pipeline stages while the check
// runs, polling the status endpoint until the result is ready, then opens the result page. (The
// browser extension shows the same stages inside its side panel.) Stage labels, the stage list, and
// the "taking longer than usual" sentence come from @guardianlens/shared so both surfaces match.
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { SLOW_WAIT_COPY, StageList, type PipelineStage } from "@guardianlens/shared";
import { apiFetch } from "@/lib/api";

/** Renders the progress screen and follows the check until it completes, fails, or is cancelled. */
export default function ProcessingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [stage, setStage] = useState<PipelineStage | null>("visual");
  const [failure, setFailure] = useState<string | null>(null);
  const [longWait, setLongWait] = useState(false);

  useEffect(() => {
    let active = true;
    // After 8 seconds the page says so honestly; there is no percentage or fake progress.
    const slowTimer = window.setTimeout(() => setLongWait(true), 8000);

    // Asks for the status, shows the current stage, and asks again 900 ms later until the check
    // is complete (open the result) or has failed or been abandoned (show the reason).
    async function poll() {
      try {
        const result = await apiFetch<{
          status: string;
          stage: PipelineStage | null;
          message: string | null;
        }>(`/api/v1/assess/${params.id}/status`);
        if (!active) return;
        setStage(result.stage);
        if (result.status === "complete") {
          router.replace(`/assess/${params.id}`);
          return;
        }
        if (result.status === "failed" || result.status === "abandoned") {
          setFailure(result.message ?? "The check could not be completed.");
          return;
        }
        window.setTimeout(poll, 900);
      } catch {
        if (active)
          setFailure("The processing status could not be loaded. Your form draft is still saved.");
      }
    }

    void poll();
    return () => {
      active = false;
      window.clearTimeout(slowTimer);
    };
  }, [params.id, router]);

  // Cancel tells the server to stop, then returns to the saved form whatever the server says.
  async function cancel() {
    try {
      await apiFetch<void>(`/api/v1/assess/${params.id}/cancel`, {
        method: "POST",
      });
    } finally {
      router.push("/assess");
    }
  }

  return (
    <main className="page">
      <section className="card processing-card" aria-live="polite">
        <p className="eyebrow">Assessment in progress</p>
        <h1 className="page-title">Checking the listing</h1>
        {failure ? (
          <>
            <p className="error-text" role="alert">
              {failure}
            </p>
            <button
              className="button button-primary button-full"
              onClick={() => router.push("/assess")}
            >
              Return to saved form
            </button>
          </>
        ) : (
          <>
            <StageList stage={stage} />
            {longWait && <p className="helper">{SLOW_WAIT_COPY}</p>}
            <button className="button button-text" type="button" onClick={cancel}>
              Cancel
            </button>
          </>
        )}
      </section>
    </main>
  );
}
