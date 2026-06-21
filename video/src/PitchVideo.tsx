import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { COLORS } from "./theme";
import { TitleScene } from "./scenes/Title";
import { ProblemScene } from "./scenes/Problem";
import { SolutionScene } from "./scenes/Solution";
import { DeskScene } from "./scenes/Desk";
import { NewsScene } from "./scenes/News";
import { SchneiderScene } from "./scenes/Schneider";
import { StrategyScene } from "./scenes/Strategy";
import { DialogueScene } from "./scenes/Dialogue";
import { RiskScene } from "./scenes/Risk";
import { TrustScene } from "./scenes/Trust";
import { TwinScene } from "./scenes/Twin";
import { RendezvousScene } from "./scenes/Rendezvous";
import { CaptureScene } from "./scenes/Capture";
import { CrmUpdateScene } from "./scenes/CrmUpdate";
import { PipelineScene } from "./scenes/Pipeline";
import { OutroScene } from "./scenes/Outro";

// Each scene owns its enter/exit fade; sequences overlap slightly so the fades
// cross-dissolve into one another.
const OVERLAP = 10;

type SceneDef = { C: React.FC<{ dur: number }>; dur: number };

// Order: hook → positioning → the product, end to end on the real Schneider
// data → trust → twin → how it scales → close.
export const SCENES: SceneDef[] = [
  { C: TitleScene, dur: 140 },
  { C: ProblemScene, dur: 170 },
  { C: SolutionScene, dur: 185 },
  { C: DeskScene, dur: 220 },
  { C: NewsScene, dur: 230 },
  { C: SchneiderScene, dur: 250 },
  { C: StrategyScene, dur: 260 },
  { C: DialogueScene, dur: 260 },
  { C: RiskScene, dur: 230 },
  { C: TrustScene, dur: 190 },
  { C: TwinScene, dur: 240 },
  { C: RendezvousScene, dur: 235 },
  { C: CaptureScene, dur: 230 },
  { C: CrmUpdateScene, dur: 240 },
  { C: PipelineScene, dur: 200 },
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
