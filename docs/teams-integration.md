# Integració amb Microsoft Teams

## Què hi ha (construït)

- `/hr/publish/[codi]/teams`: per cada col·lectiu, una **Adaptive Card 1.5** (títol, explicació d'anonimat i agregació, botó `Action.OpenUrl` cap a l'enllaç d'accés), una previsualització en HTML/CSS i el botó "Copia el JSON".
- Constructor pur: `apps/web/app/hr/publish/teams-card.ts` (sense I/O; es pot moure darrere d'una API).
- Enviament opcional: si `TEAMS_WEBHOOK_URL` està definida (webhook entrant o URL de Workflows), un server action fa POST de `{type:"message", attachments:[…adaptive…]}` al canal. Sense la variable només es mostra una nota. La URL no es guarda mai al repo.
- La targeta no conté dades personals: només el nom del col·lectiu i l'enllaç d'accés.

### Alarmes crítiques al canal

- Quan la tasca d'anàlisi (`POST /api/jobs/run`) crea alarmes **crítiques** noves, publica una Adaptive Card per alarma (màxim 5 per execució; l'última diu quantes més n'hi ha) al mateix punt on surt el web push d'HR. Codi: `apps/web/lib/teams-alarm.ts` (constructor pur `buildAlarmCard` i `notifyTeamsNewAlarms`), lector `listNewCriticalAlarms` a `packages/db/src/hr-push.ts`.
- Variable: `TEAMS_ALARM_WEBHOOK_URL` (webhook de Workflows, format `{type:"message", attachments:[…adaptive…]}`); si és buida, `TEAMS_WEBHOOK_URL`. Sense cap de les dues no es fa res. La URL no es guarda mai al repo ni es registra.
- Contingut: gravetat, tipus d'alarma, segment (domini, col·lectiu, torn), període, canvi (delta i sèrie), confiança, el motiu de la gravetat (`apps/web/lib/alarm-reason.ts`) i un `Action.OpenUrl` cap a `${PUBLIC_BASE_URL}/hr/signals/<id>`. Idioma: català. Només dades agregades; no surt cap alarma amb menys de 10 respostes ni cap dada individual.
- Sense duplicats: mateix tall que el push (alarmes amb id posterior al màxim previ a la tasca), de manera que tornar a executar la tasca no reenvia res. Un POST que falla no es reintenta.
- Un webhook que falla o triga (límit de 5 s) només queda al log (`[teams-alarm]`, sense URL) i mai fa fallar la tasca ni la petició; en cas de fallada s'abandonen les targetes restants d'aquella execució. La resposta de la tasca inclou `teamsAlarm` (`off`, `none` o `sent` amb `alarms`, `posts`, `failed`).
- Provat amb un servidor HTTP local fals (mai contra un webhook real).

## Camí futur (no construït)

- **Microsoft Graph API**: publicar al canal des del servidor amb permisos d'aplicació, sense webhook manual.
- **Bot de Teams**: recordatoris 1:1 (nudges) al mateix chat; cal respectar l'anonimat, sense lligar identitat de Teams amb el compte intern.
- **SSO de M365**: inici de sessió d'HR amb Entra ID (només al panell d'HR; l'app d'empleats continua sense dades personals).
