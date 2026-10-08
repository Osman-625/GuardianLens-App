// Pins the seller-page parsers.
// The behavioural model was trained on seller fields that the Data Collector extracted with an
// LLM under fixed rules (Collector: extraction_contract.py). The extension has no LLM, so these
// parsers must reproduce the SAME conventions or the model would see inputs unlike its training
// data. The conventions pinned here:
//   - account age in days: a stated duration is 1 year = 365 days and 1 month = 30 days; a stated
//     join date counts the days from that date to today;
//   - "No reviews yet" means review count 0 (and rating 0.0 when no rating is shown);
//   - active listings are the listing cards NOT marked SOLD; a "Listings" heading with no cards
//     is 0; no heading and no cards is "not found" (null).
import { describe, expect, it } from "vitest";
import {
  countActiveListings,
  parseAccountAgeDays,
  parseReviewStats,
  parseSellerPage,
} from "../../lib/capture/seller";
import { parseHtml } from "../helpers/realFixtures";

// "Today" for every date calculation, so the tests do not depend on the real clock.
const NOW = new Date(Date.UTC(2026, 9, 5));
// A seller page URL against which relative listing links are resolved.
const BASE = "https://www.carousell.com.my/u/someone/";

describe("parseAccountAgeDays", () => {
  it.each([
    ["Joined 3 years 2 months ago", 1155],
    ["Joined 11 years ago", 4015],
    ["Joined 8 months ago", 240],
    ["Been on Carousell for 2 years", 730],
  ])("converts the stated duration in %s", (text, days) => {
    expect(parseAccountAgeDays(text, NOW)).toBe(days);
  });

  it.each([["Joined Since 21 May 2020"], ["Member since May 21, 2020"]])(
    "counts the days from a stated join date in %s",
    (text) => {
      // 21 May 2020 to 5 Oct 2026 is 2328 days.
      expect(parseAccountAgeDays(text, NOW)).toBe(2328);
    },
  );

  it("does not guess from a year alone", () => {
    expect(parseAccountAgeDays("Member since 2019", NOW)).toBeNull();
  });

  it("ignores a duration that is not about the account", () => {
    expect(parseAccountAgeDays("Usually replies within 3 months", NOW)).toBeNull();
  });

  it("rejects a join date in the future and an impossible date", () => {
    expect(parseAccountAgeDays("Joined 1 Jan 2030", NOW)).toBeNull();
    expect(parseAccountAgeDays("Joined 31 Feb 2020", NOW)).toBeNull();
  });
});

describe("parseReviewStats", () => {
  it("reads a combined rating and count", () => {
    expect(parseReviewStats("4.8 (17 reviews)")).toEqual({
      rating: 4.8,
      reviewCount: 17,
    });
  });

  it("reads separate rating and count", () => {
    expect(parseReviewStats("Rating 4.5 out of 5 · 1,120 reviews")).toEqual({
      rating: 4.5,
      reviewCount: 1120,
    });
  });

  it("treats 'No reviews yet' as zero reviews and a 0.0 rating", () => {
    expect(parseReviewStats("No reviews yet N/A")).toEqual({
      rating: 0,
      reviewCount: 0,
    });
  });

  it("reports a count with no rating as a missing rating", () => {
    expect(parseReviewStats("12 reviews")).toEqual({
      rating: null,
      reviewCount: 12,
    });
  });

  it("rejects a rating outside 0 to 5", () => {
    expect(parseReviewStats("7.5 stars, 3 reviews").rating).toBeNull();
  });

  it("returns nothing when the text says nothing about reviews", () => {
    expect(parseReviewStats("Joined 3 years ago")).toEqual({
      rating: null,
      reviewCount: null,
    });
  });
});

describe("countActiveListings", () => {
  // The markup of one listing card, with a SOLD badge when `sold` is true.
  const card = (id: string, sold = false) =>
    `<article><a href="/p/item-${id}/">Item</a>${sold ? "<span>SOLD</span>" : ""}</article>`;

  it("counts listing cards that are not marked SOLD", () => {
    const doc = parseHtml(
      `<body><h2>Listings</h2>${card("111")}${card("222", true)}${card("333")}</body>`,
    );
    expect(countActiveListings(doc, "carousell", BASE)).toBe(2);
  });

  it("counts a listing once even when it is linked twice", () => {
    const doc = parseHtml(
      '<body><article><a href="/p/item-111/"><img alt="" /></a><a href="/p/item-111/">Title</a></article></body>',
    );
    expect(countActiveListings(doc, "carousell", BASE)).toBe(1);
  });

  it("is zero when the Listings heading has no cards", () => {
    expect(
      countActiveListings(parseHtml("<body><h2>Listings</h2></body>"), "carousell", BASE),
    ).toBe(0);
  });

  it("is zero when every card is sold", () => {
    const doc = parseHtml(`<body><h2>Listings</h2>${card("111", true)}</body>`);
    expect(countActiveListings(doc, "carousell", BASE)).toBe(0);
  });

  it("is not found when there is no Listings heading and no cards", () => {
    expect(
      countActiveListings(parseHtml("<body><p>Hello</p></body>"), "carousell", BASE),
    ).toBeNull();
  });

  it("ignores links to listings on the other marketplace", () => {
    const doc = parseHtml('<body><a href="https://www.mudah.my/phone-123456.htm">x</a></body>');
    expect(countActiveListings(doc, "carousell", BASE)).toBeNull();
  });
});

