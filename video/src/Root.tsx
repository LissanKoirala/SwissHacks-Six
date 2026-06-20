import React from "react";
import { Composition } from "remotion";
import { FPS, PitchVideo, TOTAL_FRAMES } from "./PitchVideo";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Pitch"
      component={PitchVideo}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
};
