import { open } from "node:fs/promises";

/** Bound memory and release the file when a video seek cancels an old response. */
export async function fileStream(filePath: string, start: number, end: number) {
  const file = await open(filePath, "r");
  let position = start, closed = false;
  let reading: ReturnType<typeof file.read<Uint8Array>> | null = null;
  let closing: Promise<void> | undefined;
  const close = () => closing ??= file.close();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (closed) return;
      try {
        const size = Math.min(64 * 1024, end - position + 1);
        if (size <= 0) { closed = true; controller.close(); await close(); return; }
        const buffer = new Uint8Array(size);
        reading = file.read(buffer, 0, size, position);
        const { bytesRead } = await reading;
        reading = null;
        // Cancellation may occur while the filesystem read is pending.
        if (closed) return;
        if (bytesRead) { position += bytesRead; controller.enqueue(buffer.subarray(0, bytesRead)); }
        if (!bytesRead || position > end) { closed = true; controller.close(); await close(); }
      } catch (error) {
        if (!closed) { closed = true; controller.error(error); }
        await close().catch(() => {});
      }
    },
    async cancel() {
      closed = true;
      await reading?.catch(() => {});
      await close();
    },
  });
}
