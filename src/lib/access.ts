import { allowedOrigin, localAccess, localActor, type Actor } from "./auth-policy";

export async function actorFor(request: Request): Promise<Actor | null> {
  if (localAccess(new URL(request.url).hostname)) return localActor;
  if (!process.env.AUTH_SECRET && !process.env.NEXTAUTH_SECRET) return null;
  const { auth } = await import("@/auth"); const session = await auth();
  return session?.user?.id ? { id: session.user.id, role: session.user.role, name: session.user.name ?? "", email: session.user.email ?? "", local: false } : null;
}
/** Every data route checks its session and role, independently of page redirects. */
export function withAccess<T extends unknown[]>(handler: (request: Request, ...context: T) => Promise<Response>, role: "client" | "admin" = "client") {
  return async (request: Request = new Request("http://localhost"), ...context: T) => {
    if (!allowedOrigin(request)) return Response.json({ error: "This request must come from the CAM workspace." }, { status: 403 });
    const actor = await actorFor(request);
    if (!actor) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    if (role === "admin" && actor.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403 });
    return handler(request, ...context);
  };
}
