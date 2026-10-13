let modelPromise;
const rigs = new Map();
async function faceModel() {
  if (!modelPromise)
    modelPromise = (async () => {
      const { FaceLandmarker, FilesetResolver } =
        await import("/runtime/vision/vision_bundle.mjs");
      const runtime = await FilesetResolver.forVisionTasks("/runtime/vision");
      const model = await FaceLandmarker.createFromOptions(runtime, {
        baseOptions: { modelAssetPath: "/runtime/face-landmarker.task" },
        runningMode: "IMAGE",
        numFaces: 1,
      });
      const edges = FaceLandmarker.FACE_LANDMARKS_TESSELATION;
      const neighbors = new Map();
      for (const { start, end } of edges) {
        if (!neighbors.has(start)) neighbors.set(start, new Set());
        if (!neighbors.has(end)) neighbors.set(end, new Set());
        neighbors.get(start).add(end);
        neighbors.get(end).add(start);
      }
      const triangles = [];
      for (const [a, set] of neighbors)
        for (const b of set)
          for (const c of neighbors.get(b) || [])
            if (a < b && b < c && set.has(c)) triangles.push([a, b, c]);
      return { model, triangles };
    })();
  return modelPromise;
}
function drawTriangle(context, image, source, target) {
  const [a, b, c] = source,
    [u, v, w] = target;
  const denominator = a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y);
  if (Math.abs(denominator) < 0.01) return;
  const p =
      (u.x * (b.y - c.y) + v.x * (c.y - a.y) + w.x * (a.y - b.y)) / denominator,
    q =
      (u.x * (c.x - b.x) + v.x * (a.x - c.x) + w.x * (b.x - a.x)) / denominator,
    r =
      (u.x * (b.x * c.y - c.x * b.y) +
        v.x * (c.x * a.y - a.x * c.y) +
        w.x * (a.x * b.y - b.x * a.y)) /
      denominator,
    s =
      (u.y * (b.y - c.y) + v.y * (c.y - a.y) + w.y * (a.y - b.y)) / denominator,
    t =
      (u.y * (c.x - b.x) + v.y * (a.x - c.x) + w.y * (b.x - a.x)) / denominator,
    z =
      (u.y * (b.x * c.y - c.x * b.y) +
        v.y * (c.x * a.y - a.x * c.y) +
        w.y * (a.x * b.y - b.x * a.y)) /
      denominator;
  context.save();
  context.beginPath();
  context.moveTo(u.x, u.y);
  context.lineTo(v.x, v.y);
  context.lineTo(w.x, w.y);
  context.closePath();
  context.clip();
  context.transform(p, s, q, t, r, z);
  context.drawImage(image, 0, 0, image.width, image.height, 0, 0, 320, 320);
  context.restore();
}
export async function createPortraitRig(
  element,
  { image: url, name = "AI character" },
) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 320;
  canvas.setAttribute("aria-label", name + " realistic portrait");
  Object.assign(canvas.style, {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  });
  element.replaceChildren(canvas);
  const image = new Image();
  image.src = url;
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(Error("Portrait image could not be loaded"));
  });
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, 320, 320);
  const { model, triangles } = await faceModel();
  let points = rigs.get(url);
  if (!points) {
    points = model.detect(image).faceLandmarks[0];
    if (!points) throw Error("No clear face detected");
    rigs.set(url, points);
  }
  const center = {
      x: (points[13].x + points[14].x) * 160,
      y: (points[13].y + points[14].y) * 160,
    },
    source = points.map((p) => ({ x: p.x * 320, y: p.y * 320 }));
  let disposed = false,
    raf,
    previous = 0,
    smoothed = 0,
    target = 0,
    idle = true;
  function tick(time) {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    if (time - previous < 33) return;
    previous = time;
    smoothed = smoothed * 0.6 + target * 0.4;
    if (smoothed < 0.005 && idle) return;
    idle = smoothed < 0.005;
    context.clearRect(0, 0, 320, 320);
    context.drawImage(image, 0, 0, 320, 320);
    if (idle) return;
    const destination = source.map((p) => {
      const dx = p.x - center.x,
        dy = p.y - center.y,
        influence = Math.exp(-((dx * dx) / 1900 + (dy * dy) / 800));
      return {
        x: p.x + dx * smoothed * 0.04 * influence,
        y: p.y + (dy >= 0 ? 7 : -2) * smoothed * influence,
      };
    });
    for (const indices of triangles)
      if (
        indices.some(
          (i) =>
            Math.abs(source[i].x - center.x) < 80 &&
            Math.abs(source[i].y - center.y) < 65,
        )
      )
        drawTriangle(
          context,
          image,
          indices.map((i) => source[i]),
          indices.map((i) => destination[i]),
        );
  }
  tick(0);
  return {
    canvas,
    setLevel(value) {
      target = Math.min(1, Math.max(0, value));
    },
    destroy() {
      disposed = true;
      cancelAnimationFrame(raf);
    },
    ready: true,
  };
}
