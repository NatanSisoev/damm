// Strings shared by every surface (language switcher, generic errors, 404).
import { defineDict } from "./core";

export const commonDict = defineDict({
  ca: {
    language: "Idioma",
    lang_saved: "Idioma desat",
    err_title: "Alguna cosa ha fallat",
    err_body: "No hem pogut carregar aquesta pàgina. Torna-ho a provar. Les respostes que ja has enviat estan guardades.",
    err_retry: "Torna-ho a provar",
    modal_cancel: "Cancel·la",
    modal_close: "Tanca",
    nf_title: "No trobem aquesta pàgina",
    nf_body: "L'enllaç potser és antic o l'adreça no és correcta.",
    nf_home: "Torna a l'inici",
  },
  es: {
    language: "Idioma",
    lang_saved: "Idioma guardado",
    err_title: "Algo ha fallado",
    err_body: "No hemos podido cargar esta página. Inténtalo de nuevo. Las respuestas que ya has enviado están guardadas.",
    err_retry: "Inténtalo de nuevo",
    modal_cancel: "Cancela",
    modal_close: "Cierra",
    nf_title: "No encontramos esta página",
    nf_body: "Puede que el enlace sea antiguo o que la dirección no sea correcta.",
    nf_home: "Vuelve al inicio",
  },
  en: {
    language: "Language",
    lang_saved: "Language saved",
    err_title: "Something went wrong",
    err_body: "We could not load this page. Try again. The answers you have already sent are saved.",
    err_retry: "Try again",
    modal_cancel: "Cancel",
    modal_close: "Close",
    nf_title: "We can't find this page",
    nf_body: "The link may be old or the address may be wrong.",
    nf_home: "Back to the start",
  },
});
