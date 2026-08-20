import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const templates = await db.select().from(schema.templates);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Video model library</h1>
        <p className="text-muted mt-1">
          Each model is a frozen recipe: visual style, pipeline, packaging. A recognizable
          signature for every video, extensible without new development.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {templates.map((t) => {
          const recipe = t.recipe as Record<string, unknown>;
          return (
            <article key={t.id} className="bg-surface border border-line rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-medium text-lg">{t.name}</h2>
                <span className="text-xs uppercase tracking-wide bg-accent-soft text-accent rounded-full px-2.5 py-1">
                  {t.status}
                </span>
              </div>
              <p className="text-sm text-muted">{t.description}</p>
              <div className="text-xs font-mono text-muted bg-surface-2 border border-line rounded-lg p-3 overflow-x-auto">
                pipeline: {(recipe.pipeline as string[])?.join(" → ")}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
