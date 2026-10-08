// Root layout: loads the shared design styles first, then the website's own page styles, and wraps
// every page in the site header. The shared stylesheet holds the design tokens and the styles of the
// shared components (also used by the browser extension's side panel).
import type { Metadata } from "next";
import "@guardianlens/shared/styles.css";
import { Header } from "@/components/Header";
import "./globals.css";

/** The page title and description that browsers and search engines show for the site. */
export const metadata: Metadata = {
  title: "GuardianLens",
  description: "Explainable fraud-risk decision support for Malaysian C2C marketplace listings.",
};

/** Wraps every page in the HTML shell and puts the site header above the page content. */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Header />
        {children}
      </body>
    </html>
  );
}
