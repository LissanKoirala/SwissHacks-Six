import React from "react";
import { AbsoluteFill, Composition } from "remotion";
import { FPS, PitchVideo, TOTAL_FRAMES } from "./PitchVideo";
import { TeamScene } from "./scenes/Team";
import { COLORS } from "./theme";

// Standalone team slide carrying a QR to the live demo — for the deck, not the
// main video. Rendered as a still (npm run team-qr).
const TeamQR: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
    <TeamScene dur={250} showQr />
  </AbsoluteFill>
);

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Pitch"
        component={PitchVideo}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="TeamQR"
        component={TeamQR}
        durationInFrames={250}
        fps={FPS}
        width={1920}
        height={1080}
      />
    </>
  );
};
