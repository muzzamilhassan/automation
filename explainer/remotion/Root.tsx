import React from "react";
import { Composition } from "remotion";
import { Explainer, type Storyboard } from "./Explainer";
import { Reel } from "./reels";

const EMPTY: Storyboard = {
  title: "Explainer",
  chapters: [],
  fps: 30,
  width: 1920,
  height: 1080,
  totalMs: 2000,
  beats: [],
};

// The real storyboard arrives as CLI input props (--props=public/storyboard.json).
// Accept both the raw document and a {storyboard: ...} wrapper.
const unwrap = (p: any): Storyboard | null => {
  if (!p) return null;
  if (Array.isArray(p?.beats) && p.beats.length > 0) return p as Storyboard;
  if (Array.isArray(p?.storyboard?.beats) && p.storyboard.beats.length > 0) return p.storyboard as Storyboard;
  return null;
};

const calculateMetadata = ({ props }: { props: unknown }) => {
  const data = unwrap(props);
  if (!data) {
    return { durationInFrames: 10, fps: 30, width: 1920, height: 1080 };
  }
  return {
    durationInFrames: Math.max(Math.ceil((data.totalMs / 1000) * (data.fps || 30)), 10),
    fps: data.fps || 30,
    width: data.width || 1920,
    height: data.height || 1080,
    props: { storyboard: data },
  };
};

// Reel docs arrive raw as {spec, timeline, totalMs, fps}. defaultProps merge an
// empty {reel} key in — so require NON-empty timelines before trusting either shape.
const calculateReelMetadata = ({ props }: { props: any }) => {
  const doc = Array.isArray(props?.timeline) && props.timeline.length > 0 ? props
    : (Array.isArray(props?.reel?.timeline) && props.reel.timeline.length > 0 ? props.reel : null);
  if (!doc) return { durationInFrames: 10, fps: 30, width: 1080, height: 1920 };
  return {
    durationInFrames: Math.max(Math.ceil((doc.totalMs / 1000) * (doc.fps || 30)), 10),
    fps: doc.fps || 30,
    width: 1080,
    height: 1920,
    props: { reel: doc },
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Explainer"
        component={Explainer}
        durationInFrames={10}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ storyboard: EMPTY }}
        calculateMetadata={calculateMetadata}
      />
      <Composition
        id="Reel"
        component={Reel}
        durationInFrames={10}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ reel: { spec: { id: "demo", themeKey: "money", beats: [] }, timeline: [], totalMs: 100, fps: 30 } }}
        calculateMetadata={calculateReelMetadata}
      />
    </>
  );
};
