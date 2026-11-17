// Separate entry point for the Living Diagram demo — keeps the production
// root (remotion/index.ts → Root.tsx) untouched (docs/qa/living-diagram-demo-qa.md R7).
import React from "react";
import { Composition, registerRoot } from "remotion";
import { LivingDiagram, type DiagramDoc } from "./LivingDiagram";

const empty: DiagramDoc = {
  title: "", fps: 30, width: 1920, height: 1080, totalMs: 1000,
  theme: { bg: "#000000", accent: "#ffffff", label: "" }, scenes: [], cues: [], lines: [],
};

const Root: React.FC = () =>
  React.createElement(Composition, {
    id: "LivingDiagram",
    component: LivingDiagram as unknown as React.FC<Record<string, unknown>>,
    durationInFrames: 30,
    fps: 30,
    width: 1920,
    height: 1080,
    defaultProps: { doc: empty },
    calculateMetadata: ({ props }: { props: Record<string, unknown> }) => {
      const doc = props.doc as DiagramDoc;
      return {
        durationInFrames: Math.max(30, Math.ceil((doc.totalMs / 1000) * (doc.fps || 30))),
        fps: doc.fps || 30, width: doc.width || 1920, height: doc.height || 1080,
      };
    },
  });

registerRoot(Root);
