// Deterministic PII redaction examples (ca/es/en): `pnpm --filter @damm/db run redaction-check`.
import assert from "node:assert/strict";
import { redactPii } from "../src/pii";

const cases: [string, string][] = [
  // Positives: names
  ["Em dic Joan Garcia i tinc un problema", "Em dic [nom] i tinc un problema"],
  ["em dic joan, treballo de nit", "em dic [nom], treballo de nit"],
  ["Me llamo María López Ruiz y trabajo en turno de noche", "Me llamo [nom] y trabajo en turno de noche"],
  ["My name is Sam Carter and I work nights", "My name is [nom] and I work nights"],
  ["Sóc Marta Puig de Fàbriques", "Sóc [nom] de Fàbriques"],
  ["Soy Pedro Ruiz", "Soy [nom]"],
  ["Hi, I'm Alex Moreno from the plant", "Hi, I'm [nom] from the plant"],
  ["El senyor Ferran Soler no avisa dels canvis", "El senyor [nom] no avisa dels canvis"],
  ["La senyora Núria Vidal ho sap", "La senyora [nom] ho sap"],
  ["Sra. Gómez no responde", "Sra. [nom] no responde"],
  ["Mr Hughes never answers", "Mr [nom] never answers"],
  ["Ms. Patel is great", "Ms. [nom] is great"],
  ["He parlat amb Joan Pons i no ha servit de res", "He parlat amb [nom] i no ha servit de res"],
  ["Hablé con Lucía Fernández sobre el calor", "Hablé con [nom] sobre el calor"],
  ["I talked with David Brown about the breaks", "I talked with [nom] about the breaks"],
  ["El meu cap Ramon Ferrer canvia els torns", "El meu cap [nom] canvia els torns"],
  ["Mi jefe Antonio Vega no escucha", "Mi jefe [nom] no escucha"],
  ["My manager is Chris Taylor", "My manager is [nom]"],
  ["Parla amb en Jordi Casas Vila cada dia", "Parla amb [nom] cada dia"],
  // Positives: contact data and IDs
  ["Escriviu a joan.garcia@damm.com", "Escriviu a [correu]"],
  ["Truqueu al 612 345 678 si cal", "Truqueu al [telèfon] si cal"],
  ["Mi móvil es +34 612345678", "Mi móvil es [telèfon]"],
  ["Call 0034-612-345-678 please", "Call [telèfon] please"],
  ["El meu DNI és 12345678Z", "El meu DNI és [DNI]"],
  ["NIE X1234567L", "NIE [DNI]"],
  ["Empleat 48213 de torn de nit", "[id] de torn de nit"],
  ["ID: E-48213", "[id]"],
  ["Soc l'empleat EMP48213", "Soc l'[id]"],
  // Negatives: must stay unchanged
  ["Les pauses a Logística són massa curtes", "Les pauses a Logística són massa curtes"],
  ["Comercial i Oficines tenen horaris diferents", "Comercial i Oficines tenen horaris diferents"],
  ["Benestar i Lideratge han millorat", "Benestar i Lideratge han millorat"],
  ["Sóc feliç a la feina", "Sóc feliç a la feina"],
  ["Soy nuevo en el turno de noche", "Soy nuevo en el turno de noche"],
  ["I'm tired of the heat", "I'm tired of the heat"],
  ["Em dic que no ho entenen", "Em dic que no ho entenen"],
  ["Falta comunicació. Joan no es nota gaire", "Falta comunicació. Joan no es nota gaire"],
  ["He parlat amb Logística i amb Oficines", "He parlat amb Logística i amb Oficines"],
  ["Hablé con el equipo ayer", "Hablé con el equipo ayer"],
  ["We talked with Monday's shift about it", "We talked with Monday's shift about it"],
  ["Treballem amb Excel i Teams cada dia", "Treballem amb Excel i Teams cada dia"],
  ["Mi jefe no escucha", "Mi jefe no escucha"],
  ["My manager changes the rota too often", "My manager changes the rota too often"],
  ["Fa 3 mesos que som 12 a l'equip, de 06:00 a 14:00", "Fa 3 mesos que som 12 a l'equip, de 06:00 a 14:00"],
  ["ISO 9001 i la norma 2026", "ISO 9001 i la norma 2026"],
  ["Falta equip de seguretat a Logística, fa molta calor a l'agost", "Falta equip de seguretat a Logística, fa molta calor a l'agost"],
];

let bad = 0;
for (const [input, want] of cases) {
  const got = redactPii(input);
  if (got !== want) {
    bad += 1;
    console.log(`MISS\n  in:   ${input}\n  want: ${want}\n  got:  ${got}`);
  }
}
console.log(`${cases.length - bad}/${cases.length} redaction cases pass`);
assert.equal(bad, 0);
