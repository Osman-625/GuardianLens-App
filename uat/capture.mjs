// Isolated UAT URL capture worker. Uses the existing extension's real DOM parsers.
// Run through uat/server.py, never from an untrusted client or the public web directly.
import { build } from "esbuild";
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LISTING_HOSTS = new Set(["mudah.my", "www.mudah.my", "carousell.com.my", "www.carousell.com.my"]);
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_PHOTO_BYTES = 30 * 1024 * 1024;

function forbiddenIP(ip) {
  const v = ip.toLowerCase();
  if (v.includes(":")) {
    if (v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") ||
        v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") ||
        v.startsWith("feb") || v.startsWith("ff")) return true;
    if (v.startsWith("::ffff:")) return forbiddenIP(v.slice(7));
    return false;
  }
  const a = v.split(".").map(Number);
  return a[0] === 0 || a[0] === 10 || a[0] === 127 || a[0] >= 224 ||
    (a[0] === 169 && a[1] === 254) ||
    (a[0] === 172 && a[1] >= 16 && a[1] <= 31) ||
    (a[0] === 192 && a[1] === 168) ||
    (a[0] === 100 && a[1] >= 64 && a[1] <= 127) ||
    (a[0] === 192 && a[1] === 0) ||
    (a[0] === 198 && (a[1] === 18 || a[1] === 19));
}

async function ensureExternal(raw) {
  const url = new URL(raw);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
      (url.port && url.port !== "443" && url.port !== "80")) throw Error("Refused URL");
  if (url.hostname === "localhost" || url.hostname.endsWith(".local") ||
      url.hostname.endsWith(".internal")) throw Error("Refused host");
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(a => forbiddenIP(a.address))) throw Error("Refused private address");
  return url;
}

function captured(field) {
  return field?.status === "captured" ? field.value : null;
}

async function capture() {
  const input = process.argv[2];
  if (!input) throw Error("A listing URL is required");
  const listingURL = await ensureExternal(input);
  if (listingURL.protocol !== "https:" || !LISTING_HOSTS.has(listingURL.hostname)) {
    throw Error("Only HTTPS Mudah or Carousell listing links are supported");
  }

  const bundle = await build({
    entryPoints: [path.join(ROOT, "extension/lib/capture/page.ts")],
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "GuardianCapture",
    write: false,
    logLevel: "silent",
    alias: { "@guardianlens/shared": path.join(ROOT, "shared/src/categories.ts") },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1365, height: 800 } });
    const page = await context.newPage();
    // Requests with private destinations are denied, including redirects and page subresources.
    // Production deployments must ALSO deny private-network egress at the OS/firewall layer.
    await page.route("**/*", async route => {
      try {
        const u = route.request().url();
        if (u.startsWith("data:") || u.startsWith("blob:")) return route.continue();
        await ensureExternal(u);
        return route.continue();
      } catch {
        return route.abort();
      }
    });
    await page.goto(listingURL.href, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(1500);
    const finalURL = new URL(page.url());
    if (!LISTING_HOSTS.has(finalURL.hostname)) throw Error("Marketplace redirected to an unsupported host");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const value = await page.evaluate(() =>
      globalThis.GuardianCapture.captureCurrentPage(document, location.href, new Date()));
    if (value.kind !== "listing") throw Error("The URL did not open a supported product listing");
    const listing = value.listing;
    if (!["ready", "incomplete"].includes(listing.pageState)) {
      throw Error("Marketplace access unavailable: " + listing.pageState);
    }
    const seller = { accountAgeDays: null, rating: null, reviewCount: null, activeListingCount: null };
    // The extension's seller values are on a separate profile page. Fetch only when accessible.
    if (listing.sellerUrl) {
      try {
        const u = await ensureExternal(listing.sellerUrl);
        if (LISTING_HOSTS.has(u.hostname) && u.hostname === finalURL.hostname) {
          await page.goto(u.href, { waitUntil: "domcontentloaded", timeout: 12000 });
          await page.waitForTimeout(700);
          await page.addScriptTag({ content: bundle.outputFiles[0].text });
          const profile = await page.evaluate(() =>
            globalThis.GuardianCapture.captureCurrentPage(document, location.href, new Date()));
          if (profile.kind === "seller" && profile.pageState === "ready") {
            seller.accountAgeDays = captured(profile.seller.accountAgeDays);
            seller.rating = captured(profile.seller.rating);
            seller.reviewCount = captured(profile.seller.reviewCount);
            seller.activeListingCount = captured(profile.seller.activeListingCount);
          }
        }
      } catch { /* Missing seller details remain null, matching existing extension behaviour. */ }
    }

    const images = [];
    let totalBytes = 0;
    for (const url of listing.imageUrls.slice(0, 10)) {
      try {
        await ensureExternal(url);
        const response = await context.request.get(url, { timeout: 8000, maxRedirects: 0 });
        const mime = response.headers()["content-type"]?.split(";")[0]?.trim().toLowerCase();
        const length = Number(response.headers()["content-length"] ?? "0");
        if (!response.ok() || !["image/jpeg", "image/png", "image/webp"].includes(mime) ||
            length > MAX_PHOTO_BYTES) continue;
        const bytes = await response.body();
        if (bytes.length > MAX_PHOTO_BYTES || totalBytes + bytes.length > MAX_TOTAL_PHOTO_BYTES) continue;
        totalBytes += bytes.length;
        images.push({ mime, data: bytes.toString("base64") });
      } catch { /* A blocked or expired image is skipped, never fabricated. */ }
    }
    if (!images.length) throw Error("No listing photos could be downloaded");
    if (captured(listing.title) == null || captured(listing.description) == null ||
        captured(listing.price) == null) throw Error("Required listing fields were not captured");
    return {
      url: listingURL.href,
      adapterVersion: listing.adapterVersion,
      platform: listing.platform,
      marketplaceListingId: listing.marketplaceListingId,
      pageState: listing.pageState,
      title: captured(listing.title),
      description: captured(listing.description),
      price: captured(listing.price),
      category: captured(listing.category) || "other",
      seller,
      images,
    };
  } finally {
    await browser.close();
  }
}

try {
  const result = await capture();
  process.stdout.write(JSON.stringify(result));
} catch (err) {
  process.stderr.write(String(err instanceof Error ? err.message : err));
  process.exitCode = 1;
}
