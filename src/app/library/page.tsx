import { db, schema } from "@/db";
import { getActiveRecipe } from "@/lib/recipes";

export const dynamic = "force-dynamic";

type RecipeJson = {
  family?: string;
  defaultTone?: string;
  thumbnail?: string;
  concept?: { previewOnly?: boolean };
  bible?: { artDirection?: string; palette?: string; handwrittenKeywords?: boolean };
};

export default async function LibraryPage() {
  const templates = (await db.select().from(schema.templates)).filter((t) => t.status === "active" && getActiveRecipe(t.slug));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Video model library</h1>
        <p className="text-muted mt-1">
          Choose a consistent visual style for your video, with its own characters, colours and pacing.
        </p>
      </div>
      {templates.length === 0 && (
        <div className="bg-surface border border-line rounded-xl p-5 text-sm text-muted">
          New CAM video styles are being prepared. They will appear here when ready for production.
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        {templates.map((t) => {
          const recipe = t.recipe as RecipeJson;
          return (
            <article key={t.id} className="bg-surface border border-line rounded-xl overflow-hidden flex">
              {recipe.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={recipe.thumbnail} alt={t.name} className="w-36 object-cover border-r border-line" />
              )}
              <div className="p-5 space-y-3 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-medium text-lg">{t.name}</h2>
                  <span className="text-xs uppercase tracking-wide bg-accent-soft text-accent rounded-full px-2.5 py-1">
                    {recipe.family}
                  </span>
                </div>
                <p className="text-sm text-muted">{t.description}</p>
                {recipe.concept?.previewOnly && <p className="text-xs text-accent">Free local previews · existing film available</p>}
                <div className="text-xs text-muted bg-surface-2 border border-line rounded-lg p-3 space-y-1">
                  <p><span className="text-foreground">Look:</span> {recipe.bible?.artDirection}</p>
                  <p><span className="text-foreground">Palette:</span> {recipe.bible?.palette}</p>
                  <p>
                    <span className="text-foreground">Default tone:</span> {recipe.defaultTone}
                    {recipe.bible?.handwrittenKeywords ? " · handwritten keywords allowed" : ""}
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
