import React from "react";
import { Composition } from "remotion";
import { Lesson, lessonFrames, sampleLesson } from "./Lesson";
export const Root = () => (
  <Composition
    id="InstituteLesson"
    component={Lesson}
    width={1280}
    height={720}
    fps={24}
    durationInFrames={lessonFrames(sampleLesson.scenes)}
    defaultProps={sampleLesson}
    calculateMetadata={({ props }) => ({
      durationInFrames: lessonFrames(props.scenes),
    })}
  />
);
