"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", nome: "Matérias" },
  { href: "/banco", nome: "Banco" },
  { href: "/editais", nome: "Editais" },
];

function ativo(href: string, caminho: string) {
  if (href === "/") return caminho === "/" || caminho.startsWith("/materias");
  return caminho === href || caminho.startsWith(`${href}/`);
}

export function Cabecalho() {
  const caminho = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-5">
        <Link href="/" className="leading-none no-underline">
          <span className="block font-serif text-2xl tracking-tight text-ink">Foco</span>
          <span className="olho">estudo</span>
        </Link>
        <nav className="flex gap-5 text-sm" aria-label="Seções">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={ativo(link.href, caminho) ? "nav-link nav-link-ativa" : "nav-link"}
              aria-current={ativo(link.href, caminho) ? "page" : undefined}
            >
              {link.nome}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
