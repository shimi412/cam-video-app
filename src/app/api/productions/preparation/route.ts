import { actorFor, withAccess } from "@/lib/access";
import { smallJson } from "@/lib/http";
import { createStoryboardLaunch, StoryboardLaunchInputSchema } from "@/lib/concept/storyboard-launch";

export const runtime = "nodejs";

export const POST = withAccess(async (request: Request) => {
  const actor = await actorFor(request);
  if (!actor || actor.local) return Response.json({ error: "Sign in to prepare your video." }, { status: 401 });
  const input = StoryboardLaunchInputSchema.safeParse(await smallJson(request).catch(() => null));
  if (!input.success) return Response.json({ error: "Add your complete script and choose an available video format." }, { status: 400 });
  try {
    const result = await createStoryboardLaunch(input.data, actor.id);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "The preparation price is temporarily unavailable. Please try again or contact support." }, { status: 409 });
  }
});
