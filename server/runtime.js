export async function workerHealth(url) {
  if (!url) return { status: "not_configured" };
  try {
    const r = await fetch(url + "/health", {
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) throw Error();
    const d = await r.json();
    return { ...d, status: d.status === "ok" ? "ready" : "offline" };
  } catch {
    return { status: "offline" };
  }
}
export async function computeCapabilities() {
  const [cpu, gpu] = await Promise.all([
    workerHealth(process.env.LOCAL_PORTRAIT_URL),
    workerHealth(
      process.env.GPU_PORTRAIT_URL || process.env.LOCAL_PORTRAIT_URL,
    ),
  ]);
  return {
    cpu: {
      available:
        cpu.status === "ready" &&
        (cpu.devices?.includes("cpu") || cpu.device === "cpu"),
      fast: !!cpu.fast_portraits,
      status: cpu.status,
    },
    gpu: {
      available:
        gpu.status === "ready" &&
        (gpu.devices?.includes("cuda") || gpu.device === "cuda"),
      status:
        gpu.status === "ready" &&
        !gpu.devices?.includes("cuda") &&
        gpu.device !== "cuda"
          ? "no_cuda"
          : gpu.status,
    },
    limits: { cpu_neural_seconds: 6, gpu_neural_seconds: 30, fast_seconds: 60 },
  };
}
export async function requireCompute(compute, quality) {
  const c = await computeCapabilities();
  if (compute === "gpu" && quality === "fast")
    throw Object.assign(
      Error(
        "Fast portrait animation uses CPU. Choose neural quality for GPU mode.",
      ),
      { status: 400 },
    );
  if (!c[compute]?.available)
    throw Object.assign(
      Error(
        compute === "gpu"
          ? "GPU mode needs a reachable CUDA worker. Configure GPU_PORTRAIT_URL or use CPU mode."
          : "Start the local portrait worker before rendering realistic video.",
      ),
      { status: 503 },
    );
  if (quality === "fast" && !c.cpu.fast)
    throw Object.assign(
      Error("Restart the V3 portrait worker to enable fast exports"),
      { status: 503 },
    );
  return compute === "gpu"
    ? process.env.GPU_PORTRAIT_URL || process.env.LOCAL_PORTRAIT_URL
    : process.env.LOCAL_PORTRAIT_URL;
}
