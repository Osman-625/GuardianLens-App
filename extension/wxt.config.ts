// WXT build configuration: how the extension's manifest is generated.
//
// Permissions are deliberately minimal and match the click-only capture design:
//   activeTab  - temporary access to the current tab, granted only when the buyer clicks the icon;
//   scripting  - lets that click inject the capture script into the tab;
//   storage    - keeps the session token and the unsent draft (cleared when the browser closes);
//   sidePanel  - shows the result next to the page.
// host_permissions lists ONLY hosts the extension itself fetches from: the GuardianLens API and
// the listing-photo CDNs. The Mudah.my and Carousell sites are NOT listed, so the extension has
// no standing access to them; it can read a listing only on the click that grants activeTab.
import { defineConfig } from "wxt";
import { IMAGE_HOST_PATTERNS } from "./lib/hosts";

// The API origin is a build-time setting (WXT_API_BASE_URL), so switching to a hosted API is a
// rebuild, not a code change.
const apiOrigin = new URL(process.env.WXT_API_BASE_URL ?? "http://localhost:8000").origin;

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "GuardianLens",
    description: "Check a Mudah.my or Carousell listing for warning signs before you pay.",
    permissions: ["activeTab", "scripting", "storage", "sidePanel"],
    host_permissions: [`${apiOrigin}/*`, ...IMAGE_HOST_PATTERNS],
    // An action with no popup: clicking the icon fires action.onClicked (entrypoints/background.ts).
    action: { default_title: "Check this listing with GuardianLens" },
  },
});
