import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "./(employee)/components/sw-register";

// One font for the whole app (docs/visual-identity.md): Hanken Grotesk 400, 500, 700, 800.
const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Escolta activa",
  description: "Plataforma d'escolta activa (dades sintètiques)",
  applicationName: "Escolta activa",
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Escolta", statusBarStyle: "default" },
};

// Paper ink: same as the manifest theme_color and the icon background.
export const viewport: Viewport = {
  themeColor: "#17211a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ca" suppressHydrationWarning className={`${hanken.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
