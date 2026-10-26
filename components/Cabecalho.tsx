"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", nome: "Matérias" },
  { href: "/banco", nome: "Banco" },
  { href: "/desempenho", nome: "Desempenho" },
  { href: "/editais", nome: "Editais" },
];

function ativo(href: string, caminho: string) {
  if (href === "/") {
    if (caminho.includes("/pdfs/")) return false;
    return caminho === "/" || caminho.startsWith("/materias");
  }
  return caminho === href || caminho.startsWith(`${href}/`);
}

export function Cabecalho() {
  const caminho = usePathname();
  const leitor = caminho.match(/^(\/materias\/[^/]+\/pdfs\/[^/]+)/)?.[1];
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-[#f7f4ee]/95 backdrop-blur">
      <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="justify-self-start leading-none no-underline">
          <span className="block font-serif text-xl tracking-[0.14em] text-pine">FOCO</span>
          <span className="olho">estudo</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm" aria-label="Seções">
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
          {leitor ? (
            <Link
              href={leitor}
              className="nav-link nav-link-ativa"
              aria-current="page"
            >
              Leitor
            </Link>
          ) : null}
        </nav>
        <p className="hidden items-center justify-self-end gap-2 text-sm text-muted sm:flex">
          <span className="h-2 w-2 rounded-full bg-[#3d9a6a]" aria-hidden />
          Foco ativo
        </p>
      </div>
    </header>
  );
}
