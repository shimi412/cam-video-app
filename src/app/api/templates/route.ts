import { db, schema } from "@/db";

export async function GET() {
  const templates = await db.select().from(schema.templates);
  return Response.json(
    templates.map((t) => ({
      slug: t.slug,
      name: t.name,
      description: t.description,
      status: t.status,
      recipe: t.recipe,
    })),
  );
}
