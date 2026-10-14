import { expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileStream } from "../src/lib/file-stream";

it("serves the exact bytes and tolerates cancellation during an in-flight video read", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cam-stream-"));
  try {
    const file = path.join(directory, "media.bin"), bytes = Buffer.alloc(3 * 1024 * 1024, 71);
    await writeFile(file, bytes);
    expect(Buffer.from(await new Response(await fileStream(file, 0, bytes.length - 1)).arrayBuffer())).toEqual(bytes);
    expect(Buffer.from(await new Response(await fileStream(file, 3, 193)).arrayBuffer())).toEqual(bytes.subarray(3, 194));
    for (let index = 0; index < 30; index++) {
      const reader = (await fileStream(file, 0, bytes.length - 1)).getReader();
      const pending = reader.read();
      await reader.cancel(); await pending;
      expect((await reader.read()).done).toBe(true);
    }
    expect((await new Response(await fileStream(file, 0, -1)).arrayBuffer()).byteLength).toBe(0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
