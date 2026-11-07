# Catalan copy guide

How the Catalan text in the app should read. Use it when you write or review any string a person sees: employee app, HR portal, manager view, push texts, seed questions and the fallback texts in `packages/ai`.

## Voice

- Employee app: a large Catalan company talking to its own staff. Warm, plain, direct. Use "tu". Short sentences, concrete verbs.
- HR portal and manager view: professional and sober. Same Catalan, no marketing.
- Anonymity copy states facts and never promises more than the code does. Groups of fewer than 10 people are hidden; only aggregates are shown.
- "La IA proposa, una persona decideix" stays as written.

## Rules

1. Buttons and links are imperatives in the "tu" form: Aprova, Descarta, Desa, Crea, Entra. Not infinitives ("Aprovar") and not "Introdueix": write "Escriu".
2. Sentence case for headings and labels. No title case.
3. One term per concept (glossary below). Do not alternate synonyms.
4. No calques: "en base a", "a nivell de", "de cara a", "realitzar", "remarcar", "recolzar", "clicar", misused "assolir".
5. No barbarisms: "respondents", "tauler", "RRHH" in screen text. Say "persones que han respost", "panell", "l'equip de persones".
6. No hype verbs (potencia, impulsa, descobreix) and no empty reassurance ("Sense rastre").
7. Avoid colon and dash stuffing: two short sentences beat one with a colon.
8. Gender: avoid forms that force masculine ("Et sents orgullós"). Rephrase so the sentence works for everyone.
9. Orthography: l·l (col·lectiu), apostrophes as `'` in strings and `&apos;` in JSX text, decimal comma, accents.
10. Do not change identifiers, routes, DB values or enum values. Only the label shown for them.

## Glossary

| Use | Do not use | Notes |
|---|---|---|
| codi d'invitació | codi d'unió, codi d'accés | Join code per collective. Links and QR: "enllaç d'invitació". |
| codi d'accés | | Only for the HR portal gate. |
| Entra | Inicia la sessió | Login button and links. "Tanca la sessió" stays. |
| Escriu | Introdueix | Instructions to type. |
| banc de preguntes | grup, grup de preguntes | The pool approved questions enter. |
| persones que han respost | respondents | Counts of respondents. Short label: "Han respost". |
| l'equip de persones | RRHH, RH | The HR team. |
| Recursos Humans | Portal de persones, RRHH, RH | Name of the HR portal in titles and labels (es "Recursos Humanos", en "HR"). Written out in full. |
| panell | tauler | |
| connexió | xarxa | "Sense connexió". |
| necessitat | | The HR need that starts a survey. |
| col·lectiu | | Fàbriques, Logística, Comercial, Oficines. |
| alarma, recomanació | | Engine outputs. |
| resum de l'anàlisi | resum del motor | "Motor" stays in code and docs. |

## Before and after

| Before | After |
|---|---|
| Sense nom, sense rastre. | Sense nom ni correu. |
| Codi d'unió | Codi d'invitació |
| Benvinguda | Et donem la benvinguda |
| Introdueix el teu usuari | Escriu el teu usuari |
| Inicia la sessió | Entra |
| Comprova la xarxa | Comprova la connexió |
| Les teves respostes no es perden | Les respostes que ja has enviat estan guardades |
| només es mostren de forma agregada | només es mostren agregades |
| es queden com a dades anònimes | es conserven com a dades anònimes |
| Massa intents. | Has fet massa intents. |
| L'usuari ha de tenir entre 3 i 30 caràcters | El nom d'usuari té entre 3 i 30 caràcters |
| Publicar i avisar per notificació | Publica i envia la notificació |
| Aprovar / Descartar | Aprova / Descarta |
| Crear enquesta de seguiment | Crea l'enquesta de seguiment |
| Menys de 10 respondents | Menys de 10 persones han respost |
| Pots ser tu mateix a l'equip? | Pots ser com ets a l'equip? |
