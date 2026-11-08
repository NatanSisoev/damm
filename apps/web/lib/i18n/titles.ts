// Browser tab titles, one per page. The layout adds the product name ("Give a Damm") through a title template.
// Catalan is the source; es and en must have the same keys (checked by tsc).
import type { Metadata } from "next";
import { defineDict } from "./core";
import { getT } from "./server";

export const titlesDict = defineDict({
  ca: {
    home: "Les teves preguntes",
    login: "Entra",
    join: "Codi d'invitació",
    welcome: "Et donem la benvinguda",
    onboarding: "Crea el teu accés",
    settings: "Configuració",
    privacy: "Privacitat",
    actions: "Has dit, hem fet",
    hr_login: "Accés de Recursos Humans",
    hr_home: "Panell",
    hr_pool: "Banc de preguntes",
    hr_question: "Pregunta",
    hr_alarms: "Alarmes",
    hr_alarm: "Alarma",
    hr_recs: "Recomanacions",
    hr_rec: "Recomanació",
    hr_needs: "Consultes",
    hr_publish: "Enllaços i QR",
    hr_poster: "Cartell amb QR",
    hr_teams: "Targeta per a Teams",
    manager: "Vista de responsables",
  },
  es: {
    home: "Tus preguntas",
    login: "Entra",
    join: "Código de invitación",
    welcome: "Te damos la bienvenida",
    onboarding: "Crea tu acceso",
    settings: "Ajustes",
    privacy: "Privacidad",
    actions: "Lo dijiste, lo hicimos",
    hr_login: "Acceso de Recursos Humanos",
    hr_home: "Panel",
    hr_pool: "Banco de preguntas",
    hr_question: "Pregunta",
    hr_alarms: "Alarmas",
    hr_alarm: "Alarma",
    hr_recs: "Recomendaciones",
    hr_rec: "Recomendación",
    hr_needs: "Consultas",
    hr_publish: "Enlaces y QR",
    hr_poster: "Cartel con QR",
    hr_teams: "Tarjeta para Teams",
    manager: "Vista de responsables",
  },
  en: {
    home: "Your questions",
    login: "Sign in",
    join: "Invitation code",
    welcome: "Welcome",
    onboarding: "Create your access",
    settings: "Settings",
    privacy: "Privacy",
    actions: "You said, we did",
    hr_login: "HR access",
    hr_home: "Dashboard",
    hr_pool: "Question bank",
    hr_question: "Question",
    hr_alarms: "Alarms",
    hr_alarm: "Alarm",
    hr_recs: "Recommendations",
    hr_rec: "Recommendation",
    hr_needs: "Queries",
    hr_publish: "Links and QR",
    hr_poster: "QR poster",
    hr_teams: "Teams card",
    manager: "Managers view",
  },
});

export type TitleKey = keyof (typeof titlesDict)["ca"];

/** `export const generateMetadata = pageTitle("settings")` */
export const pageTitle = (key: TitleKey) => async (): Promise<Metadata> => {
  const t = await getT(titlesDict);
  return { title: t(key) };
};
