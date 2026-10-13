import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { authenticate, Role } from "@/lib/accounts";

export const { auth, handlers, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 8 * 3600 },
  pages: { signIn: "/login", error: "/login" },
  providers: [Credentials({ credentials: { email: { type: "email" }, password: { type: "password" } }, authorize: (credentials) => authenticate(credentials.email, credentials.password) })],
  callbacks: {
    async jwt({ token, user }) {
      if (user) { token.sub = user.id; token.sessionVersion = user.sessionVersion; }
      if (!token.sub) return null;
      const [current] = await db.select({ role: schema.users.role, disabled: schema.users.disabled, sessionVersion: schema.users.sessionVersion }).from(schema.users).where(eq(schema.users.id, token.sub));
      if (!current || current.disabled || current.sessionVersion !== token.sessionVersion || !Role.safeParse(current.role).success) return null;
      token.role = current.role; return token;
    },
    session({ session, token }) { session.user.id = token.sub!; session.user.role = Role.parse(token.role); return session; },
  },
});
