let csrf = "";
export const setCsrf = (value) => {
  csrf = value || "";
};
export async function api(path, options = {}) {
  const form = options.body instanceof FormData;
  const response = await fetch("/api" + path, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(!form ? { "Content-Type": "application/json" } : {}),
      "X-CSRF-Token": csrf,
      ...options.headers,
    },
    body: options.body
      ? form
        ? options.body
        : JSON.stringify(options.body)
      : undefined,
  });
  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({ error: "Request failed" }));
    throw new Error(data.error || "Request failed");
  }
  if (options.binary) return response.blob();
  return response.json();
}
