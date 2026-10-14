import type { Metadata } from "next";
import { DM_Sans, Space_Grotesk } from "next/font/google";
import { Footer } from "./components/footer";
import { Header } from "./components/header";
import "./globals.css";
import { Providers } from "./providers";

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

const bodyFont = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  ...(siteUrl
    ? {
        metadataBase: new URL(siteUrl),
        alternates: { canonical: "/" },
      }
    : {}),
  title: {
    default: "Prawr",
    template: "%s | Prawr",
  },
  applicationName: "Prawr",
  description:
    "Watch live streams and pay only for the time you watch. Prawr brings instant micropayments to creators and viewers on Arc.",
  keywords: [
    "Prawr",
    "pay-per-second streaming",
    "livestream micropayments",
    "decentralized streaming",
    "Arc network",
  ],
  icons: {
    icon: "/assets/prawr_complete.svg",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Prawr",
    title: "Prawr",
    description:
      "Watch live streams and pay only for the time you watch. Prawr brings instant micropayments to creators and viewers on Arc.",
    ...(siteUrl ? { images: [{ url: "/assets/og-image" }] } : {}),
  },
  twitter: {
    card: siteUrl ? "summary_large_image" : "summary",
    title: "Prawr",
    description:
      "Watch live streams and pay only for the time you watch. Prawr brings instant micropayments to creators and viewers on Arc.",
    ...(siteUrl ? { images: [{ url: "/assets/og-image" }] } : {}),
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${headingFont.variable} ${bodyFont.variable} antialiased`}
    >
      <body>
        <Providers>
          <Header />
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
