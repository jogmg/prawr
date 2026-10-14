import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Creator",
  description: "Manage your Prawr streams and creator payouts.",
  alternates: { canonical: "/creator" },
  robots: {
    index: false,
    follow: false,
  },
};

export default function CreatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
