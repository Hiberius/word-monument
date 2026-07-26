import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Serif, Inter } from "next/font/google";
import Header from "@/components/nav/Header";
import Footer from "@/components/nav/Footer";
import JsonLd from "@/components/seo/JsonLd";
import { SITE_NAME, SITE_URL, SITE_TAGLINE, SITE_DESCRIPTION } from "@/lib/site";
import "./globals.css";

/* Headline serif - the masthead wordmark and any large editorial type.
   Instrument Serif only ships a 400 weight; hierarchy comes from scale and
   tracking, not boldness. Variable name matches the --font-headline token
   in tokens.css/globals.css - see the comment in globals.css's @theme
   block for why that match is intentional. */
const instrumentSerif = Instrument_Serif({
  variable: "--font-headline",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

/* Body sans - every paragraph, label, and control. Variable font, so no
   weight array is needed. */
const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

/* Grid mono - a third family beyond the usual two-font budget, justified
   because the ledger grid's monospace cells are the product's core
   mechanic, not decoration: every glyph across a million cells must sit in
   an identical cell width regardless of character. Loaded once here so
   it's ready wherever the grid renders. */
const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-mono-grid",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} - ${SITE_TAGLINE}`,
    template: `%s - ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} - ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} - ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
};

/* Keeps browser chrome (mobile status bar, form controls, scrollbars) on
   the light, parchment-toned look this product commits to - matches the
   deliberate absence of a prefers-color-scheme override in globals.css. */
export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#F6F1E7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${instrumentSerif.variable} ${inter.variable} ${ibmPlexMono.variable} flex min-h-screen flex-col bg-parchment text-ink antialiased`}
        // Browser extensions (password managers, Grammarly, dark-mode toggles)
        // routinely inject attributes/classes into <body> before React
        // hydrates. This className is otherwise fully deterministic (stable
        // font-variable tokens + static Tailwind classes), so the standard
        // Next.js fix for that known false-positive applies here.
        suppressHydrationWarning
      >
        <JsonLd />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
