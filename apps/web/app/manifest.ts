import type { MetadataRoute } from "next";

// Web app manifest for the employee PWA. Icons: white "E" on the Paper ink square (source: app/icon.svg; maskable keeps the glyph inside the safe zone).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Escolta activa",
    short_name: "Escolta",
    description: "Respon unes quantes preguntes curtes cada dia, de manera anònima.",
    lang: "ca",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#eef0ea",
    theme_color: "#17211a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
