import { ImageResponse } from "next/og";

export const alt = "MathNexa math vocabulary trail";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", overflow: "hidden", background: "#e8f2f5", color: "#0b2239", fontFamily: "Arial, sans-serif" }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", opacity: 0.16, backgroundImage: "linear-gradient(#0d3b57 2px, transparent 2px), linear-gradient(90deg, #0d3b57 2px, transparent 2px)", backgroundSize: "72px 72px" }} />
      <div style={{ width: 34, height: "100%", display: "flex", background: "#f5c542" }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "70px 84px 64px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div style={{ width: 78, height: 78, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", background: "#0d3b57", color: "#f5c542", fontSize: 42, fontWeight: 900 }}>M</div>
          <div style={{ display: "flex", fontSize: 48, fontWeight: 800, letterSpacing: -2 }}>MathNexa</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 900 }}>
          <div style={{ display: "flex", fontSize: 76, lineHeight: 1.04, fontWeight: 900, letterSpacing: -4 }}>Words make math visible.</div>
          <div style={{ display: "flex", fontSize: 30, lineHeight: 1.3, color: "#294e63" }}>Interactive math vocabulary practice in your browser.</div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {["ratio", "integer", "variable", "distance"].map((term) => <div key={term} style={{ display: "flex", padding: "11px 20px", border: "2px solid #315b72", borderRadius: 999, background: "#f8fbfc", fontSize: 22, fontWeight: 700 }}>{term}</div>)}
        </div>
      </div>
    </div>,
    size
  );
}
