import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { COLORS } from "./theme";
import { WfArticle } from "./scenes/wf/Article";
import { WfClassify } from "./scenes/wf/Classify";
import { WfCollision } from "./scenes/wf/Collision";
import { WfBoard } from "./scenes/wf/Board";
import { WfAlert } from "./scenes/wf/Alert";
import { WfReview } from "./scenes/wf/Review";

const OVERLAP = 10;

type SceneDef = { C: React.FC<{ dur: number }>; dur: number };

// real news article → classify → collide with the client → kanban (to do →
// in progress → needs sign-off) → 9am alert → review the proposal.
export const WF_SCENES: SceneDef[] = [
  { C: WfArticle, dur: 160 },
  { C: WfClassify, dur: 220 },
  { C: WfCollision, dur: 190 },
  { C: WfBoard, dur: 300 },
  { C: WfAlert, dur: 190 },
  { C: WfReview, dur: 210 },
];

export const WF_FPS = 30;
export const WF_TOTAL =
  WF_SCENES.reduce((s, x) => s + x.dur, 0) - OVERLAP * (WF_SCENES.length - 1);

export const Workflow: React.FC = () => {
  let cursor = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      {WF_SCENES.map((s, i) => {
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
