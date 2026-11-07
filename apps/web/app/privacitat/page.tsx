import { MIN_GROUP_SIZE } from "@damm/shared";
import { getCompteId } from "@/lib/session";
import { EmployeeShell } from "../(employee)/components/shell";

export const dynamic = "force-dynamic";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card mt-4">
      <div className="card-body space-y-2">
        <h2 className="section-title">{title}</h2>
        {children}
      </div>
    </section>
  );
}

const list = "list-disc space-y-1.5 pl-5 text-muted";

// Plain-language transparency page. Every claim maps to code: see packages/db/schema.sql
// (compte, resposta, v_resposta_analitica, push_subscripcio) and employee-repository.ts.
export default async function PrivacyPage() {
  // Public on purpose: people deciding whether to join must be able to read it.
  const loggedIn = Boolean(await getCompteId());
  return (
    <EmployeeShell
      back
      backHref={loggedIn ? "/" : "/login"}
      backLabel={loggedIn ? "Inici" : "Entra"}
      title="Privadesa"
    >
      <h1 className="page-title">Com tractem les teves dades</h1>
      <p className="mt-1 text-subtle">
        Aquesta enquesta serveix per escoltar els equips i millorar coses, no per controlar ningú.
      </p>

      <Section title="Què recollim">
        <ul className={list}>
          <li>Les teves respostes a les preguntes de cada dia.</li>
          <li>El teu col·lectiu (ve del codi d&apos;invitació) i, si s&apos;ha indicat, el tipus de centre i el torn.</li>
          <li>Un nom d&apos;usuari que tries tu i una contrasenya, que es guarda xifrada de manera irreversible (mai en clar ni recuperable).</li>
          <li>El temps que tardes a respondre cada pregunta, només per detectar respostes fetes sense llegir.</li>
          <li>
            Un identificador intern opac que enllaça les teves respostes al llarg del temps. Serveix només per a
            l&apos;anàlisi agregada de tendències i mai es mostra per persona.
          </li>
          <li>Cap correu, cap telèfon i cap nom real.</li>
        </ul>
      </Section>

      <Section title="Què veu Recursos Humans">
        <ul className={list}>
          <li>Només resultats agregats: mitjanes, temes i tendències de grups.</li>
          <li>Només grups de {MIN_GROUP_SIZE} persones o més. Si un grup és més petit, no es mostra.</li>
          <li>Mai qui ha respost què. Del compte només veu quantes persones hi ha per col·lectiu, no qui són.</li>
        </ul>
      </Section>

      <Section title="Què no fem mai">
        <ul className={list}>
          <li>No mostrem respostes individuals a ningú.</li>
          <li>No mostrem a ningú l&apos;evolució d&apos;una persona concreta.</li>
          <li>No registrem horaris ni control de presència.</li>
          <li>Les propostes de la IA no s&apos;apliquen soles: sempre les revisa i les decideix una persona.</li>
        </ul>
      </Section>

      <Section title="Comentaris lliures">
        <p className="text-muted">
          Abans de guardar un comentari, l&apos;app amaga automàticament correus, telèfons, DNI/NIE, números de compte
          i noms que comencen amb «em dic…». És una ajuda, no una garantia: per això et demanem que no hi posis dades
          personals.
        </p>
      </Section>

      <Section title="Sessió i compte">
        <ul className={list}>
          <li>Pots tancar la sessió a Configuració. Això esborra la subscripció a notificacions del dispositiu.</li>
          <li>Si perds la contrasenya, la recuperes amb el codi d&apos;un sol ús que et vam donar en crear el compte.</li>
          <li>
            Pots esborrar el compte a Configuració. S&apos;esborren l&apos;usuari, la contrasenya i la subscripció a
            notificacions. Les respostes que ja has donat es conserven com a dades anònimes dins dels resultats de grup, ja
            sense cap enllaç amb tu, i no es poden tornar a vincular al teu compte.
          </li>
        </ul>
      </Section>
    </EmployeeShell>
  );
}
