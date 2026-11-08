import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "./(employee)/components/sw-register";
import { LangProvider } from "@/lib/i18n/client";
import { getLang } from "@/lib/lang";
import { getT } from "@/lib/i18n/server";
import { signalsDict } from "@/lib/i18n/hr-signals";

// One font for the whole app (docs/visual-identity.md): Hanken Grotesk 400, 500, 700, 800.
const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  display: "swap",
});

// The product name stays "Escolta activa" in every language; only the description is translated.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT(signalsDict);
  return {
    title: { default: "Escolta activa", template: "%s · Escolta activa" },
    description: t("app_description"),
    applicationName: "Escolta activa",
    icons: { apple: "/icons/apple-touch-icon.png" },
    appleWebApp: { capable: true, title: "Escolta", statusBarStyle: "default" },
  };
}

// Paper ink: same as the manifest theme_color and the icon background.
export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await getLang();
  return (
    <html lang={lang} suppressHydrationWarning className={`${hanken.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <LangProvider lang={lang}>{children}</LangProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
