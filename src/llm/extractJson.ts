/**
 * Pull a JSON value from model output (handles ```json fences and extra prose).
 */
export function extractJsonValue(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1]!.trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const startObj = candidate.indexOf("{");
    const startArr = candidate.indexOf("[");
    let start = -1;
    if (startObj >= 0 && startArr >= 0) start = Math.min(startObj, startArr);
    else if (startObj >= 0) start = startObj;
    else if (startArr >= 0) start = startArr;
    else throw new Error("No JSON object or array found in model output");

    const endObj = candidate.lastIndexOf("}");
    const endArr = candidate.lastIndexOf("]");
    const end = Math.max(endObj, endArr);
    if (end <= start) throw new Error("Invalid JSON span in model output");
    return JSON.parse(candidate.slice(start, end + 1)) as unknown;
  }
}
