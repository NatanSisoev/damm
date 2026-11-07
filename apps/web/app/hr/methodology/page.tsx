import Link from "next/link";
import type { ReactNode } from "react";
import { COLLECTIUS, DOMINIS, MIN_GROUP_SIZE, PERIODES_SEED, TORNS } from "@damm/shared";
import {
  CHANGE_MIN_DELTA,
  CHANGE_MIN_N,
  PRECISION_MODERADA_MIN_N,
  PRECISION_SOLIDA_MIN_N,
} from "@damm/db/hr";
import { Card, PageHeader } from "../ui";

export const metadata = { title: "Com es calcula? · Metodologia" };

// The results page flags representativeness gaps of 5 pp or more (results/page.tsx, `Math.abs(r.gap) >= 0.05`).
const GAP_FLAG_PP = 5;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card title={title}>
      <div className="max-w-3xl space-y-3 text-[14px] leading-relaxed text-muted [&_strong]:font-semibold [&_strong]:text-ink">
        {children}
      </div>
    </Card>
  );
}

function Formula({ children }: { children: ReactNode }) {
  return <p className="num rounded-lg bg-surface-muted px-4 py-3 text-[13px] text-ink">{children}</p>;
}

export default function MethodologyPage() {
  return (
    <>
      <PageHeader
        title="Com es calcula?"
        subtitle="Com llegim els resultats: de qui venen, quanta confiança mereixen i què no es mostra mai. Tot el que hi ha aquí surt del codi de la plataforma."
        actions={<Link href="/hr/results" className="btn">Torna als resultats</Link>}
      />

      <div className="space-y-6">
        <Section title="1. Representativitat">
          <p>
            Comparem <strong>qui ha respost</strong> amb <strong>qui hi ha a l&apos;empresa</strong>. Per a cada col·lectiu (
            {COLLECTIUS.join(", ")}) i per a cada torn ({TORNS.join(", ")}) calculem dos percentatges, sempre sobre el darrer període:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Part de respostes</strong>: persones que han respost al segment ÷ persones que han respost a tots els segments visibles.</li>
            <li><strong>Part de població</strong>: persones del segment ÷ persones de tots els segments visibles (població sintètica, no dades reals).</li>
          </ul>
          <Formula>diferència = part de respostes − part de població (en punts percentuals, pp)</Formula>
          <p>
            Una diferència de {GAP_FLAG_PP} pp o més es marca en groc. Vol dir que aquest segment pesa més o menys en les respostes que a la plantilla; no vol dir que les
            respostes siguin errònies, sinó que cal llegir-les amb cautela. Els percentatges es calculen només entre segments visibles, de manera que els
            recomptes suprimits no es poden recuperar per resta.
          </p>
        </Section>

        <Section title="2. Precisió i marge d'error">
          <p>
            Cada mitjana (escala 1–5) es mostra amb la seva <strong>n</strong>, el nombre de persones que han respost, i una etiqueta de precisió que depèn només d&apos;aquesta n:
          </p>
          <div className="overflow-x-auto">
            <table className="table min-w-[28rem]">
              <thead>
                <tr><th>Precisió</th><th>Persones que han respost (n)</th><th>Com llegir-la</th></tr>
              </thead>
              <tbody>
                <tr><td className="font-medium">Indicativa</td><td className="num">n &lt; {PRECISION_MODERADA_MIN_N}</td><td>Una pista, no una conclusió.</td></tr>
                <tr><td className="font-medium">Moderada</td><td className="num">{PRECISION_MODERADA_MIN_N} ≤ n &lt; {PRECISION_SOLIDA_MIN_N}</td><td>Fiable per a tendències generals.</td></tr>
                <tr><td className="font-medium">Sòlida</td><td className="num">n ≥ {PRECISION_SOLIDA_MIN_N}</td><td>Base àmplia per decidir.</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            <strong>Dues escales.</strong> Les mitjanes, el mapa de calor i les tendències van d&apos;1 a 5. Les alarmes i els resums de l&apos;anàlisi usen una escala
            de 0 a 10. Per passar d&apos;una a l&apos;altra: puntuació = (mitjana − 1) × 2,5. Així, una mitjana de 3,0 és un 5,0 sobre 10.
          </p>
          <p><strong>Canvis entre períodes.</strong> Una mitjana només «puja» o «baixa» si es compleixen les dues condicions:</p>
          <Formula>|mitjana actual − mitjana anterior| ≥ {String(CHANGE_MIN_DELTA).replace(".", ",")} i n ≥ {CHANGE_MIN_N} als dos períodes</Formula>
          <p>Si no, es mostra «sense canvi clar», perquè una diferència petita o amb poca gent pot ser només soroll.</p>
          <p>
            <strong>Marge d&apos;error.</strong> La plataforma no calcula ni mostra un interval de confiança: les bandes de precisió en fan la funció
            de manera simplificada. Com a referència estadística general, el marge d&apos;error d&apos;una mitjana creix quan la n és petita (és proporcional a
            1/√n). A més, una diferència entre grups no n&apos;explica per si sola el motiu.
          </p>
        </Section>

        <Section title="3. Regla de supressió">
          <p>
            Qualsevol segment (col·lectiu, torn, període, domini o tema de comentaris) amb <strong>menys de {MIN_GROUP_SIZE} persones que han respost</strong> no es mostra enlloc: ni al
            panell, ni a les gràfiques, ni a l&apos;exportació CSV. Apareix com a «Suprimit».
          </p>
          <p>
            <strong>Per què.</strong> Amb grups tan petits seria fàcil endevinar qui ha dit què. A més, hi ha una supressió complementària: si només queda un segment
            ocult, o els ocults sumen menys de {MIN_GROUP_SIZE}, s&apos;oculta també el segment visible més petit del mateix grup. Així ningú pot restar el total i recuperar el segment amagat.
          </p>
        </Section>

        <Section title="4. Anonimat">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Només agregats.</strong> Mai es mostren respostes individuals; el panell de l&apos;equip de persones llegeix taules ja agregades.</li>
            <li><strong>Identificador opac.</strong> El compte d&apos;una persona és un identificador intern sense nom, correu ni telèfon.</li>
            <li><strong>Seguiment longitudinal limitat.</strong> L&apos;historial per compte només s&apos;utilitza per agrupar trajectòries; no es mostra per persona ni surt de la capa d&apos;anàlisi.</li>
            <li><strong>Comentaris.</strong> Abans de desar-los, s&apos;hi eliminen automàticament noms, correus i telèfons.</li>
            <li><strong>Administració.</strong> Només veu recomptes de comptes per col·lectiu, mai identitats.</li>
          </ul>
        </Section>

        <Section title="5. La IA proposa, una persona decideix">
          <p>
            La IA redacta esborranys de preguntes, proposa recomanacions i enquestes de seguiment, però només com a proposta. Res no es publica ni s&apos;aplica
            fins que una persona de l&apos;equip de persones ho revisa i ho aprova. El panell mai crida el model de llenguatge mentre es consulta: mostra només resultats ja calculats.
          </p>
        </Section>

        <Section title="6. Límits">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Dades sintètiques.</strong> La població i les respostes són generades per a la demostració; no hi ha dades reals de Damm ni de cap persona.</li>
            <li>
              <strong>Biaixos deliberats a les dades.</strong> Hi ha poca resposta al torn de nit, positivitat de les persones responsables d&apos;equip, un tema emergent
              a l&apos;octubre i un senyal feble a Logística (equips de protecció i calor). Hi són per comprovar que la plataforma els detecta.
            </li>
            <li><strong>Períodes.</strong> Les dades cobreixen {PERIODES_SEED.length} períodes ({PERIODES_SEED.join(", ")}); amb tan poques mesures, una tendència és una indicació, no una prova.</li>
            <li><strong>Àmbit.</strong> {DOMINIS.length} dominis i {COLLECTIUS.length} col·lectius; cada col·lectiu respon un subconjunt diferent de preguntes per domini, per això no es comparen directament tots els ítems.</li>
          </ul>
        </Section>
      </div>
    </>
  );
}
