import { expect, it } from "vitest";
import { resolveParams } from "../src/lib/brain";
import { activeRecipes, getRecipe } from "../src/lib/recipes";

it("keeps historical recipes readable without offering them for a new production", () => {
  expect(getRecipe("cartoon-flat-vector")?.status).toBe("archived");
  expect(activeRecipes()).toHaveLength(0);
  expect(() => resolveParams("A book explains history.", "auto")).toThrow("temporarily unavailable");
  expect(() => resolveParams("A book explains history.", "manual", { templateSlug: "cartoon-flat-vector" })).toThrow("temporarily unavailable");
});
