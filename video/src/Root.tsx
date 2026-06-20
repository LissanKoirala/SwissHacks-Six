import React from "react";
import { Composition } from "remotion";
import { FPS, PitchVideo, TOTAL_FRAMES } from "./PitchVideo";
import { WF_FPS, WF_TOTAL, Workflow } from "./Workflow";

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
        id="Workflow"
        component={Workflow}
        durationInFrames={WF_TOTAL}
        fps={WF_FPS}
        width={1920}
        height={1080}
      />
    </>
  );
};
