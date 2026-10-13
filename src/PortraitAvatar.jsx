import { useEffect, useRef, useState } from "react";
export default function PortraitAvatar({ avatar, speaking, level }) {
  const container = useRef(),
    rig = useRef(),
    [status, setStatus] = useState("Preparing face rig…");
  useEffect(() => {
    let disposed = false;
    setStatus("Preparing face rig…");
    const rigModuleUrl = "/portrait-rig.js";
    import(/* @vite-ignore */ rigModuleUrl)
      .then(({ createPortraitRig }) =>
        createPortraitRig(container.current, {
          image: avatar.image,
          name: avatar.name,
        }),
      )
      .then((created) => {
        if (disposed) {
          created.destroy();
          return;
        }
        rig.current = created;
        setStatus("Face rig ready · local model");
      })
      .catch((e) => {
        if (!disposed) setStatus("Static portrait · " + e.message);
      });
    return () => {
      disposed = true;
      rig.current?.destroy();
      rig.current = null;
    };
  }, [avatar.image]);
  useEffect(() => {
    rig.current?.setLevel(speaking ? level * 4 : 0);
  }, [speaking, level, status]);
  return (
    <div
      className="realistic-avatar"
      data-rig-ready={status.startsWith("Face rig ready")}
    >
      <div ref={container} />
      <span className="portrait-disclosure">AI character</span>
      <small role="status">{status}</small>
    </div>
  );
}
