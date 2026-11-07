import { goToJoinAction } from "./actions";

export default function JoinEntryPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div className="space-y-1">
        <p className="text-sm opacity-60">Escolta activa</p>
        <h1 className="text-2xl font-semibold">Introdueix el teu codi</h1>
      </div>
      <p className="text-sm opacity-70">
        El trobaràs al cartell o al missatge del teu equip (per exemple DAMM-FAB). Si tens el QR, escaneja&apos;l directament.
      </p>
      <form action={goToJoinAction} className="space-y-4">
        <label className="block space-y-1 text-sm">
          <span>Codi d&apos;accés</span>
          <input
            name="codi"
            required
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="DAMM-XXX"
            className="w-full rounded border bg-transparent px-3 py-3 font-mono uppercase tracking-wide"
          />
        </label>
        <button className="w-full rounded bg-black px-4 py-3 text-white dark:bg-white dark:text-black">Continua</button>
      </form>
    </main>
  );
}
