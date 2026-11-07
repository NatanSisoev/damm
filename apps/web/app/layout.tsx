import type { Metadata, Viewport } from "next";
import { Alfa_Slab_One, Geist_Mono, Hanken_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import "./brand.css";
import { ServiceWorkerRegister } from "./(employee)/components/sw-register";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Employee brand fonts (used only inside `.brand`, see brand.css). Display is not preloaded.
const alfa = Alfa_Slab_One({ variable: "--font-alfa", subsets: ["latin"], weight: "400", display: "swap", preload: false });
const hanken = Hanken_Grotesk({ variable: "--font-hanken", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Escolta activa",
  description: "Plataforma d'escolta activa (dades sintètiques)",
  applicationName: "Escolta activa",
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Escolta", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#eb0505",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ca" suppressHydrationWarning className={`${inter.variable} ${geistMono.variable} ${alfa.variable} ${hanken.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
