import { EmployeeFrame, CompanyLabel, PageHead, PrivacyNote } from "../(employee)/components/frame";
import { goToJoinAction } from "./actions";

export default async function JoinEntryPage({ searchParams }: { searchParams: Promise<{ compte?: string }> }) {
  const { compte } = await searchParams;
  return (
    <EmployeeFrame>
      <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 md:py-8">
        <PageHead
          title="Escoltem la teva veu"
          lede="Dues preguntes breus al dia. Sense nom ni correu."
         
        />
        {compte === "esborrat" && (
          <p role="status" className="mx-4 border border-line bg-surface px-4 py-3 font-semibold">
            Compte esborrat. Les respostes que vas donar es conserven com a dades anònimes.
          </p>
        )}
        <form action={goToJoinAction} className="space-y-4 px-4">
          <div>
            <label htmlFor="codi" className="label">
              Codi d&apos;invitació
            </label>
            <input
              id="codi"
              name="codi"
              required
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="DAMM-XXX"
              aria-describedby="codi-hint"
              className="input font-mono uppercase tracking-wider"
            />
            <p id="codi-hint" className="mt-1 text-sm text-muted">
              Està al cartell o al missatge del teu equip. Si tens el QR, escaneja&apos;l directament.
            </p>
          </div>
          <button className="btn btn-primary h-14 w-full text-base">Entra</button>
        </form>
        <div className="px-4 pb-8">
          <PrivacyNote>
            Anònim de debò. No et demanem nom ni correu. Només veiem grups de 10 persones o més.
          </PrivacyNote>
        </div>
        <CompanyLabel />
      </main>
    </EmployeeFrame>
  );
}
