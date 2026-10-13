import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { checkpointedRender } from "../src/lib/concept/render-checkpoint";
import { recoveryAllowed, recentlyQueued } from "../src/lib/job-recovery";

const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "cam-recovery-"));
  roots.push(root);
  const project = path.join(root, "attempt");
  await mkdir(path.join(project, "assets"), { recursive: true });
  await writeFile(path.join(project, "index.html"), "composition");
  await writeFile(path.join(project, "assets/narration.wav"), "voice");
  return { project, output: path.join(project, "rendered.mp4"), checkpointDir: path.join(root, "checkpoints"), assertOwned: vi.fn(async () => {}) };
}

it("recovers a completed render across attempts, rechecking media hashes", async () => {
  const config = await fixture();
  const render = vi.fn(async (output: string) => { await writeFile(output, "completed video"); });
  const first = await checkpointedRender({ ...config, render });
  expect(first.reused).toBe(false);
  await rm(config.output);
  expect((await checkpointedRender({ ...config, render })).reused).toBe(true);
  expect(await readFile(config.output, "utf8")).toBe("completed video");
  expect(render).toHaveBeenCalledTimes(1);
  await writeFile(path.join(config.project, "assets/narration.wav"), "different voice");
  expect((await checkpointedRender({ ...config, render })).reused).toBe(false);
  expect(render).toHaveBeenCalledTimes(2);
});

it("rerenders a corrupted cache instead of publishing it", async () => {
  const config = await fixture();
  const render = vi.fn(async (output: string) => { await writeFile(output, "complete"); });
  const first = await checkpointedRender({ ...config, render });
  await writeFile(path.join(config.checkpointDir, `${first.fingerprint}.mp4`), "truncated");
  expect((await checkpointedRender({ ...config, render })).reused).toBe(false);
  expect(render).toHaveBeenCalledTimes(2);
});

it("never treats a partial render or a lost worker as a completed checkpoint", async () => {
  const config = await fixture();
  const render = vi.fn(async (output: string) => { await writeFile(output, "partial"); throw new Error("crash"); });
  await expect(checkpointedRender({ ...config, render })).rejects.toThrow("crash");
  const complete = vi.fn(async (output: string) => { await writeFile(output, "complete"); });
  await expect(checkpointedRender({ ...config, render: complete, assertOwned: async () => { throw new Error("lock lost"); } })).rejects.toThrow("lock lost");
  expect((await checkpointedRender({ ...config, render: complete })).reused).toBe(false);
  expect(complete).toHaveBeenCalledTimes(2);
});

it("limits recovery to unfinished concepts in the same offline mode", () => {
  vi.stubEnv("PROVIDER_MODE", "dryrun");
  const params = { templateSlug: "cam-clay", executionMode: "dryrun" };
  for (const status of ["confirmed", "running", "failed"]) expect(recoveryAllowed({ status, params })).toBe(true);
  for (const status of ["draft", "estimated", "succeeded"]) expect(recoveryAllowed({ status, params })).toBe(false);
  expect(recoveryAllowed({ status: "running", params: { ...params, executionMode: "mock" } })).toBe(false);
  expect(recoveryAllowed({ status: "running", params: { ...params, templateSlug: "cartoon-ink-noir" } })).toBe(false);
  vi.stubEnv("PROVIDER_MODE", "fal");
  expect(recoveryAllowed({ status: "running", params: { ...params, executionMode: "fal" } })).toBe(false);
});

it("keeps a newly queued preview polling but releases an abandoned confirmation", () => {
  const job = { status: "confirmed", confirmedAt: new Date(10_000) };
  expect(recentlyQueued(job, 10_001)).toBe(true);
  expect(recentlyQueued(job, 15_000)).toBe(false);
  expect(recentlyQueued({ ...job, status: "failed" }, 10_001)).toBe(false);
  expect(recentlyQueued({ ...job, confirmedAt: null }, 10_001)).toBe(false);
});
