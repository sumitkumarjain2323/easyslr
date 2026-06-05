/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const config = {
  // Pin the workspace root to this project. Without this, Next.js infers the
  // root from the nearest lockfile and can walk up into the user home dir
  // (which on Windows contains the legacy "Application Data" junction that
  // throws EPERM during file tracing).
  outputFileTracingRoot: __dirname,
};

export default config;
