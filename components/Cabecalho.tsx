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

const ferramentas = [
  { href: "https://portal.guruja.com.br/aluno", nome: "Guruja", icone: "guruja" },
  { href: "https://perfil.estrategia.com/area-do-aluno", nome: "Estratégia", icone: "estrategia" },
  { href: "https://www.tecconcursos.com.br/questoes/filtrar", nome: "Tec Concursos", icone: "tec" },
  { href: "https://notebook.google.com/", nome: "Notebook", icone: "notebook" },
  { href: "https://gemini.google.com/app", nome: "Gemini", icone: "gemini" },
] as const;

function IconeFerramenta({ icone }: { icone: (typeof ferramentas)[number]["icone"] }) {
  const comum = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    width: 18,
    height: 18,
  };
  if (icone === "guruja") {
    return (
      <svg {...comum}>
        <circle cx="12" cy="8" r="3" />
        <path d="M6.5 19.5c.9-3.2 2.9-4.8 5.5-4.8s4.6 1.6 5.5 4.8" />
      </svg>
    );
  }
  if (icone === "estrategia") {
    return (
      <svg {...comum}>
        <path d="M4.5 6.5h6.2A2.3 2.3 0 0 1 13 8.8V19H7.2A2.7 2.7 0 0 0 4.5 21.7z" />
        <path d="M19.5 6.5h-6.2A2.3 2.3 0 0 0 11 8.8V19h5.8a2.7 2.7 0 0 1 2.7 2.7z" />
      </svg>
    );
  }
  if (icone === "tec") {
    return (
      <svg {...comum}>
        <rect x="5" y="3.5" width="14" height="17" rx="2" />
        <path d="M8.5 8.5h7M8.5 12.5h7M8.5 16.5h4" />
      </svg>
    );
  }
  if (icone === "notebook") {
    return (
      <svg {...comum}>
        <path d="M8 4.5h8.5A1.5 1.5 0 0 1 18 6v13.5H9.2A1.7 1.7 0 0 0 7.5 21.2V4.5z" />
        <path d="M8 4.5v14.5M11.5 8.5h4M11.5 12h4" />
      </svg>
    );
  }
  return (
    <svg {...comum}>
      <path d="M12 3.5l1.5 5.2L18.5 10l-5 1.7L12 17l-1.5-5.3L5.5 10l5-1.3L12 3.5z" />
    </svg>
  );
}

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
      className="app-nav sticky top-0 z-30 border-b border-line bg-[var(--header-bg)] backdrop-blur"
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
                  <span className="sr-only"> cards vencidos</span>
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
        <nav className="atalhos-externos" aria-label="Ferramentas de estudo">
          {ferramentas.map((ferramenta) => (
            <a
              key={ferramenta.nome}
              href={ferramenta.href}
              className="atalho-externo"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={ferramenta.nome}
              title={ferramenta.nome}
            >
              <IconeFerramenta icone={ferramenta.icone} />
            </a>
          ))}
        </nav>
        <Relogio />
      </div>
    </header>
  );
}
