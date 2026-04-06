/**
 * Pull a JSON value from model output (handles ```json fences and extra prose).
 */

function stripBom(s: string): string {
  return s.replace(/^\uFEFF/, "");
}

/** LLMs often emit trailing commas; strict JSON rejects them. */
function stripTrailingCommas(s: string): string {
  let t = s;
  let prev = "";
  while (prev !== t) {
    prev = t;
    t = t.replace(/,\s*([}\]])/g, "$1");
  }
  return t;
}

function preprocessCandidate(s: string): string {
  return stripTrailingCommas(stripBom(s).trim());
}

/**
 * Find the index of the closing bracket that matches `{` or `[` at `start`,
 * respecting strings and escapes. Returns -1 if not found or mismatched.
 */
function findBalancedJsonEnd(s: string, start: number): number {
  const first = s[start];
  if (first !== "{" && first !== "[") return -1;
  const stack: Array<"{" | "["> = [first];
  const closeFor: Record<"{" | "[", "}" | "]"> = { "{": "}", "[": "]" };

  let inString = false;
  let escape = false;

  for (let i = start + 1; i < s.length; i++) {
    const ch = s[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") {
      stack.push(ch);
      continue;
    }
    if (ch === "}" || ch === "]") {
      const open = stack.pop();
      if (!open) return -1;
      if (ch !== closeFor[open]) return -1;
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

export function extractJsonValue(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const rawCandidate = fence ? fence[1]!.trim() : trimmed;
  const candidate = preprocessCandidate(rawCandidate);

  const tryParse = (s: string): unknown => JSON.parse(preprocessCandidate(s));

  try {
    return tryParse(candidate);
  } catch {
    const startObj = candidate.indexOf("{");
    const startArr = candidate.indexOf("[");
    let start = -1;
    if (startObj >= 0 && startArr >= 0) start = Math.min(startObj, startArr);
    else if (startObj >= 0) start = startObj;
    else if (startArr >= 0) start = startArr;
    else {
      const dump = candidate.length > 0 ? candidate.slice(0, 150) + "..." : "<empty string>";
      throw new Error(`No JSON object or array found in model output. Output was: ${dump}`);
    }

    const end = findBalancedJsonEnd(candidate, start);
    if (end < 0 || end <= start) {
      const dump = candidate.length > 0 ? candidate.slice(0, 300) + "..." : "<empty>";
      throw new Error(`Invalid JSON span in model output. Output was: ${dump}`);
    }
    try {
      return tryParse(candidate.slice(start, end + 1)) as unknown;
    } catch (e) {
      const dump = candidate.slice(start, start + 300) + "...";
      throw new Error(`Balanced JSON found but failed to parse: ${e instanceof Error ? e.message : String(e)}. Output was: ${dump}`);
    }
  }
}
