import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseDotenv } from "dotenv";
import type { NextConfig } from "next";

// --- Load a curated subset of the repo-root `.env` as a fallback -----------
//
// This repo keeps one source of truth for configuration in the repo-root
// `.env` (README: `cp .env.example .env`; the Python backend's
// `openexecutive/config.py` walks up to the same file). `next dev` /
// `next build` only auto-load `.env*` from `packages/ui/`, so without this
// the UI process never sees `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
// `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAILS`, `AUTH_DEV_LOGIN`,
// `BACKEND_SHARED_SECRET`, … — and a missing `AUTH_SECRET` makes Auth.js
// throw `MissingSecret` on `/api/auth/session`.
//
// Deliberately narrow:
//   - Only an explicit set of credential / gate keys is copied. The
//     repo-root file also holds backend-only secrets and could hold e.g.
//     `NODE_OPTIONS`; none of that should leak into the Next process.
//     Deployment-topology keys (`AUTH_URL`, `AUTH_TRUST_HOST`,
//     `BACKEND_BASE_URL`, CORS origins) are deliberately NOT copied — a
//     repo-root `.env` filled in for a Fly deploy would otherwise point
//     local `npm run dev` sign-in callbacks at the deployed host.
//   - A key is only set when it is not ALREADY defined, so an exported
//     shell var or anything Next loaded from `packages/ui/.env*` always
//     wins; the repo-root file merely fills gaps.
//   - Empty values are skipped, so `cp .env.example .env` (whose auth keys
//     ship blank) does not create defined-but-empty vars.
//
// `packages/ui` is always exactly two levels below the repo root; the
// two-marker check keeps this a no-op if that path is not actually the
// repo root (the Docker build stage runs with `WORKDIR /app` and `.env`
// dockerignored, and `next.config.ts` is not evaluated at runtime under
// `output: "standalone"`).
const UI_ENV_KEYS = new Set([
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_DEV_LOGIN",
  "ALLOWED_EMAILS",
  "BACKEND_SHARED_SECRET",
]);

const repoRoot = path.resolve(__dirname, "..", "..");
const isRepoRoot =
  existsSync(path.join(repoRoot, "Makefile")) &&
  existsSync(path.join(repoRoot, "packages", "core"));
const rootEnvPath = path.join(repoRoot, ".env");

if (isRepoRoot && existsSync(rootEnvPath)) {
  try {
    const parsed = parseDotenv(readFileSync(rootEnvPath, "utf8"));
    const loaded: string[] = [];
    for (const [key, value] of Object.entries(parsed)) {
      if (value === "" || !UI_ENV_KEYS.has(key)) continue;
      if (process.env[key] !== undefined) continue;
      process.env[key] = value;
      loaded.push(key);
    }
    if (loaded.length > 0) {
      console.log(
        `[next.config] loaded ${loaded.length} var(s) from ${rootEnvPath}: ${loaded.join(", ")}`,
      );
    }
  } catch (err) {
    console.warn(`[next.config] could not load ${rootEnvPath}: ${String(err)}`);
  }
}

// Note: backend proxying is handled by `src/app/api/backend/[...path]/route.ts`
// so streaming SSE responses aren't buffered. Don't add a `rewrites()` rule
// here for `/api/backend/*` — it would re-introduce buffering.
const nextConfig: NextConfig = {
  // Emit a self-contained server bundle so the production Docker image
  // can run `node server.js` without copying node_modules.
  output: "standalone",
  // Pin the file-tracing root to this package so the standalone output
  // lands at `.next/standalone/server.js`. Without this, Next walks up
  // looking for a workspace root and nests server.js many directories deep.
  outputFileTracingRoot: path.resolve(__dirname),
  // mermaid v11 is ESM-only; Next.js webpack needs to transpile it
  transpilePackages: ["mermaid"],
};

export default nextConfig;
