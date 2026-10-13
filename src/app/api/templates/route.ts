import { withAccess } from "@/lib/access";
import { db, schema } from "@/db";
import { getActiveRecipe } from "@/lib/recipes";

async function handleGET() {
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

export const GET = withAccess(handleGET);
