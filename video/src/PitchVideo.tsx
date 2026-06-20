import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { COLORS } from "./theme";
import { TitleScene } from "./scenes/Title";
import { ProblemScene } from "./scenes/Problem";
import { SolutionScene } from "./scenes/Solution";
import { PipelineScene } from "./scenes/Pipeline";
import { TrustScene } from "./scenes/Trust";
import { TwinScene } from "./scenes/Twin";
import { SchneiderScene } from "./scenes/Schneider";
import { FeaturesScene } from "./scenes/Features";
import { OutroScene } from "./scenes/Outro";

// Each scene owns its enter/exit fade; sequences overlap slightly so the fades
// cross-dissolve into one another.
const OVERLAP = 10;

type SceneDef = { C: React.FC<{ dur: number }>; dur: number };

export const SCENES: SceneDef[] = [
  { C: TitleScene, dur: 120 },
  { C: ProblemScene, dur: 170 },
  { C: SolutionScene, dur: 190 },
  { C: PipelineScene, dur: 240 },
  { C: TrustScene, dur: 200 },
  { C: TwinScene, dur: 200 },
  { C: SchneiderScene, dur: 300 },
  { C: FeaturesScene, dur: 180 },
  { C: OutroScene, dur: 150 },
];

export const FPS = 30;

// Total frames accounting for the overlap between consecutive scenes.
export const TOTAL_FRAMES =
  SCENES.reduce((sum, s) => sum + s.dur, 0) - OVERLAP * (SCENES.length - 1);

export const PitchVideo: React.FC = () => {
  let cursor = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      {SCENES.map((s, i) => {
        const from = cursor;
        cursor += s.dur - OVERLAP;
        const { C } = s;
        return (
          <Sequence key={i} from={from} durationInFrames={s.dur}>
            <C dur={s.dur} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
