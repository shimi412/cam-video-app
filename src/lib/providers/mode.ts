/** One policy for media, the brain, direct provider calls and billing. */
export type ProviderMode = "mock" | "dryrun" | "fal";

export function providerMode(): ProviderMode {
  const mode = process.env.PROVIDER_MODE;
  if (mode === "mock" || mode === "dryrun" || mode === "fal") return mode;
  if (mode) throw new Error(`Unknown PROVIDER_MODE "${mode}".`);
  return process.env.MOCK_MODE === "false" ? "fal" : "mock";
}

export function isSimulation(): boolean {
  return providerMode() !== "fal";
}

export function brainMode(): "mock" | "cli" | "api" {
  // Simulation always wins, including when production credentials are present.
  if (isSimulation()) return "mock";
  const mode = process.env.BRAIN_MODE ?? "mock";
  if (mode === "mock" || mode === "cli" || mode === "api") return mode;
  throw new Error(`Unknown BRAIN_MODE "${mode}".`);
}

export function assertLiveMedia(): void {
  if (isSimulation()) throw new Error("External media generation is disabled in simulation mode.");
}
