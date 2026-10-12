import { db, schema } from "@/db";
import { getActiveRecipe } from "@/lib/recipes";

export async function GET() {
  const templates = await db.select().from(schema.templates);
  return Response.json(
    templates.filter((t) => t.status === "active" && getActiveRecipe(t.slug)).map((t) => ({
      slug: t.slug,
      name: t.name,
      description: t.description,
      status: t.status,
      recipe: t.recipe,
    })),
  );
}
