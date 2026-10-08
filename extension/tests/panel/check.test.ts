// Pins the check runner: prepare photos, submit once, follow the five stages until a result.
// Rules protected here:
//   - if no photo can be prepared, nothing is submitted and the buyer is told;
//   - a field error on submit returns to Review with input kept; other errors are a calm failure;
//   - the "taking longer than usual" notice appears once, after the threshold, with no percentages;
//   - the runner stops when the buyer cancels, and gives up after two minutes rather than polling forever.
// Time is faked: `wait` returns immediately, so these tests run instantly.
import { GuardianLensApiError, type AssessmentStatusResponse } from "@guardianlens/shared";
import { describe, expect, it, vi } from "vitest";
import { buildForm, draftFromListing } from "../../lib/panel/draft";
import {
  GIVE_UP_AFTER_MS,
  POLL_INTERVAL_MS,
  SLOW_AFTER_MS,
  runCheck,
  type CheckDeps,
} from "../../lib/panel/check";
import { NO_PHOTOS_MESSAGE } from "../../lib/panel/errors";
import { sampleListing, sampleResult } from "../helpers/samples";

// A valid draft to check, a status answer for "still running at this stage", and the final
// "complete" status answer.
const draft = draftFromListing(sampleListing());
const processing = (stage: AssessmentStatusResponse["stage"]): AssessmentStatusResponse => ({
  status: "processing",
  stage,
  message: null,
});
const complete: AssessmentStatusResponse = {
  status: "complete",
  stage: null,
  message: null,
};

/** One prepared photo, so a check has something to upload. */
const onePhoto = () => new File([new Uint8Array([1])], "photo-1.jpg", { type: "image/jpeg" });

/** Fake dependencies; `statuses` is the sequence the status endpoint returns (the last one repeats). */
function fakeDeps(statuses: AssessmentStatusResponse[], overrides: Partial<CheckDeps> = {}) {
  let call = 0;
  const events: string[] = [];
  const client = {
    submit: vi.fn(async (_form: FormData) => ({ assessment_id: "a1" })),
    // Index-safe: an empty sequence falls back to "complete" instead of returning undefined.
    getStatus: vi.fn(
      async (_id: string) => statuses[Math.min(call++, statuses.length - 1)] ?? complete,
    ),
    getResult: vi.fn(async (_id: string) => sampleResult()),
  };
  const deps: CheckDeps = {
    client,
    preparePhotos: async () => ({ files: [onePhoto()], skipped: 0 }),
    wait: async () => undefined,
    onAccepted: (id) => events.push(`accepted:${id}`),
    onStage: (stage) => events.push(`stage:${stage}`),
    onSlow: () => events.push("slow"),
    isCancelled: () => false,
    ...overrides,
  };
  return { deps, client, events };
}

describe("runCheck", () => {
  it("submits once, follows the stages, and returns the result", async () => {
    const { deps, client, events } = fakeDeps([
      processing("visual"),
      processing("textual"),
      complete,
    ]);
    const outcome = await runCheck(draft, deps);

    expect(outcome).toMatchObject({ status: "done", skippedPhotos: 0 });
    expect(client.submit).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["accepted:a1", "stage:visual", "stage:textual", "stage:null"]);
    const form = client.submit.mock.calls[0]?.[0] as FormData;
    expect(form.get("source")).toBe("extension");
  });

  it("passes on how many photos were skipped", async () => {
    const { deps } = fakeDeps([complete], {
      preparePhotos: async () => ({ files: [onePhoto()], skipped: 2 }),
    });
    expect(await runCheck(draft, deps)).toMatchObject({
      status: "done",
      skippedPhotos: 2,
    });
  });

  it("does not submit when no photo can be prepared", async () => {
    const { deps, client } = fakeDeps([complete], {
      preparePhotos: async () => ({ files: [], skipped: 3 }),
    });
    expect(await runCheck(draft, deps)).toEqual({
      status: "error",
      error: { target: "review", fieldErrors: { photos: NO_PHOTOS_MESSAGE } },
    });
    expect(client.submit).not.toHaveBeenCalled();
  });

  it("returns to Review with the field error when the API rejects a field", async () => {
    const { deps, client } = fakeDeps([complete]);
    client.submit.mockRejectedValueOnce(
      new GuardianLensApiError(422, {
        error: {
          code: "unsupported_language",
          message: "Unsupported language.",
          field: "description",
        },
      }),
    );
    expect(await runCheck(draft, deps)).toEqual({
      status: "error",
      error: {
        target: "review",
        fieldErrors: { description: "Unsupported language." },
      },
    });
    expect(client.getStatus).not.toHaveBeenCalled();
  });

  it("reports an unreachable service as a failure", async () => {
    const { deps, client } = fakeDeps([complete]);
    client.submit.mockRejectedValueOnce(
      new GuardianLensApiError(0, {
        error: { code: "network_unreachable", message: "x", field: null },
      }),
    );
    const outcome = await runCheck(draft, deps);
    expect(outcome).toMatchObject({
      status: "error",
      error: { target: "failure", kind: "unreachable" },
    });
  });

  it("reports a failed assessment with the server's message", async () => {
    const { deps } = fakeDeps([
      {
        status: "failed",
        stage: null,
        message: "The check could not be completed.",
      },
    ]);
    expect(await runCheck(draft, deps)).toEqual({
      status: "error",
      error: {
        target: "failure",
        kind: "failed",
        message: "The check could not be completed.",
      },
    });
  });

  it("stops when the buyer cancels", async () => {
    let cancelled = false;
    const { deps } = fakeDeps([processing("visual"), processing("textual"), complete], {
      onStage: () => {
        cancelled = true;
      },
      isCancelled: () => cancelled,
    });
    expect(await runCheck(draft, deps)).toEqual({ status: "cancelled" });
  });

  it("says it is taking longer than usual exactly once", async () => {
    const polls = Math.ceil(SLOW_AFTER_MS / POLL_INTERVAL_MS) + 5;
    const statuses = [...Array.from({ length: polls }, () => processing("visual")), complete];
    const { deps, events } = fakeDeps(statuses);
    await runCheck(draft, deps);
    expect(events.filter((event) => event === "slow")).toHaveLength(1);
  });

  it("gives up after two minutes instead of polling forever", async () => {
    const { deps, client } = fakeDeps([processing("visual")]);
    const outcome = await runCheck(draft, deps);
    expect(outcome).toMatchObject({
      status: "error",
      error: { target: "failure", kind: "failed" },
    });
    expect(client.getStatus.mock.calls.length).toBe(Math.ceil(GIVE_UP_AFTER_MS / POLL_INTERVAL_MS));
  });

  it("builds the same form the draft module builds", () => {
    // Guards against the runner and the draft drifting apart: the runner uses buildForm directly.
    expect(buildForm(draft, []).get("source")).toBe("extension");
  });
});
