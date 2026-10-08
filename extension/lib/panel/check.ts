// Runs one check from "Check listing" to a result: prepare the photos, submit ONCE, then follow
// the five processing stages until the result is ready.
//
// All side effects (the API client, photo preparation, waiting, and the progress callbacks) are
// passed in as `deps`, so this logic is tested with fakes and no real timers.
//
// Behaviour worth knowing:
//   - if no photo can be prepared nothing is submitted;
//   - the buyer is told once, after SLOW_AFTER_MS, that the check is taking longer than usual
//     (no percentages and no fake progress);
//   - polling stops when the buyer cancels and gives up after GIVE_UP_AFTER_MS, so a stuck
//     server can never leave the panel spinning forever.
import type { AssessmentResult, GuardianLensClient, PipelineStage } from "@guardianlens/shared";
import { buildForm, type Draft } from "./draft";
import { FAILED_MESSAGE, NO_PHOTOS_MESSAGE, mapApiError, type MappedError } from "./errors";
import type { PreparedPhotos } from "./photos";

/** How often the status endpoint is polled. */
export const POLL_INTERVAL_MS = 900;
/** After this long the buyer is told the check is taking longer than usual. */
export const SLOW_AFTER_MS = 8_000;
/** After this long the check is abandoned with a failure message. */
export const GIVE_UP_AFTER_MS = 120_000;

/** Everything runCheck needs from the outside world. */
export interface CheckDeps {
  client: Pick<GuardianLensClient, "submit" | "getStatus" | "getResult">;
  preparePhotos(urls: string[]): Promise<PreparedPhotos>;
  /** Resolves after `ms` milliseconds (replaced by an instant fake in tests). */
  wait(ms: number): Promise<void>;
  /** The API accepted the submission. */
  onAccepted(assessmentId: string): void;
  /** The API reported the stage that is running (null when none is). */
  onStage(stage: PipelineStage | null): void;
  /** The check has taken longer than SLOW_AFTER_MS. Called at most once. */
  onSlow(): void;
  /** True once the buyer pressed Cancel. */
  isCancelled(): boolean;
}

/** How a check ended. */
export type CheckOutcome =
  | { status: "done"; result: AssessmentResult; skippedPhotos: number }
  | { status: "error"; error: MappedError }
  | { status: "cancelled" };

/**
 * Runs one check.
 * @param draft A draft that already passed validation.
 * @returns The result, an error for the panel to show, or "cancelled".
 */
export async function runCheck(draft: Draft, deps: CheckDeps): Promise<CheckOutcome> {
  const urls = draft.photos.filter((photo) => photo.selected).map((photo) => photo.url);
  const prepared = await deps.preparePhotos(urls);
  if (prepared.files.length === 0) {
    return {
      status: "error",
      error: { target: "review", fieldErrors: { photos: NO_PHOTOS_MESSAGE } },
    };
  }

  try {
    const accepted = await deps.client.submit(buildForm(draft, prepared.files));
    deps.onAccepted(accepted.assessment_id);

    let waited = 0;
    let slowReported = false;
    while (waited < GIVE_UP_AFTER_MS) {
      if (deps.isCancelled()) return { status: "cancelled" };
      const status = await deps.client.getStatus(accepted.assessment_id);
      deps.onStage(status.stage);
      if (status.status === "complete") {
        const result = await deps.client.getResult(accepted.assessment_id);
        return { status: "done", result, skippedPhotos: prepared.skipped };
      }
      if (status.status === "failed" || status.status === "abandoned") {
        return {
          status: "error",
          error: {
            target: "failure",
            kind: "failed",
            message: status.message ?? FAILED_MESSAGE,
          },
        };
      }
      await deps.wait(POLL_INTERVAL_MS);
      waited += POLL_INTERVAL_MS;
      if (!slowReported && waited >= SLOW_AFTER_MS) {
        slowReported = true;
        deps.onSlow();
      }
    }
    return {
      status: "error",
      error: {
        target: "failure",
        kind: "failed",
        message: "The check is taking too long. Try again.",
      },
    };
  } catch (error) {
    return { status: "error", error: mapApiError(error) };
  }
}
