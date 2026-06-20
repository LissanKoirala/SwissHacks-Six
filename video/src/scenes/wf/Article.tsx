import React from "react";
// To use a real screenshot instead of this recreation, drop it at
// public/article.png and swap the <FauxArticle/> for:
//   <Img src={staticFile("article.png")} style={{ width: 1180, borderRadius: 16 }} />
import { Appear, Stage } from "../../ui";
import { COLORS, MONO } from "../../theme";
import { WORKFLOW } from "../../content";

const A = WORKFLOW.article;

const FauxArticle: React.FC = () => (
  <div
    style={{
      width: 1180,
      borderRadius: 16,
      overflow: "hidden",
      boxShadow: `inset 0 0 0 1.5px ${COLORS.border}, 0 30px 60px -34px rgba(16,24,40,0.4)`,
      background: "#fff",
    }}
  >
    {/* browser chrome */}
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 22px", background: "#f5f5f5" }}>
      <span style={{ width: 14, height: 14, borderRadius: 999, background: "#e5e5e5" }} />
      <span style={{ width: 14, height: 14, borderRadius: 999, background: "#e5e5e5" }} />
      <span style={{ width: 14, height: 14, borderRadius: 999, background: "#e5e5e5" }} />
      <span style={{ marginLeft: 16, fontFamily: MONO, fontSize: 20, color: COLORS.inkFaint }}>{A.url}</span>
    </div>
    {/* article */}
    <div style={{ padding: "34px 44px 44px" }}>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "0.22em", color: COLORS.destructive }}>
        {A.outlet}
      </div>
      <div style={{ fontSize: 19, color: COLORS.inkFaint, marginTop: 6 }}>Markets · {A.date}</div>
      <h2 style={{ fontSize: 50, lineHeight: 1.1, fontWeight: 700, color: COLORS.ink, margin: "20px 0 0" }}>
        {A.headline}
      </h2>
      <p style={{ fontSize: 27, lineHeight: 1.45, color: COLORS.ink, margin: "18px 0 0", fontWeight: 500 }}>
        {A.standfirst}
      </p>
      {A.body.map((p) => (
        <p key={p} style={{ fontSize: 23, lineHeight: 1.5, color: COLORS.inkSoft, margin: "16px 0 0" }}>
          {p}
        </p>
      ))}
    </div>
  </div>
);

export const WfArticle: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker="It starts in the world">
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Appear at={12}>
        <FauxArticle />
      </Appear>
    </div>
  </Stage>
);
