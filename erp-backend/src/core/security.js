/**
 * HTTP hardening: trusted proxy, security headers, restricted CORS and rate limiting.
 *
 * Environment:
 *   CORS_ORIGINS          extra allowed origins, comma separated (added to the defaults below)
 *   ALLOW_VERCEL_PREVIEWS "true" to also allow https://*.vercel.app preview deployments
 *   TRUST_PROXY           number of reverse proxies in front of the app (Hostinger/nginx: 1). Default 0.
 *   RATE_LIMIT_LOGIN_MAX  failed logins allowed per IP per 15 minutes (default 10)
 *   RATE_LIMIT_API_MAX    API requests allowed per IP per minute (default 1000)
 */
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");

const DEFAULT_ORIGINS = [
  "https://skbw.in",
  "https://www.skbw.in",
  "https://api.skbw.in",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://localhost:4173",
];

const allowedOrigins = () => {
  const extra = (process.env.CORS_ORIGINS || "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...extra]);
};

const isOriginAllowed = (origin, allowed = allowedOrigins()) => {
  if (!origin) return true; // same-origin, curl and server-to-server calls carry no Origin header
  if (allowed.has(origin)) return true;
  if (process.env.ALLOW_VERCEL_PREVIEWS === "true" && /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return true;
  return false;
};

const intEnv = (name, fallback) => {
  const n = parseInt(process.env[name] || "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

function applySecurity(app) {
  app.disable("x-powered-by");
  const hops = parseInt(process.env.TRUST_PROXY || "0", 10);
  if (hops > 0) app.set("trust proxy", hops);

  // Security headers. The JSON API gets a locked-down CSP; the static SPA (if served here) keeps its own needs.
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }, // the frontend lives on another origin
    hsts: { maxAge: 15552000, includeSubDomains: true },
  }));
  app.use("/api", (req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  // CORS: only known origins. A disallowed origin simply receives no CORS headers, so browsers block it.
  const allowed = allowedOrigins();
  app.use(cors({
    origin: (origin, callback) => {
      const ok = isOriginAllowed(origin, allowed);
      if (!ok) console.warn(`CORS: blocked origin ${origin}`);
      callback(null, ok);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
    maxAge: 600,
  }));

  // Rate limits
  const json429 = (msg) => (req, res) => res.status(429).json({ msg });
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: intEnv("RATE_LIMIT_LOGIN_MAX", 10),
    skipSuccessfulRequests: true, // only failed attempts count
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: json429("Too many failed login attempts. Try again in 15 minutes."),
  });
  app.use("/api/auth/login", loginLimiter);
  app.use("/api/auth/register", loginLimiter);

  app.use("/api", rateLimit({
    windowMs: 60 * 1000,
    limit: intEnv("RATE_LIMIT_API_MAX", 1000),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: (req) => req.path === "/health" || req.path.startsWith("/realtime/"), // long-lived SSE connections
    handler: json429("Too many requests. Please slow down."),
  }));
}

module.exports = { applySecurity, isOriginAllowed };
