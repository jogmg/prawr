import type { Metadata } from "next";

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Metadata {
  return {
    title: "Watch livestream",
    description:
      "Watch a livestream on Prawr and pay only for the time you watch.",
    alternates: {
      canonical: `/watch/${encodeURIComponent(params.slug)}`,
    },
  };
}

export default function WatchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
