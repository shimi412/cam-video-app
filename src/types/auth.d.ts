import "next-auth";
declare module "next-auth" {
  interface User { role?: "admin" | "client"; sessionVersion?: number }
  interface Session { user: { id: string; role: "admin" | "client"; name?: string | null; email?: string | null; image?: string | null } }
}
