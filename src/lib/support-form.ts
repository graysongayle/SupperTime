import { getSupportAppBaseUrl } from "@/lib/support-email";

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function getSupportFormAllowedOrigins() {
  return (process.env.SUPPORT_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

export function isSupportFormOriginAllowed(origin: string | null) {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  const allowedOrigins = getSupportFormAllowedOrigins();

  if (allowedOrigins.includes("*")) {
    return true;
  }

  if (allowedOrigins.includes(normalizedOrigin)) {
    return true;
  }

  try {
    if (normalizedOrigin === normalizeOrigin(getSupportAppBaseUrl())) {
      return true;
    }
  } catch {
    // SUPPORT_APP_BASE_URL is validated elsewhere; origin checks should not
    // crash request handling when the app is partially configured.
  }

  if (process.env.NODE_ENV !== "production") {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(
      normalizedOrigin,
    );
  }

  return false;
}

export function supportFormCorsHeaders(origin: string | null) {
  const allowedOrigins = getSupportFormAllowedOrigins();
  const allowAnyOrigin = allowedOrigins.includes("*");
  const headers = new Headers({
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  });

  if (allowAnyOrigin) {
    headers.set("Access-Control-Allow-Origin", "*");
  } else if (origin && isSupportFormOriginAllowed(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  return headers;
}
