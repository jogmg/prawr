import { ImageResponse } from "next/og";

export const alt = "Prawr: pay-per-second livestreams";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 84px",
          backgroundColor: "#161b18",
          color: "#f5f7f4",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            color: "#b6f36a",
            fontSize: 30,
            fontWeight: 700,
          }}
        >
          PRAWR
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 66, lineHeight: 1.08, fontWeight: 700 }}>
            Pay for the moments
            <br />
            you watch.
          </div>
          <div style={{ fontSize: 28, color: "#c3cbc5" }}>
            Pay-per-second livestreams, powered by Arc.
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 20, color: "#b6f36a" }}>
          WATCH LIVE. PAY BY TIME.
        </div>
      </div>
    ),
    size
  );
}
