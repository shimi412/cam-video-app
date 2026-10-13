import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, rename, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";

async function fileHash(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

/** Include every local input, including fonts, voice, clips and the animation lib. */
export async function compositionHash(project: string) {
  const hash = createHash("sha256").update("hyperframes-0.8.91:30fps:draft:checkpoint-v1");
  async function visit(relative: string) {
    for (const entry of (await readdir(path.join(project, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = path.join(relative, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Render inputs must be regular local files.");
      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile()) hash.update(JSON.stringify([name, await fileHash(path.join(project, name))]));
    }
  }
  hash.update(await fileHash(path.join(project, "index.html")));
  await visit("assets");
  return hash.digest("hex");
}

/** Receipts are published atomically only after rendering completes. An orphaned
 * renderer writes to its own attempt folder and cannot overwrite another attempt.
 * Quality controls are deliberately rerun even when the video can be reused.
 */
export async function checkpointedRender(input: {
  project: string; output: string; checkpointDir: string;
  assertOwned: () => Promise<void>;
  render: (output: string) => Promise<void>;
}) {
  const { project, output, checkpointDir, assertOwned } = input;
  await mkdir(checkpointDir, { recursive: true });
  const fingerprint = await compositionHash(project);
  const receiptPath = path.join(checkpointDir, `${fingerprint}.json`);
  const cached = path.join(checkpointDir, `${fingerprint}.mp4`);
  let valid = false;
  try {
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    valid = receipt.fingerprint === fingerprint && receipt.sha256 === await fileHash(cached);
  } catch { /* Missing, partial or corrupt checkpoints must be rendered again. */ }
  if (valid) {
    await assertOwned();
    await copyFile(cached, output);
    return { reused: true, fingerprint };
  }
  await input.render(output);
  await assertOwned();
  const digest = await fileHash(output);
  const suffix = randomUUID();
  const temporary = `${cached}.${suffix}.tmp`;
  await copyFile(output, temporary);
  await assertOwned();
  await rename(temporary, cached);
  const receiptTemp = `${receiptPath}.${suffix}.tmp`;
  await writeFile(receiptTemp, JSON.stringify({ fingerprint, sha256: digest, completedAt: new Date().toISOString() }));
  await assertOwned();
  await rename(receiptTemp, receiptPath);
  return { reused: false, fingerprint };
}
