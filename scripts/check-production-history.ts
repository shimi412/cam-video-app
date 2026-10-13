process.env.PROVIDER_MODE = "dryrun"; process.env.BRAIN_MODE = "mock";
import assert from "node:assert/strict";
import { GET } from "../src/app/api/jobs/route";
import { GET as getJob } from "../src/app/api/jobs/[id]/route";
import { GET as getMedia } from "../src/app/api/media/[...path]/route";
import { storedVideoUrl } from "../src/lib/stored-media";

globalThis.fetch = async () => { throw new Error("External fetch forbidden"); };
type Item = { id: string; status: string; title: string; url: string; outputUrl: string | null };
async function main() {
  const read = async (query = "") => { const response = await GET(new Request(`http://localhost/api/jobs${query}`)); assert.equal(response.status, 200); return response.json() as Promise<{ items: Item[]; nextCursor: string | null }>; };
  const first = await read(); assert(first.items.length > 0 && first.items.length <= 24);
  if (first.nextCursor) { const next = await read(`?cursor=${first.nextCursor}`); assert(next.items.every((item) => !first.items.some((previous) => previous.id === item.id))); }
  const drafts = await read("?status=estimated"); assert(drafts.items.every((item) => item.status === "estimated"));
  const filtered = await read("?q=Offline%20recording%20test"); assert(filtered.items.length > 0); assert(filtered.items.every((item) => item.title.includes("Offline recording test")));
  const literal = await read("?q=%25"); assert(literal.items.every((item) => item.title.includes("%")));
  assert.equal((await GET(new Request("http://localhost/api/jobs?status=unknown"))).status, 400);
  assert.equal((await GET(new Request("http://localhost/api/jobs?cursor=bad"))).status, 400);
  const completed = filtered.items.find((item) => item.status === "succeeded" && item.outputUrl)!; assert(completed);
  const detail = await (await getJob(new Request("http://localhost/job"), { params: Promise.resolve({ id: completed.id }) })).json();
  assert.equal(detail.outputUrl, completed.outputUrl);
  const media = await getMedia(new Request(`http://localhost${completed.outputUrl}`, { headers: { Range: "bytes=0-43" } }), { params: Promise.resolve({ path: completed.outputUrl!.replace("/api/media/", "").split("/") }) });
  assert.equal(media.status, 206); assert.equal((await media.arrayBuffer()).byteLength, 44);
  assert.equal(await storedVideoUrl("/tmp/outside.mp4"), null); assert.equal(await storedVideoUrl(null), null);
  process.env.PROVIDER_MODE = "fal"; assert.equal((await GET(new Request("http://localhost/api/jobs"))).status, 401); // local bypass cannot open a real-provider workspace
  console.log(JSON.stringify({ status: "passed", pagination: Boolean(first.nextCursor), filters: true, literalSearch: true, sameResultUrl: true, playableVideo: true, liveModeBlocked: true, paidRequests: 0 }));
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
