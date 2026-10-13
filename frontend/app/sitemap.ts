import type { MetadataRoute } from "next";

type StreamRecord = {
  id: string;
  status: string;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) return [];

  const sitemapEntries: MetadataRoute.Sitemap = [
    {
      url: new URL("/", siteUrl).toString(),
      changeFrequency: "daily",
      priority: 1,
    },
  ];
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

  try {
    const response = await fetch(`${apiBaseUrl}/streams`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });

    if (!response.ok) return sitemapEntries;

    const streams = (await response.json()) as StreamRecord[];
    sitemapEntries.push(
      ...streams
        .filter((stream) => stream.status === "live")
        .map((stream) => ({
          url: new URL(
            `/watch/${encodeURIComponent(stream.id)}`,
            siteUrl
          ).toString(),
          changeFrequency: "daily" as const,
          priority: 0.7,
        }))
    );
  } catch {
    return sitemapEntries;
  }

  return sitemapEntries;
}
