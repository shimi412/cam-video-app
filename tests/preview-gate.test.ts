import { afterEach, expect, it, vi } from "vitest";
import { POST } from "../src/app/api/productions/route";
import { produceConcept } from "../src/lib/concept/run";
import { getRecipe } from "../src/lib/recipes";
import { resolveParams } from "../src/lib/brain";
import { DEMO_SCRIPT } from "../src/lib/concept/existing";

afterEach(() => vi.unstubAllEnvs());
it("blocks a paid preview-only recipe before database writes or provider calls", async () => {
  vi.stubEnv("PROVIDER_MODE", "fal");
  vi.stubEnv("BRAIN_MODE", "api");
  const script = "Read the full passage. Check the original source before sharing a claim.";
  const response = await POST(new Request("http://localhost/api/productions", { method:"POST", body:JSON.stringify({ script, mode:"auto" }) }));
  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain("free previews only");
  const { params } = resolveParams(script,"auto");
  const meter = vi.fn(), setStep = vi.fn();
  await expect(produceConcept({ jobId:"never-created", script, params, recipe:getRecipe("cam-clay")!,meter,setStep })).rejects.toThrow("preview-only");
  expect(meter).not.toHaveBeenCalled();
  expect(setStep).not.toHaveBeenCalled();
});

it("rejects incompatible existing-film requests before creating a production", async () => {
  const send = (script: string, aspectRatio: string) => POST(new Request("http://localhost/api/productions", { method: "POST", body: JSON.stringify({ script, mode: "auto", previewSource: "existing", overrides: { aspectRatio } }) }));
  vi.stubEnv("PROVIDER_MODE", "dryrun");
  expect((await send(DEMO_SCRIPT.replace("dangerous", "different"), "9:16")).status).toBe(409);
  expect((await send(DEMO_SCRIPT, "1:1")).status).toBe(409);
  vi.stubEnv("PROVIDER_MODE", "fal");
  expect((await send(DEMO_SCRIPT, "9:16")).status).toBe(409);
});
