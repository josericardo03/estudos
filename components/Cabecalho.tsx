"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatarRelogio, segundosDaFase, useAgora, useCronometro } from "@/lib/cronometro";
import { repo } from "@/lib/repo";
import { useConsulta } from "@/lib/useConsulta";

const links = [
  { href: "/hoje", nome: "Hoje" },
  { href: "/", nome: "Matérias" },
  { href: "/banco", nome: "Banco" },
  { href: "/desempenho", nome: "Desempenho" },
  { href: "/estudo", nome: "Estudo" },
  { href: "/editais", nome: "Editais" },
  { href: "/dados", nome: "Dados" },
];

function ativo(href: string, caminho: string) {
  if (href === "/") {
    if (caminho.includes("/pdfs/")) return false;
    return caminho === "/" || caminho.startsWith("/materias");
  }
  return caminho === href || caminho.startsWith(`${href}/`);
}

function Relogio() {
  const cronometro = useCronometro();
  const agora = useAgora(Boolean(cronometro));
  if (!cronometro) return null;
  const passados = agora === 0 ? 0 : segundosDaFase(cronometro, agora);
  const mostrado = cronometro.duracaoS > 0 ? cronometro.duracaoS - passados : passados;
  return (
    <Link
      href="/estudo"
      className="hidden shrink-0 items-center gap-2 text-sm text-muted no-underline hover:underline md:flex"
      aria-label={`${cronometro.fase === "foco" ? "Estudando" : "Pausa"}, ${formatarRelogio(mostrado)}`}
    >
      <span
        className={`h-2 w-2 rounded-full ${cronometro.fase === "foco" ? "bg-[#3d9a6a]" : "bg-media"}`}
        aria-hidden
      />
      <span className="tabular-nums">
        {cronometro.fase === "foco" ? "Estudando" : "Pausa"} {formatarRelogio(mostrado)}
      </span>
    </Link>
  );
}

export function Cabecalho() {
  const caminho = usePathname();
  const leitor = caminho.match(/^(\/materias\/[^/]+\/pdfs\/[^/]+)/)?.[1];
  const { dados: vencidas } = useConsulta(() => repo.questoes.contarVencidas(), [], 0);
  return (
    <header
      className="sticky top-0 z-30 border-b border-line bg-[var(--header-bg)] backdrop-blur"
      style={{ height: "var(--header-h)", paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <a href="#conteudo" className="pular-conteudo">
        Pular para o conteúdo
      </a>
      <div className="flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-6">
        <Link href="/hoje" className="shrink-0 leading-none no-underline">
          <span className="block font-serif text-lg tracking-[0.14em] text-pine sm:text-xl">FOCO</span>
          <span className="olho">estudo</span>
        </Link>
        <nav className="nav-rolagem flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm" aria-label="Seções">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`shrink-0 ${ativo(link.href, caminho) ? "nav-link nav-link-ativa" : "nav-link"}`}
              aria-current={ativo(link.href, caminho) ? "page" : undefined}
            >
              {link.nome}
              {link.href === "/hoje" && vencidas > 0 ? (
                <span className="ml-1.5 rounded-full bg-alta px-1.5 py-0.5 text-[0.68rem] leading-none text-white">
                  {vencidas > 99 ? "99+" : vencidas}
                  <span className="sr-only"> questões vencidas</span>
                </span>
              ) : null}
            </Link>
          ))}
          {leitor ? (
            <Link href={leitor} className="nav-link nav-link-ativa shrink-0" aria-current="page">
              Leitor
            </Link>
          ) : null}
        </nav>
        <Relogio />
      </div>
    </header>
  );
}
