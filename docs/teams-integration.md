# Integració amb Microsoft Teams

## Què hi ha (construït)

- `/hr/publish/[codi]/teams`: per cada col·lectiu, una **Adaptive Card 1.5** (títol, explicació d'anonimat i agregació, botó `Action.OpenUrl` cap a l'enllaç d'accés), una previsualització en HTML/CSS i el botó "Copia el JSON".
- Constructor pur: `apps/web/app/hr/publish/teams-card.ts` (sense I/O; es pot moure darrere d'una API).
- Enviament opcional: si `TEAMS_WEBHOOK_URL` està definida (webhook entrant o URL de Workflows), un server action fa POST de `{type:"message", attachments:[…adaptive…]}` al canal. Sense la variable només es mostra una nota. La URL no es guarda mai al repo.
- La targeta no conté dades personals: només el nom del col·lectiu i l'enllaç d'accés.

## Camí futur (no construït)

- **Microsoft Graph API**: publicar al canal des del servidor amb permisos d'aplicació, sense webhook manual.
- **Bot de Teams**: recordatoris 1:1 (nudges) al mateix chat; cal respectar l'anonimat, sense lligar identitat de Teams amb el compte intern.
- **SSO de M365**: inici de sessió d'HR amb Entra ID (només al panell d'HR; l'app d'empleats continua sense dades personals).
