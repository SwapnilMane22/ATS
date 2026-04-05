import fs from "node:fs/promises";
import path from "node:path";
import { computeEvalSummary, type EvalRecord } from "../core/eval/metrics.js";

function parseArgs(argv: string[]): { input?: string; out?: string } {
  const out: { input?: string; out?: string } = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--input" && next) {
      out.input = next;
      i += 1;
      continue;
    }
    if (a === "--out" && next) {
      out.out = next;
      i += 1;
      continue;
    }
  }
  return out;
}

async function readJsonl(filePath: string): Promise<EvalRecord[]> {
  const raw = await fs.readFile(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as EvalRecord);
}

async function main() {
  const opts = parseArgs(process.argv);
  const input = path.resolve(opts.input ?? "eval/datasets/applications.jsonl");
  const out = path.resolve(opts.out ?? "reports/eval_summary.json");
  const records = await readJsonl(input);
  const summary = computeEvalSummary(records);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify(summary, null, 2), "utf8");
  console.log(`Wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
