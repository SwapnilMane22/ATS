/**
 * Load `ATS Engine/.env` with override so project defaults win over stray shell exports
 * (e.g. `ATS_LOCAL_MODEL` copied from README into a profile).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
config({
  path: path.join(repoRoot, ".env"),
  override: true,
  /** dotenv v17 logs `◇ injecting env (N) from .env` by default; not an error. */
  quiet: true,
});
