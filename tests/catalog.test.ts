import { expect, it } from "vitest";
import { resolveParams } from "../src/lib/brain";
import { activeRecipes, getRecipe } from "../src/lib/recipes";

it("keeps historical recipes readable without offering them for a new production", () => {
  expect(getRecipe("cartoon-flat-vector")?.status).toBe("archived");
  expect(activeRecipes().map((r)=>r.slug)).toEqual(["cam-clay"]);
  expect(resolveParams("A book explains history.", "auto").params.templateSlug).toBe("cam-clay");
  expect(() => resolveParams("A book explains history.", "manual", { templateSlug: "cartoon-flat-vector" })).toThrow("temporarily unavailable");
});
