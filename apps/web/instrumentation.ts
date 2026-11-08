// Starts the engine job scheduler once per server process (docs/engine-integration.md).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getScheduler } = await import("./lib/engine");
  getScheduler();
  try {
    const { loadBankTranslations } = await import("./lib/bank-translations");
    loadBankTranslations();
  } catch (e) {
    console.warn("[i18n] translation backfill skipped:", e);
  }
  try {
    const { ensureTestAccount } = await import("@damm/db/employee");
    const r = await ensureTestAccount(process.env.TEST_ACCOUNT);
    if (r === "created") console.log("[auth] test account created");
  } catch (e) {
    console.warn("[auth] test account skipped:", e);
  }
}
