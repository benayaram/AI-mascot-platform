import React from "react";
import {
  AbsoluteFill,
  Sequence,
  Img,
  Html5Video,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { Audio } from "@remotion/media";
export const lessonFrames = (scenes = [], fps = 24) =>
  Math.max(
    24,
    scenes.reduce((sum, s) => sum + Math.ceil((s.duration || 8) * fps), 0),
  );
export const sampleLesson = {
  title: "The water cycle",
  subtitle: "SCIENCE · FOUNDATIONS",
  scenes: [
    {
      title: "Water is always moving",
      narration:
        "The sun warms water. It rises as vapour, forms clouds, and returns as rain.",
      points: [
        "Evaporation: heat turns water into vapour",
        "Condensation: cooling forms clouds",
        "Precipitation: water returns as rain",
      ],
      duration: 9,
      visual: "cycle",
    },
  ],
};
function Scene({ scene, index, count, title, avatarImage }) {
  const frame = useCurrentFrame(),
    { fps, durationInFrames } = useVideoConfig();
  const enter = spring({ frame: frame + 8, fps, config: { damping: 200 } });
  const paragraphs = scene.narration.match(/[^.!?。।]+[.!?。।]?/gu) || [
    scene.narration,
  ];
  const caption =
    paragraphs[
      Math.min(
        paragraphs.length - 1,
        Math.floor(
          (frame / Math.max(1, (scene.duration || 8) * fps)) *
            paragraphs.length,
        ),
      )
    ];
  return (
    <AbsoluteFill
      style={{
        background: "#0e1830",
        fontFamily: "Arial, sans-serif",
        color: "#f7f9ff",
        padding: 48,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          color: "#73e1c1",
          fontSize: 19,
          letterSpacing: 3,
        }}
      >
        <b>BENAI / INSTITUTE</b>
        <span>
          {index + 1} / {count}
        </span>
      </div>
      <div style={{ marginTop: 34, fontSize: 18, color: "#99aac9" }}>
        {title}
      </div>
      <div
        style={{
          display: "flex",
          gap: 32,
          marginTop: 18,
          opacity: enter,
          transform: `translateY(${interpolate(enter, [0, 1], [18, 0])}px)`,
        }}
      >
        <div style={{ flex: 1 }}>
          <h1
            style={{
              fontSize: 43,
              lineHeight: 1.15,
              margin: "0 0 26px",
              maxWidth: 840,
            }}
          >
            {scene.title}
          </h1>
          {scene.media?.kind === "video" ? (
            <Html5Video
              src={scene.media.src}
              muted
              style={{
                width: "100%",
                height: 280,
                objectFit: "contain",
                borderRadius: 18,
              }}
            />
          ) : scene.media ? (
            <Img
              src={scene.media.src}
              style={{
                width: "100%",
                height: 280,
                objectFit: "contain",
                borderRadius: 18,
              }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: scene.visual === "cycle" ? "row" : "column",
                gap: 16,
              }}
            >
              {scene.points.map((p, i) => {
                const reveal = interpolate(
                  frame,
                  [i * fps * 0.55, i * fps * 0.55 + 12],
                  [0, 1],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                );
                return (
                  <div
                    key={i}
                    style={{
                      opacity: reveal,
                      flex: 1,
                      padding: 22,
                      border: "1px solid #304764",
                      background: "#192c46",
                      borderRadius: 20,
                      fontSize: 24,
                      lineHeight: 1.4,
                    }}
                  >
                    <div
                      style={{
                        color: "#73e1c1",
                        fontSize: 28,
                        marginBottom: 12,
                      }}
                    >
                      {String(i + 1).padStart(2, "0")}
                      {scene.visual === "cycle" ? " →" : ""}
                    </div>
                    {p}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div style={{ width: 232, flexShrink: 0 }}>
          <div
            style={{
              height: 295,
              borderRadius: 24,
              overflow: "hidden",
              background: "#253753",
              border: "1px solid #47617e",
            }}
          >
            {scene.avatarVideo ? (
              <Html5Video
                src={scene.avatarVideo}
                muted
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : avatarImage ? (
              <Img
                src={avatarImage}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div
                style={{ fontSize: 92, textAlign: "center", paddingTop: 70 }}
              >
                ✦
              </div>
            )}
          </div>
          <p style={{ color: "#98b1d0", fontSize: 15, textAlign: "center" }}>
            {scene.avatarVideo
              ? "AI avatar · synthesized speech"
              : "AI narrator · portrait"}
          </p>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 40,
          left: 48,
          right: 48,
          padding: "16px 24px",
          background: "#080f20",
          borderRadius: 16,
          fontSize: 23,
          lineHeight: 1.4,
          minHeight: 70,
        }}
      >
        {caption}
      </div>
      {scene.audio && <Audio src={scene.audio} />}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          height: 5,
          width: `${Math.min(100, (frame / ((scene.duration || 8) * fps)) * 100)}%`,
          background: "#73e1c1",
        }}
      />
    </AbsoluteFill>
  );
}
export function Lesson({
  title = sampleLesson.title,
  scenes = sampleLesson.scenes,
  avatarImage = "",
}) {
  const { fps } = useVideoConfig();
  let from = 0;
  return (
    <AbsoluteFill>
      {scenes.map((scene, index) => {
        const start = from;
        const duration = Math.ceil((scene.duration || 8) * fps);
        from += duration;
        return (
          <Sequence
            key={index}
            from={start}
            durationInFrames={duration}
            premountFor={fps}
          >
            <Scene
              scene={scene}
              index={index}
              count={scenes.length}
              title={title}
              avatarImage={avatarImage}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
