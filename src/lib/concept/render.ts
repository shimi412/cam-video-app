import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const exec = promisify(execFile);
/** Pinned local CLI: no npx download, no CDN assets, no telemetry or update checks. */
export async function hyperframes(args: string[], logPath: string) {
  try {
  const { stdout, stderr } = await exec(process.execPath, [path.join(process.cwd(), "node_modules/hyperframes/dist/cli.js"), ...args], {
    cwd: process.cwd(), timeout: 30 * 60 * 1000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, DO_NOT_TRACK: "1", HYPERFRAMES_NO_TELEMETRY: "1", HYPERFRAMES_NO_UPDATE_CHECK: "1", HYPERFRAMES_NO_AUTO_INSTALL: "1", HYPERFRAMES_SKIP_SKILLS: "1" },
  });
  await writeFile(logPath, stdout + "\n" + stderr);
  return stdout;
  } catch (error) {
    const result = error as { stdout?: string; stderr?: string; message?: string };
    await writeFile(logPath, `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.message ?? "Renderer failed"}`);
    throw new Error("The local preview renderer failed. Its diagnostic log is saved with this production.");
  }
}

let renderQueue = Promise.resolve();
export function renderConcept(project: string, output: string): Promise<void> {
  const next = renderQueue.then(async () => {
    await hyperframes(["check", project, "--json"], path.join(project, "check.log"));
    await hyperframes(["render", project, "--quality", "draft", "--fps", "30", "--workers", "2", "--output", output], path.join(project, "render.log"));
  });
  renderQueue = next.catch(() => {});
  return next;
}

export async function silentVoice(output: string, seconds: number) {
  await exec("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", String(seconds), "-c:a", "pcm_s16le", output]);
}

/** Local, low-resolution copy of the complete edited film. No provider access. */
export async function downscalePreview(source:string,output:string){
  await exec("ffmpeg",["-y","-loglevel","error","-i",source,"-vf","scale=if(gte(iw\\,ih)\\,-2\\,480):if(gte(iw\\,ih)\\,480\\,-2)","-c:v","libx264","-preset","fast","-crf","23","-c:a","copy","-movflags","+faststart",output]);
}
