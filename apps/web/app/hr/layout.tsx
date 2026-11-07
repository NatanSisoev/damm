import Link from "next/link";

export const dynamic = "force-dynamic";

const links = [
  { href: "/hr/need", label: "Necessitat" },
  { href: "/hr/review", label: "Revisió" },
  { href: "/hr/results", label: "Resultats" },
  { href: "/hr/recommendations", label: "Recomanacions" },
];

export default function HrLayout({ children }: LayoutProps<"/hr">) {
  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <header className="mb-6 flex items-center gap-6 border-b pb-3">
        <Link href="/hr" className="font-semibold">Escolta activa · HR</Link>
        <nav className="flex gap-4 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:underline">{l.label}</Link>
          ))}
        </nav>
      </header>
      <main>{children}</main>
      <footer className="mt-10 text-xs opacity-60">
        Dades sintètiques. Grups de menys de 10 respondents suprimits. La IA proposa, una persona decideix.
      </footer>
    </div>
  );
}
