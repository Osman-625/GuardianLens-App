// Pins what happens when the buyer clicks the toolbar icon.
// The privacy-critical rule: the capture script is injected ONLY on the two marketplaces. The
// activeTab permission works on any site, so without this guard a click on, say, a banking tab
// would inject our script. On other sites the click must only report "unsupported".
// Dependencies are injected so the tests need no real browser tabs.
import { describe, expect, it, vi } from "vitest";
import { runCaptureForTab, type CaptureJob, type RunnerDeps } from "../../lib/capture/runner";
import type { CaptureResult } from "../../lib/capture/types";

// The answer the fake capture script gives when asked to read the page.
const LISTING_RESULT: CaptureResult = {
  kind: "unsupported",
  reason: "not_a_listing",
};

/** Builds fake dependencies that record every state the runner writes. */
function fakeDeps(overrides: Partial<RunnerDeps> = {}) {
  const states: CaptureJob[] = [];
  const deps: RunnerDeps = {
    writeState: async (job) => void states.push(job),
    inject: vi.fn(async () => undefined),
    request: vi.fn(async () => LISTING_RESULT),
    now: () => 111,
    ...overrides,
  };
  return { deps, states };
}

describe("runCaptureForTab", () => {
  it("does not inject anything on a site that is not a supported marketplace", async () => {
    const { deps, states } = fakeDeps();
    await runCaptureForTab({ id: 7, url: "https://example.com/account" }, deps);
    expect(deps.inject).not.toHaveBeenCalled();
    expect(states).toEqual([
      {
        id: 111,
        tabId: 7,
        status: "done",
        result: { kind: "unsupported", reason: "unsupported_site" },
      },
    ]);
  });

  it("does not inject when the tab has no readable URL", async () => {
    const { deps, states } = fakeDeps();
    await runCaptureForTab({ id: 7 }, deps);
    expect(deps.inject).not.toHaveBeenCalled();
    expect(states[0]?.result).toEqual({
      kind: "unsupported",
      reason: "unsupported_site",
    });
  });

  it("writes capturing, then the result, on a marketplace page", async () => {
    const { deps, states } = fakeDeps();
    await runCaptureForTab({ id: 7, url: "https://www.carousell.com.my/p/x-123/" }, deps);
    expect(deps.inject).toHaveBeenCalledWith(7);
    expect(states.map((state) => state.status)).toEqual(["capturing", "done"]);
    expect(states[1]?.result).toEqual(LISTING_RESULT);
  });

  it("reports inject_failed when the script cannot be injected", async () => {
    const { deps, states } = fakeDeps({
      inject: vi.fn(async () => {
        throw new Error("no access");
      }),
    });
    await runCaptureForTab({ id: 7, url: "https://www.mudah.my/phone-123456.htm" }, deps);
    expect(states.at(-1)).toMatchObject({
      status: "error",
      error: "inject_failed",
    });
  });

  it("reports no_response when the script does not answer", async () => {
    const { deps, states } = fakeDeps({
      request: vi.fn(async () => undefined),
    });
    await runCaptureForTab({ id: 7, url: "https://www.mudah.my/phone-123456.htm" }, deps);
    expect(states.at(-1)).toMatchObject({
      status: "error",
      error: "no_response",
    });
  });
});
