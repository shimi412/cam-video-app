import { z } from "zod";
import { setSetting } from "@/lib/settings";

const bodySchema = z.object({
  key: z.enum(["chat_model", "margin_multiplier"]),
  value: z.union([z.string(), z.number()]),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid setting" }, { status: 400 });
  }
  await setSetting(parsed.data.key, parsed.data.value);
  return Response.json({ ok: true });
}
