import type { Metadata } from "next";
import { Header } from "./components/header";
import "./globals.css";
import { Providers } from "./providers";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  ...(siteUrl
    ? {
        metadataBase: new URL(siteUrl),
        alternates: { canonical: "/" },
      }
    : {}),
  title: {
    default: "Prawr | Pay-per-second livestreams",
    template: "%s | Prawr",
  },
  applicationName: "Prawr",
  description:
    "Watch livestreams and pay only for the time you watch with Prawr, a decentralized micropayment streaming platform built on Arc.",
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
    title: "Prawr | Pay-per-second livestreams",
    description:
      "Watch livestreams and pay only for the time you watch with Prawr, a decentralized micropayment streaming platform built on Arc.",
    ...(siteUrl ? { images: [{ url: "/assets/og-image" }] } : {}),
  },
  twitter: {
    card: siteUrl ? "summary_large_image" : "summary",
    title: "Prawr | Pay-per-second livestreams",
    description:
      "Watch livestreams and pay only for the time you watch with Prawr, a decentralized micropayment streaming platform built on Arc.",
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
    <html lang="en">
      <body>
        <Providers>
          <Header />
          {children}
        </Providers>
      </body>
    </html>
  );
}
