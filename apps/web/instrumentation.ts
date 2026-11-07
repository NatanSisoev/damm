// Starts the engine job scheduler once per server process (docs/engine-integration.md).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getScheduler } = await import("./lib/engine");
  getScheduler();
}
