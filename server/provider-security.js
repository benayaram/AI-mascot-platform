export function safeMediaUrl(value) {
  const u = new URL(value),
    defaults = ["heygen.com", "heygen.ai", "amazonaws.com", "cloudfront.net"];
  const allowed = [
    ...defaults,
    ...(process.env.HEYGEN_MEDIA_HOSTS || "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean),
  ];
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    !allowed.some((h) => u.hostname === h || u.hostname.endsWith("." + h))
  )
    throw Error(
      "HeyGen returned an unsupported media host. Configure a verified HEYGEN_MEDIA_HOSTS entry on the server.",
    );
  return u;
}
