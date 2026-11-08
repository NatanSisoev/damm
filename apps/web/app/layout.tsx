import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "./(employee)/components/sw-register";
import { LangProvider } from "@/lib/i18n/client";
import { getLang } from "@/lib/lang";
import { getTheme } from "@/lib/theme";
import { getT } from "@/lib/i18n/server";
import { signalsDict } from "@/lib/i18n/hr-signals";

// One font for the whole app (docs/style-guide.md): Hanken Grotesk 400, 500, 600 (Latin Extended for Catalan).
const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  display: "swap",
});

// The product name stays "Give a Damm" in every language; only the description is translated.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT(signalsDict);
  return {
    title: { default: "Give a Damm", template: "%s · Give a Damm" },
    description: t("app_description"),
    applicationName: "Give a Damm",
    icons: { apple: "/icons/apple-touch-icon.png" },
    appleWebApp: { capable: true, title: "Give a Damm", statusBarStyle: "default" },
  };
}

// Paper: matches the manifest theme_color and the icon background. A forced theme (cookie) wins over the OS.
export async function generateViewport(): Promise<Viewport> {
  const theme = await getTheme();
  if (theme) return { themeColor: theme === "dark" ? "#0f0f0e" : "#fafaf8" };
  return {
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: "#fafaf8" },
      { media: "(prefers-color-scheme: dark)", color: "#0f0f0e" },
    ],
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await getLang();
  const theme = await getTheme();
  return (
    <html lang={lang} data-theme={theme} suppressHydrationWarning className={`${hanken.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <LangProvider lang={lang}>{children}</LangProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
