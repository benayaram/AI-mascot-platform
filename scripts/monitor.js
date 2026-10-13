const origin = process.env.APP_URL || "http://127.0.0.1:3001";
try {
  const start = performance.now(),
    r = await fetch(origin + "/api/ready", {
      signal: AbortSignal.timeout(5000),
    });
  console.log(
    JSON.stringify({
      time: new Date().toISOString(),
      ready: r.ok,
      latency_ms: Math.round(performance.now() - start),
    }),
  );
  process.exitCode = r.ok ? 0 : 1;
} catch {
  console.log(JSON.stringify({ time: new Date().toISOString(), ready: false }));
  process.exitCode = 1;
}