describe("parseSellerPage", () => {
  it("combines all four values from one page", () => {
    const doc = parseHtml(`<body>
      <h1>Seller</h1>
      <p>Joined 3 years 2 months ago</p>
      <p>4.8 (17 reviews)</p>
      <h2>Listings</h2>
      <article><a href="/p/phone-111/">Phone</a></article>
      <article><a href="/p/laptop-222/">Laptop</a><span>SOLD</span></article>
    </body>`);
    expect(parseSellerPage(doc, "carousell", BASE, NOW)).toEqual({
      accountAgeDays: 1155,
      rating: 4.8,
      reviewCount: 17,
      activeListingCount: 1,
    });
  });
});

// A live Mudah seller page (recorded 2026-10-06) has no review system, states "Joined Since 06 Feb
// 2019", and shows "35 TOTAL ADS", "3 AVAILABLE ADS", "32 SOLD". Its ads are split into an
// "Available Ads" section and a "Sold Ads" section, with NO SOLD badge on the individual cards, so
// counting cards that are not badged would also count the sold ones. The page's own
// "N AVAILABLE ADS" figure is the active listing count. (All names and ids below are invented.)
describe("a Mudah seller page", () => {
  // A listing link in Mudah's style (slug and numeric id), with no SOLD badge on the card.
  const card = (id: number, title: string) =>
    `<a href="/${title.toLowerCase().replace(/ /g, "-")}-${id}.htm"><div>${title}</div><div>RM 100</div></a>`;
  const html = `<h1>seller name</h1>
    <div>Joined Since</div><div>06 Feb 2019</div><div>Verified</div>
    <div>35</div><div>TOTAL ADS</div><div>3</div><div>AVAILABLE ADS</div><div>32</div><div>SOLD</div>
    <h2>Available Ads</h2>${card(101, "Phone one")}${card(102, "Phone two")}${card(103, "Phone three")}
    <h2>Sold Ads</h2>${card(201, "Old tablet")}${card(202, "Old watch")}${card(203, "Old camera")}`;
  // A fresh document of the page above for each test.
  const doc = () => parseHtml(`<!doctype html><html><body><main>${html}</main></body></html>`);
  const url = "https://www.mudah.my/u/seller-1";

  it("counts the AVAILABLE ADS figure, not the sold ads shown below it", () => {
    expect(parseSellerPage(doc(), "mudah", url, NOW).activeListingCount).toBe(3);
  });

  it("reads the join date and leaves the rating and review count unknown", () => {
    const seller = parseSellerPage(doc(), "mudah", url, NOW);
    // 6 Feb 2019 to 5 Oct 2026.
    const expectedDays = Math.round((Date.UTC(2026, 9, 5) - Date.UTC(2019, 1, 6)) / 86_400_000);
    expect(seller.accountAgeDays).toBe(expectedDays);
    // Mudah shows no ratings, so these stay "not found" (unknown), never 0.
    expect(seller.rating).toBeNull();
    expect(seller.reviewCount).toBeNull();
  });

  it("reads 0 available ads as 0 when the page says so", () => {
    const empty = parseHtml(
      // Line breaks between the blocks, as a real browser's rendered text has them.
      "<!doctype html><html><body><div>Joined Since</div>\n<div>06 Feb 2019</div>\n<div>0</div>\n<div>AVAILABLE ADS</div></body></html>",
    );
    expect(parseSellerPage(empty, "mudah", url, NOW).activeListingCount).toBe(0);
  });
});

describe("a listing title that merely contains the word sold", () => {
  it("is still an active listing; only a SOLD badge marks one as sold", () => {
    const doc = parseHtml(
      `<!doctype html><html><body><h2>Listings</h2>
        <ul>
          <li><a href="/p/table-not-sold-separately-111/">Table, not sold separately</a></li>
          <li><a href="/p/old-phone-222/">Old phone <span>SOLD</span></a></li>
          <li><a href="/p/fan-333/">Fan</a></li>
        </ul></body></html>`,
    );
    expect(countActiveListings(doc, "carousell", BASE)).toBe(2);
  });
});
