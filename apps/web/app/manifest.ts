import type { MetadataRoute } from "next";
import { employeeDict } from "@/lib/i18n/employee";
import { getTL } from "@/lib/i18n/server";

// Web app manifest for the employee PWA. Icons: white "G" on the Paper ink square (source: app/icon.svg; maskable keeps the glyph inside the safe zone).
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { t, lang } = await getTL(employeeDict);
  return {
    name: "Give a Damm",
    short_name: "Give a Damm",
    description: t("manifest_description"),
    lang,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
