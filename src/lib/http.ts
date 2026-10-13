export async function smallJson(request: Request, maximum = 32 * 1024): Promise<unknown> {
  if (!request.body) throw new Error("Missing request body.");
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try { while (true) { const { value, done } = await reader.read(); if (done) break; length += value.byteLength; if (length > maximum) { await reader.cancel(); throw new Error("Request is too large."); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
