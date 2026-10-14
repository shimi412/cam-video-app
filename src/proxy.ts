import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { localAccess, safeReturn } from "@/lib/auth-policy";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/") || ["/login", "/accept-invitation", "/recipes/cam-clay/logo.png"].includes(path) || localAccess(request.nextUrl.hostname)) return NextResponse.next();
  const session = await auth();
  if (!session?.user) { const url = new URL("/login", request.url); url.searchParams.set("next", safeReturn(path + request.nextUrl.search)); return NextResponse.redirect(url); }
  if (path.startsWith("/admin") && session.user.role !== "admin") return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
