import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { z } from "zod";
import { StoryboardSheetSchema } from "@/lib/concept/storyboard-review";
import { StoryboardProposal } from "../../storyboard-proposal";

export const dynamic = "force-dynamic";

// A separate, read-only proposal never overwrites a rejected storyboard or
// advances production. Human approval is recorded against its exact target.
export default async function StoryboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const file = path.join(process.cwd(), "storage/concepts", id, "live/storyboard-proposal.json");
  const proposal = await readFile(file, "utf8").catch(() => null);
  if (!proposal) notFound();
  const data = z.object({
    sheet: StoryboardSheetSchema,
    title: z.string(),
    voice: z.object({
      file: z.string().regex(/^[a-z0-9-]+\.wav$/),
      phraseStart: z.number().nonnegative(),
      phraseEnd: z.number().positive(),
      words: z.array(z.object({ text: z.string(), start: z.number().nonnegative() })),
    }),
    descriptions: z.array(z.object({ title: z.string(), action: z.string() })),
  }).parse(JSON.parse(proposal));
  return <StoryboardProposal jobId={id} {...data} />;
}
