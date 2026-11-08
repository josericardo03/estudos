"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { resumoDoCard } from "@/lib/cards";
import { sugerirLacunas } from "@/lib/cloze";
import { mensagemErro, mensagemPdf } from "@/lib/erros";
import { abrirDocumento, carregarPdfjs, escalaCss, medidaNitida, type DocumentoPdf } from "@/lib/pdf";
import { usePreferencia } from "@/lib/preferencias";
import { normalizarRects } from "@/lib/rects";
import { repo } from "@/lib/repo";
import { caminhoMateria } from "@/lib/rotas";
import { Caderno } from "../Caderno";
import { PainelBusca } from "./PainelBusca";
import type { CorGrifo, Grifo, PostIt, Questao, Rect, TipoCard } from "@/lib/types";
import { IMPORTANTE, PRIORIDADES, nomeDaCor } from "@/lib/types";
import { useTema } from "@/lib/tema";
import { useConsulta } from "@/lib/useConsulta";
import { Abrindo, Aviso, Confirmar, NaoEncontrado, QuestaoConferencia } from "../ui";

type Selecao = { texto: string; rects: Rect[]; x: number; y: number };
type Medida = { w: number; h: number; escala: number; pagina: number; roundX: number; roundY: number };
type Rascunho = { id: string; x: number; y: number };

function cancelado(erro: unknown) {
  return (
    erro instanceof Error &&
    (erro.name === "AbortException" ||
      erro.name === "RenderingCancelledException" ||
      erro.name === "AbortError")
  );
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;

function limitar(valor: number, minimo: number, maximo: number) {
  return Math.min(maximo, Math.max(minimo, valor));
}

function porcentagemZoom(escala: number) {
  return String(Math.round(escala * 100));
}

function spansDeTexto(folha: HTMLElement) {
  return [...folha.querySelectorAll<HTMLElement>(".textLayer span")].filter((span) => {
    if (!span.textContent?.trim()) return false;
    const caixa = span.getBoundingClientRect();
    return caixa.width > 0.5 && caixa.height > 0.5;
  });
}

function rectNormalizado(folha: HTMLElement, left: number, top: number, right: number, bottom: number): Rect {
  const caixa = folha.getBoundingClientRect();
  const largura = Math.max(caixa.width, 1);
  const altura = Math.max(caixa.height, 1);
  const x = limitar((left - caixa.left) / largura, 0, 1);
  const y = limitar((top - caixa.top) / altura, 0, 1);
  return {
    x,
    y,
    w: limitar((right - left) / largura, 0, 1 - x),
    h: limitar((bottom - top) / altura, 0, 1 - y),
  };
}

function unirSpans(folha: HTMLElement, spans: HTMLElement[]): Rect | null {
  if (!spans.length) return null;
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const span of spans) {
    const caixa = span.getBoundingClientRect();
    left = Math.min(left, caixa.left);
    right = Math.max(right, caixa.right);
    top = Math.min(top, caixa.top);
    bottom = Math.max(bottom, caixa.bottom);
  }
  if (!Number.isFinite(left) || right - left < 1) return null;
  return rectNormalizado(folha, left, top, right, bottom);
}

function linhaSobPonto(folha: HTMLElement, clienteX: number, clienteY: number): Rect | null {
  const spans = spansDeTexto(folha);
  if (!spans.length) return null;
  let melhor: HTMLElement | null = null;
  let distancia = Infinity;
  for (const span of spans) {
    const caixa = span.getBoundingClientRect();
    const folga = Math.max(8, caixa.height * 0.45);
    if (clienteY < caixa.top - folga || clienteY > caixa.bottom + folga) continue;
    const centro = caixa.top + caixa.height / 2;
    const fora =
      clienteX < caixa.left ? caixa.left - clienteX : clienteX > caixa.right ? clienteX - caixa.right : 0;
    const nota = Math.abs(clienteY - centro) + fora * 0.2;
    if (nota < distancia) {
      distancia = nota;
      melhor = span;
    }
  }
  if (!melhor) return null;
  const base = melhor.getBoundingClientRect();
  const meio = base.top + base.height / 2;
  if (Math.abs(clienteY - meio) > Math.max(18, base.height * 0.9)) return null;
  const tolerancia = Math.max(3, base.height * 0.45);
  const daLinha = spans.filter((span) => {
    const caixa = span.getBoundingClientRect();
    return Math.abs(caixa.top + caixa.height / 2 - meio) <= tolerancia;
  });
  return unirSpans(folha, daLinha);
}

function linhasEntre(folha: HTMLElement, yInicio: number, yFim: number): Rect[] {
  const spans = spansDeTexto(folha);
  const topo = Math.min(yInicio, yFim);
  const baixo = Math.max(yInicio, yFim);
  const grupos: HTMLElement[][] = [];
  for (const span of spans) {
    const caixa = span.getBoundingClientRect();
    const centro = caixa.top + caixa.height / 2;
    if (centro < topo - 4 || centro > baixo + 4) continue;
    const grupo = grupos.find((itens) => {
      const referencia = itens[0].getBoundingClientRect();
      const meio = referencia.top + referencia.height / 2;
      return Math.abs(centro - meio) <= Math.max(3, referencia.height * 0.45);
    });
    if (grupo) grupo.push(span);
    else grupos.push([span]);
  }
  return grupos.flatMap((grupo) => {
    const rect = unirSpans(folha, grupo);
    return rect ? [rect] : [];
  });
}

function textoSobRects(folha: HTMLElement, rects: Rect[]) {
  const caixa = folha.getBoundingClientRect();
  const zonas = rects.map((rect) => ({
    left: caixa.left + rect.x * caixa.width,
    top: caixa.top + rect.y * caixa.height,
    right: caixa.left + (rect.x + rect.w) * caixa.width,
    bottom: caixa.top + (rect.y + rect.h) * caixa.height,
  }));
  const partes: string[] = [];
  folha.querySelectorAll(".textLayer span").forEach((span) => {
    const item = span.getBoundingClientRect();
    const cruza = zonas.some(
      (zona) => item.right > zona.left && item.left < zona.right && item.bottom > zona.top && item.top < zona.bottom,
    );
    if (cruza && span.textContent) partes.push(span.textContent);
  });
  return partes.join(" ").replace(/\s+/g, " ").trim();
}

function caixaEnvolvente(rects: Rect[], folga: number): Rect {
  const x = Math.max(0, Math.min(...rects.map((rect) => rect.x)) - folga);
  const y = Math.max(0, Math.min(...rects.map((rect) => rect.y)) - folga);
  const direita = Math.min(1, Math.max(...rects.map((rect) => rect.x + rect.w)) + folga);
  const baixo = Math.min(1, Math.max(...rects.map((rect) => rect.y + rect.h)) + folga);
  return { x, y, w: direita - x, h: baixo - y };
}

function telaEstreita() {
  return window.matchMedia("(max-width: 767px)").matches;
}

function useTelaEstreita() {
  return useSyncExternalStore(
    (avisar) => {
      const consulta = window.matchMedia("(max-width: 767px)");
      consulta.addEventListener("change", avisar);
      return () => consulta.removeEventListener("change", avisar);
    },
    telaEstreita,
    () => false,
  );
}

function recortarCanvas(canvas: HTMLCanvasElement, rect: Rect) {
  const sx = Math.round(rect.x * canvas.width);
  const sy = Math.round(rect.y * canvas.height);
  const sw = Math.max(1, Math.round(rect.w * canvas.width));
  const sh = Math.max(1, Math.round(rect.h * canvas.height));
  const destino = document.createElement("canvas");
  destino.width = sw;
  destino.height = sh;
  const contexto = destino.getContext("2d");
  if (!contexto) return Promise.resolve(null);
  contexto.fillStyle = "#fff";
  contexto.fillRect(0, 0, sw, sh);
  contexto.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return new Promise<Blob | null>((resolver) => destino.toBlob(resolver, "image/png"));
}

function BarraLado({
  nome,
  aoAjustar,
  aoOcultar,
  aoDivisao,
}: {
  nome: "cadernão" | "painel" | "busca";
  aoAjustar: (delta: number) => void;
  aoOcultar: () => void;
  aoDivisao: (evento: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const titulo = nome === "cadernão" ? "Cadernão" : nome === "busca" ? "Busca" : "Painel";
  return (
    <>
      <button
        type="button"
        className="divisor-lado hidden lg:block"
        aria-label={`Arraste para mudar o tamanho do PDF e do ${nome}`}
        onPointerDown={aoDivisao}
        onKeyDown={(evento) => {
          if (evento.key !== "ArrowLeft" && evento.key !== "ArrowRight") return;
          evento.preventDefault();
          evento.stopPropagation();
          aoAjustar(evento.key === "ArrowLeft" ? 40 : -40);
        }}
      />
      <div className="mb-2 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn so-largo" onClick={() => aoAjustar(-140)}>
          PDF maior
        </button>
        <button type="button" className="btn so-largo" onClick={() => aoAjustar(140)}>
          {titulo} maior
        </button>
        <button type="button" className="btn" onClick={aoOcultar}>
          Ocultar {nome}
        </button>
      </div>
    </>
  );
}

type FocoMarca = { id: string; pagina: number; y: number };

export function LeitorPdf({
  materiaId,
  pdfId,
  paginaInicial,
  paginaExplicita,
  marcaInicial,
}: {
  materiaId: string;
  pdfId: string;
  paginaInicial: number;
  /** A URL pediu uma página. Sem isso, o leitor volta para onde você parou. */
  paginaExplicita: boolean;
  marcaInicial?: string | null;
}) {
  const palcoRef = useRef<HTMLDivElement>(null);
  const trilhoRef = useRef<HTMLDivElement>(null);
  const folhaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textoRef = useRef<HTMLDivElement>(null);
  const docIdRef = useRef<string | null>(null);
  const ajusteManual = useRef(false);
  const origemMarca = useRef<{ x: number; y: number } | null>(null);
  const inicioToque = useRef<{ x: number; y: number } | null>(null);
  const quadroMarca = useRef(0);
  const questoesDialogo = useRef<HTMLDialogElement>(null);
  const campoEnunciado = useRef<HTMLTextAreaElement>(null);
  const marcasParaDesfazer = useRef<{ id: string; pagina: number }[]>([]);
  const desfazerRef = useRef<() => void>(() => {});
  const criarCardRef = useRef<() => void>(() => {});
  const grifosAtuais = useRef<Grifo[]>([]);
  const paginaRestaurada = useRef(false);

  const [documento, setDocumento] = useState<DocumentoPdf | null>(null);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pagina, setPagina] = useState(() => Math.max(1, paginaInicial || 1));
  const [origem, setOrigem] = useState(paginaInicial);
  const [escala, setEscala] = useState(1);
  const [zoomRascunho, setZoomRascunho] = useState<string | null>(null);
  const [medida, setMedida] = useState<Medida | null>(null);
  const [pronta, setPronta] = useState(false);
  const [temTexto, setTemTexto] = useState(true);
  const [selecao, setSelecao] = useState<Selecao | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [corMarca, setCorMarca] = useState<CorGrifo | null>(null);
  const [sublinhando, setSublinhar] = useState(false);
  const [riscos, setRiscos] = useState<{ id: string; pagina: number; rects: Rect[] }[]>([]);
  const [traco, setTraco] = useState<Rect | null>(null);
  const [postit, setPostit] = useState("");
  const [colocandoPostit, setColocandoPostit] = useState(false);
  const [postitAberto, setPostitAberto] = useState<string | null>(null);
  const [painel, setPainel] = useState<"anotacoes" | "caderno" | "busca" | "oculto">("anotacoes");
  const [termoBusca, setTermoBusca] = useState("");
  const [ferramentas, setFerramentas] = useState(false);
  const [barra, setBarra] = useState(true);
  const [modoFoco, setModoFoco] = useState(false);
  const [menuGrifo, setMenuGrifo] = useState(false);
  const [escrevendoPostit, setEscrevendoPostit] = useState(false);
  const estreita = useTelaEstreita();
  const [abriuNoCelular, setAbriuNoCelular] = useState(false);
  if (estreita && !abriuNoCelular) {
    setAbriuNoCelular(true);
    if (painel === "anotacoes") setPainel("oculto");
  }
  const [larguraPainel, setLarguraPainel] = useState(400);
  const [larguraCaderno, setLarguraCaderno] = useState(640);
  const [enunciado, setEnunciado] = useState("");
  const [resposta, setResposta] = useState("");
  const [tipoCard, setTipoCard] = useState<TipoCard>("lacuna");
  const [topicoId, setTopicoId] = useState("");
  const [imagemCard, setImagemCard] = useState<Blob | null>(null);
  const [guardandoQuestao, setGuardandoQuestao] = useState(false);
  const [editandoQuestao, setEditandoQuestao] = useState<string | null>(null);
  const [foco, setFoco] = useState<FocoMarca | null>(null);
  const [marcaAplicada, setMarcaAplicada] = useState<string | null>(null);
  const [inversao, definirInversao] = usePreferencia<"auto" | "sim" | "nao">("foco.pdfInvertido", "auto");
  const tema = useTema();
  const invertido = inversao === "sim" || (inversao === "auto" && tema === "escuro");

  if (paginaInicial !== origem) {
    setOrigem(paginaInicial);
    const proxima = Math.max(1, paginaInicial || 1);
    setPagina(proxima);
  }

  const { dados: arquivo, pronto: arquivoPronto, erro: erroArquivo } = useConsulta(
    () => repo.pdfs.obter(pdfId, { arquivo: true }),
    [pdfId],
    null,
  );
  const { dados: materia } = useConsulta(
    () => (arquivo ? repo.materias.obter(arquivo.materiaId) : Promise.resolve(null)),
    [arquivo?.materiaId],
    null,
  );
  const { dados: grifos, pronto: grifosProntos } = useConsulta(() => repo.grifos.listarPorPdf(pdfId), [pdfId], []);
  const { dados: postits, pronto: postitsProntos } = useConsulta(() => repo.postits.listarPorPdf(pdfId), [pdfId], []);
  const { dados: questoes } = useConsulta(() => repo.questoes.listarPorPdf(pdfId), [pdfId], []);
  const { dados: topicos } = useConsulta(() => repo.topicos.listarTodos(), [], []);
  const arquivoRef = useRef(arquivo);
  useEffect(() => {
    arquivoRef.current = arquivo;
  });

  useEffect(() => {
    grifosAtuais.current = grifos;
  }, [grifos]);

  useLayoutEffect(() => {
    if (!modoFoco) return;
    document.documentElement.dataset.leituraFoco = "1";
    return () => {
      delete document.documentElement.dataset.leituraFoco;
    };
  }, [modoFoco]);

  const total = documento?.numPages ?? arquivo?.numPages ?? 1;
  const paginaNumero = Number.isFinite(pagina) ? pagina : 1;
  const paginaSegura = Math.min(total, Math.max(1, paginaNumero));

  if (marcaInicial && marcaAplicada !== marcaInicial && grifosProntos && postitsProntos) {
    setMarcaAplicada(marcaInicial);
    const grifoInicial = grifos.find((item) => item.id === marcaInicial);
    const postitInicial = postits.find((item) => item.id === marcaInicial);
    if (grifoInicial) {
      setPagina(grifoInicial.pagina);
      setFoco({
        id: grifoInicial.id,
        pagina: grifoInicial.pagina,
        y: Math.min(...grifoInicial.rects.map((rect) => rect.y)),
      });
    } else if (postitInicial) {
      setPagina(postitInicial.pagina);
      setFoco({ id: postitInicial.id, pagina: postitInicial.pagina, y: postitInicial.y });
    }
  }

  const [paginaVista, setPaginaVista] = useState(paginaSegura);
  if (paginaVista !== paginaSegura) {
    setPaginaVista(paginaSegura);
    setColocandoPostit(false);
    setPostitAberto(null);
    setEditandoQuestao(null);
  }
  useEffect(() => {
    questoesDialogo.current?.close();
  }, [paginaSegura]);

  useEffect(() => {
    if (!postitAberto) return;
    document.getElementById(`postit-${postitAberto}`)?.scrollIntoView({ block: "nearest" });
  }, [postitAberto]);

  useEffect(() => {
    const arquivoId = arquivo?.id;
    const blob = arquivoRef.current?.blob;
    if (!arquivoId || !blob) return;
    let ativo = true;
    let doc: DocumentoPdf | null = null;
    void (async () => {
      try {
        const aberto = await abrirDocumento(await blob.arrayBuffer());
        if (!ativo) {
          await aberto.loadingTask.destroy();
          return;
        }
        doc = aberto;
        docIdRef.current = arquivoId;
        if (!paginaExplicita && !marcaInicial) {
          const salva = arquivoRef.current?.ultimaPagina ?? 0;
          if (Number.isInteger(salva) && salva > 1 && salva <= aberto.numPages) setPagina(salva);
        }
        paginaRestaurada.current = true;
        setErroLeitura(null);
        setDocumento(aberto);
      } catch (falha) {
        if (ativo) setErroLeitura(mensagemPdf(falha));
      }
    })();
    return () => {
      ativo = false;
      docIdRef.current = null;
      void doc?.loadingTask.destroy();
    };
    // paginaExplicita e marcaInicial só importam na abertura do arquivo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arquivo?.id]);

  // A página fica guardada no banco, então acompanha você em qualquer aparelho.
  useEffect(() => {
    if (!documento || !paginaRestaurada.current) return;
    const espera = setTimeout(() => {
      void repo.pdfs.registrarLeitura(pdfId, paginaSegura).catch(() => {
        /* guardar a página é só uma comodidade */
      });
    }, 1200);
    return () => clearTimeout(espera);
  }, [documento, paginaSegura, pdfId]);

  // Destaca o termo buscado na camada de texto da página aberta.
  useEffect(() => {
    const camada = textoRef.current;
    if (!camada || !pronta) return;
    const procurado = termoBusca
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    camada.querySelectorAll("span").forEach((trecho) => {
      const texto = (trecho.textContent ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      trecho.classList.toggle("achado", procurado.length > 1 && texto.includes(procurado));
    });
  }, [termoBusca, pronta, paginaSegura]);

  useEffect(() => {
    const palco = palcoRef.current;
    if (!palco || !documento) return;
    let quadro = 0;
    let pedido = 0;
    let ativo = true;
    const medir = () => {
      if (!ativo || ajusteManual.current) return;
      const atual = ++pedido;
      const estilo = getComputedStyle(palco);
      const folga =
        parseFloat(estilo.paddingLeft) + parseFloat(estilo.paddingRight) + parseFloat(estilo.borderLeftWidth) + parseFloat(estilo.borderRightWidth);
      const trilho = trilhoRef.current?.offsetWidth ?? 0;
      const largura = Math.max(280, palco.clientWidth - folga - 16 - trilho);
      void documento.getPage(paginaSegura).then((page) => {
        if (!ativo || ajusteManual.current || atual !== pedido) {
          page.cleanup();
          return;
        }
        const base = page.getViewport({ scale: escalaCss(1) });
        const proxima = Number(limitar(largura / base.width, ZOOM_MIN, 1.8).toFixed(2));
        page.cleanup();
        setEscala((atual) => (Math.abs(atual - proxima) < 0.01 ? atual : proxima));
      });
    };
    medir();
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(medir);
    });
    observer.observe(palco);
    return () => {
      ativo = false;
      observer.disconnect();
      cancelAnimationFrame(quadro);
    };
  }, [documento, paginaSegura, barra, estreita]);

  useEffect(() => {
    const folha = folhaRef.current;
    const canvas = canvasRef.current;
    const texto = textoRef.current;
    if (!documento || !folha || !canvas || !texto || docIdRef.current !== pdfId) return;

    let canceladoRender = false;
    const tarefa: {
      render: { cancel: () => void; promise: Promise<void> } | null;
      camada: { cancel: () => void } | null;
      page: { cleanup: () => void } | null;
    } = { render: null, camada: null, page: null };

    setPronta(false);
    void (async () => {
      try {
        const pdfjs = await carregarPdfjs();
        if (canceladoRender) return;
        const page = await documento.getPage(paginaSegura);
        tarefa.page = page;
        if (canceladoRender) return;
        const viewport = page.getViewport({ scale: escalaCss(escala) });
        const nitida = medidaNitida(viewport.width, viewport.height, window.devicePixelRatio || 1);
        folha.style.width = `${nitida.cssLargura}px`;
        folha.style.height = `${nitida.cssAltura}px`;
        folha.style.setProperty("--scale-factor", String(viewport.scale));
        folha.style.setProperty("--scale-round-x", `${nitida.roundX}px`);
        folha.style.setProperty("--scale-round-y", `${nitida.roundY}px`);
        setMedida({
          w: nitida.cssLargura,
          h: nitida.cssAltura,
          escala: viewport.scale,
          pagina: paginaSegura,
          roundX: nitida.roundX,
          roundY: nitida.roundY,
        });

        canvas.width = nitida.canvasLargura;
        canvas.height = nitida.canvasAltura;
        canvas.style.width = `${nitida.cssLargura}px`;
        canvas.style.height = `${nitida.cssAltura}px`;
        const renderizacao = page.render({
          canvas,
          viewport,
          transform: [nitida.sx, 0, 0, nitida.sy, 0, 0],
        });
        tarefa.render = renderizacao;
        if (canceladoRender) {
          renderizacao.cancel();
          return;
        }
        await renderizacao.promise;
        if (canceladoRender) return;

        texto.replaceChildren();
        const camada = new pdfjs.TextLayer({
          textContentSource: page.streamTextContent(),
          container: texto,
          viewport,
        });
        tarefa.camada = camada;
        if (canceladoRender) {
          camada.cancel();
          return;
        }
        await camada.render();
        if (canceladoRender) return;
        setTemTexto(camada.textContentItemsStr.some((item) => item.trim().length > 0));
        setPronta(true);
        setErro(null);
        const seguinte = paginaSegura + 1;
        if (seguinte <= documento.numPages) {
          const aquecer = () => {
            if (canceladoRender) return;
            void documento
              .getPage(seguinte)
              .then((proxima) => proxima.getOperatorList())
              .catch(() => {
                /* o pré-carregamento é só uma ajuda */
              });
          };
          if ("requestIdleCallback" in window) window.requestIdleCallback(aquecer, { timeout: 1500 });
          else setTimeout(aquecer, 250);
        }
      } catch (falha) {
        if (canceladoRender || cancelado(falha)) return;
        setErro(mensagemPdf(falha));
        setPronta(true);
      }
    })();

    return () => {
      canceladoRender = true;
      tarefa.render?.cancel();
      tarefa.camada?.cancel();
      tarefa.page?.cleanup();
    };
  }, [documento, escala, paginaSegura, pdfId]);

  useEffect(() => {
    function aoSoltar(evento: MouseEvent) {
      const alvo = evento.target;
      if (alvo instanceof Element && alvo.closest("[data-barra-grifo]")) return;
      textoRef.current?.classList.remove("selecting");
      const folha = folhaRef.current;
      const selecaoAtual = window.getSelection();
      if (
        !folha ||
        !selecaoAtual ||
        selecaoAtual.isCollapsed ||
        !folha.contains(selecaoAtual.anchorNode) ||
        !folha.contains(selecaoAtual.focusNode)
      ) {
        setSelecao(null);
        return;
      }
      const texto = selecaoAtual.toString().replace(/\s+/g, " ").trim();
      if (!texto) {
        setSelecao(null);
        return;
      }
      const range = selecaoAtual.getRangeAt(0);
      const rects = normalizarRects(folha.getBoundingClientRect(), Array.from(range.getClientRects()));
      if (!rects.length) {
        setSelecao(null);
        return;
      }
      const caixa = range.getBoundingClientRect();
      setSelecao({ texto, rects, x: caixa.left, y: caixa.top });
    }
    document.addEventListener("mouseup", aoSoltar);
    return () => document.removeEventListener("mouseup", aoSoltar);
  }, []);

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if ((evento.ctrlKey || evento.metaKey) && !evento.shiftKey && evento.key.toLowerCase() === "f") {
        evento.preventDefault();
        setPainel("busca");
        requestAnimationFrame(() => document.getElementById("busca-pdf")?.focus());
        return;
      }
      const alvo = evento.target;
      if (
        alvo instanceof HTMLElement &&
        (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT" || alvo.isContentEditable)
      ) {
        return;
      }
      if (evento.key === "ArrowRight") {
        evento.preventDefault();
        setPagina((atual) => Math.min(total, Math.max(1, atual) + 1));
      }
      if (evento.key === "ArrowLeft") {
        evento.preventDefault();
        setPagina((atual) => Math.max(1, atual - 1));
      }
      if (evento.key.toLowerCase() === "c" && !evento.ctrlKey && !evento.metaKey && !evento.altKey) {
        criarCardRef.current();
      }
      if (evento.key === "Escape") {
        setCorMarca(null);
        setSublinhar(false);
        setColocandoPostit(false);
        setPostitAberto(null);
      }
      if ((evento.ctrlKey || evento.metaKey) && !evento.shiftKey && evento.key.toLowerCase() === "z") {
        evento.preventDefault();
        desfazerRef.current();
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [total]);

  useEffect(() => {
    if (!foco || !pronta || medida?.pagina !== paginaSegura || foco.pagina !== paginaSegura) return;
    const palco = palcoRef.current;
    const folha = folhaRef.current;
    if (!palco || !folha) return;
    const caixaPalco = palco.getBoundingClientRect();
    const caixaFolha = folha.getBoundingClientRect();
    const delta = caixaFolha.top + foco.y * caixaFolha.height - caixaPalco.top - palco.clientHeight * 0.28;
    const semMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (Math.abs(delta) > 12) palco.scrollBy({ top: delta, behavior: semMovimento ? "auto" : "smooth" });
  }, [foco, pronta, medida, paginaSegura]);

  function desfazerMarcacao() {
    let alvo: { id: string; pagina: number } | undefined;
    while (marcasParaDesfazer.current.length) {
      const item = marcasParaDesfazer.current.pop();
      if (!item) continue;
      if (item.id.startsWith("risco:")) {
        const riscoId = item.id.slice("risco:".length);
        setRiscos((atuais) => atuais.filter((risco) => risco.id !== riscoId));
        setErro(null);
        setAviso("Linha de volta.");
        return;
      }
      if (grifosAtuais.current.some((grifo) => grifo.id === item.id)) {
        alvo = item;
        break;
      }
    }
    if (!alvo) {
      setErro(null);
      setAviso("Não há marcação para desfazer.");
      return;
    }
    setPagina(alvo.pagina);
    setCorMarca(null);
    setTraco(null);
    origemMarca.current = null;
    void repo.grifos.remover(alvo.id).then(
      () => {
        setErro(null);
        setAviso("Marcação desfeita.");
      },
      (falha) => setErro(mensagemErro(falha, "Não foi possível desfazer a marcação.")),
    );
  }

  useEffect(() => {
    desfazerRef.current = desfazerMarcacao;
  });

  function preencherCard(texto: string, tipo: TipoCard, imagem?: Blob | null) {
    setTipoCard(tipo);
    if (tipo === "lacuna") {
      setEnunciado(sugerirLacunas(texto));
      setResposta("");
    } else {
      setEnunciado("");
      setResposta(texto);
    }
    setImagemCard(imagem ?? null);
    setPainel("anotacoes");
    setErro(null);
    requestAnimationFrame(() => {
      const campo = document.getElementById("enunciado-leitor");
      campo?.scrollIntoView({ block: "center" });
      campo?.focus();
    });
  }

  function criarCardDaSelecao() {
    if (!selecao) return;
    preencherCard(selecao.texto, "lacuna");
    window.getSelection()?.removeAllRanges();
    setSelecao(null);
  }

  useEffect(() => {
    criarCardRef.current = criarCardDaSelecao;
  });

  if (!arquivoPronto) return <Abrindo texto="Abrindo o PDF…" />;
  if (erroArquivo) return <div className="px-5 py-10"><Aviso texto={erroArquivo} /></div>;
  if (!arquivo || arquivo.materiaId !== materiaId) {
    return <NaoEncontrado titulo="PDF não encontrado" detalhe="Esse arquivo não está nesta matéria." />;
  }

  const grifosDaPagina = grifos.filter((grifo) => grifo.pagina === paginaSegura);
  const postitsDaPagina = postits
    .filter((item) => item.pagina === paginaSegura)
    .sort((a, b) => a.y - b.y || a.createdAt - b.createdAt);
  const cardsDaPagina = questoes.filter((questao) => questao.pagina === paginaSegura);
  const topicosDaMateria = topicos.filter((topico) => !topico.materiaId || topico.materiaId === materiaId);
  const medidaAtual = medida?.pagina === paginaSegura ? medida : null;

  async function gravarGrifo(cor: CorGrifo, texto: string, rects: Rect[]) {
    setErro(null);
    setAviso(null);
    try {
      const canvas = canvasRef.current;
      const imagem =
        cor === IMPORTANTE.id && canvas ? ((await recortarCanvas(canvas, rects[0])) ?? undefined) : undefined;
      const criado = await repo.grifos.criar({ pdfId, pagina: paginaSegura, texto, cor, rects, imagem });
      marcasParaDesfazer.current.push({ id: criado.id, pagina: criado.pagina });
      grifosAtuais.current = [...grifosAtuais.current.filter((item) => item.id !== criado.id), criado];
      setAviso(
        cor === IMPORTANTE.id
          ? "Marcado como importante. O recorte foi para o cadernão."
          : `Marcado em ${nomeDaCor(cor).toLowerCase()}.`,
      );
      setCorMarca(cor);
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível marcar."));
    }
  }

  async function grifar(cor: CorGrifo) {
    if (!selecao) return;
    const rects = cor === IMPORTANTE.id ? [caixaEnvolvente(selecao.rects, 0.006)] : selecao.rects;
    await gravarGrifo(cor, selecao.texto, rects);
    window.getSelection()?.removeAllRanges();
    setSelecao(null);
  }

  function mesmaLinha(rect: Rect, outro: Rect) {
    const centro = rect.y + rect.h / 2;
    const outroCentro = outro.y + outro.h / 2;
    const tolerancia = Math.max(rect.h, outro.h) * 0.45;
    const sobrepoe = rect.x < outro.x + outro.w && outro.x < rect.x + rect.w;
    return Math.abs(centro - outroCentro) <= tolerancia && sobrepoe;
  }

  function anotarRisco(rects: Rect[]) {
    const id = crypto.randomUUID();
    setRiscos((atuais) => [...atuais, { id, pagina: paginaSegura, rects }]);
    marcasParaDesfazer.current.push({ id: `risco:${id}`, pagina: paginaSegura });
    setErro(null);
    setAviso("Linha escondida. Toque de novo para mostrar.");
    setSublinhar(true);
    setCorMarca(null);
  }

  function alternarLinha(rect: Rect) {
    const existente = riscos.find(
      (risco) => risco.pagina === paginaSegura && risco.rects.some((outro) => mesmaLinha(rect, outro)),
    );
    if (existente) {
      setRiscos((atuais) => atuais.filter((risco) => risco.id !== existente.id));
      marcasParaDesfazer.current = marcasParaDesfazer.current.filter((item) => item.id !== `risco:${existente.id}`);
      setErro(null);
      setAviso("Linha de volta.");
      return;
    }
    anotarRisco([rect]);
  }


  function escolherRisco() {
    setColocandoPostit(false);
    setMenuGrifo(false);
    setCorMarca(null);
    if (selecao) {
      anotarRisco(selecao.rects);
      window.getSelection()?.removeAllRanges();
      setSelecao(null);
      return;
    }
    setSublinhar((atual) => !atual);
    setTraco(null);
    origemMarca.current = null;
    setAviso(null);
    if (estreita) setFerramentas(false);
  }

  function escolherCor(cor: CorGrifo) {
    setColocandoPostit(false);
    setMenuGrifo(false);
    setSublinhar(false);
    if (selecao) {
      void grifar(cor);
      return;
    }
    if (corMarca === cor) {
      setCorMarca(null);
      setTraco(null);
      origemMarca.current = null;
      setAviso(null);
      return;
    }
    setCorMarca(cor);
    setErro(null);
    setAviso(null);
    if (estreita) setFerramentas(false);
  }

  function entrarFoco() {
    setModoFoco(true);
    setPainel("oculto");
    setBarra(false);
    setFerramentas(false);
    setMenuGrifo(false);
  }

  function sairFoco() {
    setModoFoco(false);
    setBarra(true);
    setFerramentas(false);
    setMenuGrifo(false);
  }

  function pontoNaFolha(evento: React.PointerEvent<HTMLDivElement>) {
    const folha = folhaRef.current;
    if (!folha) return null;
    const caixa = folha.getBoundingClientRect();
    if (caixa.width <= 0 || caixa.height <= 0) return null;
    const yCliente = evento.pointerType === "touch" ? evento.clientY - 28 : evento.clientY;
    return {
      x: limitar((evento.clientX - caixa.left) / caixa.width, 0, 1),
      y: limitar((yCliente - caixa.top) / caixa.height, 0, 1),
    };
  }

  function aoMarcarDown(evento: React.PointerEvent<HTMLDivElement>) {
    if (!corMarca && !sublinhando) return;
    if (evento.pointerType === "touch") evento.preventDefault();
    const ponto = pontoNaFolha(evento);
    if (!ponto) return;
    origemMarca.current = ponto;
    inicioToque.current = { x: evento.clientX, y: evento.clientY };
    try {
      evento.currentTarget.setPointerCapture(evento.pointerId);
    } catch {
      /* o navegador recusa a captura fora de um ponteiro real */
    }
    if (sublinhando) {
      const folha = folhaRef.current;
      setTraco(folha ? linhaSobPonto(folha, evento.clientX, evento.clientY) : null);
      return;
    }
    setTraco({ x: ponto.x, y: ponto.y, w: 0, h: 0 });
  }

  function aoMarcarMove(evento: React.PointerEvent<HTMLDivElement>) {
    const origem = origemMarca.current;
    const ponto = pontoNaFolha(evento);
    if (!origem || !ponto) return;
    const clienteX = evento.clientX;
    const clienteY = evento.clientY;
    // O ponteiro dispara dezenas de eventos por quadro; desenhar o retângulo uma vez por quadro basta.
    cancelAnimationFrame(quadroMarca.current);
    quadroMarca.current = requestAnimationFrame(() => {
      if (!origemMarca.current) return;
      if (sublinhando) {
        const folha = folhaRef.current;
        setTraco(folha ? linhaSobPonto(folha, clienteX, clienteY) : null);
        return;
      }
      setTraco({
        x: Math.min(origem.x, ponto.x),
        y: Math.min(origem.y, ponto.y),
        w: Math.abs(ponto.x - origem.x),
        h: Math.abs(ponto.y - origem.y),
      });
    });
  }

  function aoMarcarUp(evento: React.PointerEvent<HTMLDivElement>) {
    const origem = origemMarca.current;
    const inicio = inicioToque.current;
    origemMarca.current = null;
    inicioToque.current = null;
    const ponto = pontoNaFolha(evento);
    cancelAnimationFrame(quadroMarca.current);
    setTraco(null);
    if (sublinhando) {
      const folha = folhaRef.current;
      if (!folha || !inicio) return;
      const arrastou = Math.hypot(evento.clientX - inicio.x, evento.clientY - inicio.y) > 12;
      if (!arrastou) {
        const linha = linhaSobPonto(folha, evento.clientX, evento.clientY);
        if (!linha) {
          setErro(null);
          setAviso("Toque em cima da linha que quer esconder.");
          return;
        }
        alternarLinha(linha);
        return;
      }
      const linhas = linhasEntre(folha, inicio.y, evento.clientY);
      if (!linhas.length) {
        setErro(null);
        setAviso("Toque em cima da linha que quer esconder.");
        return;
      }
      for (const linha of linhas) {
        const jaTem = riscos.some(
          (risco) => risco.pagina === paginaSegura && risco.rects.some((outro) => mesmaLinha(linha, outro)),
        );
        if (!jaTem) anotarRisco([linha]);
      }
      return;
    }
    if (!origem || !ponto || !corMarca) return;
    const w = Math.abs(ponto.x - origem.x);
    const h = Math.abs(ponto.y - origem.y);
    if (w < 0.012 && h < 0.012) return;
    const rect = {
      x: Math.min(origem.x, ponto.x),
      y: Math.min(origem.y, ponto.y),
      w: Math.max(w, 0.01),
      h: Math.max(h, 0.012),
    };
    const folha = folhaRef.current;
    if (evento.pointerType === "touch" && folha) {
      const alturaLinha = 26 / folha.getBoundingClientRect().height;
      if (rect.h < alturaLinha) {
        const centro = rect.y + rect.h / 2;
        rect.y = Math.max(0, Math.min(centro - alturaLinha / 2, 1 - alturaLinha));
        rect.h = Math.min(alturaLinha, 1 - rect.y);
      }
    }
    if (!corMarca) return;
    const extraido = folha ? textoSobRects(folha, [rect]).slice(0, 280) : "";
    const reserva = corMarca === IMPORTANTE.id ? `Figura · página ${paginaSegura}` : `Página ${paginaSegura}`;
    void gravarGrifo(corMarca, extraido || reserva, [rect]);
  }

  function marcarLacuna() {
    const campo = campoEnunciado.current;
    if (!campo) return;
    const de = campo.selectionStart;
    const ate = campo.selectionEnd;
    if (de === ate) {
      setErro("Selecione, no texto do card, a palavra que vira lacuna.");
      return;
    }
    setErro(null);
    setEnunciado(`${enunciado.slice(0, de)}{{${enunciado.slice(de, ate)}}}${enunciado.slice(ate)}`);
  }

  async function salvarCard(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardandoQuestao(true);
    setErro(null);
    setAviso(null);
    try {
      await repo.questoes.criar({
        materiaId,
        pdfId,
        pagina: paginaSegura,
        topicoId: topicoId || null,
        tipo: tipoCard,
        enunciado,
        resposta,
        imagem: imagemCard ?? undefined,
      });
      setEnunciado("");
      setResposta("");
      setImagemCard(null);
      setAviso(`Card salvo na página ${paginaSegura}. Ele entra na revisão de hoje.`);
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível salvar o card."));
    } finally {
      setGuardandoQuestao(false);
    }
  }

  async function fixarPostit(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    if (!postit.trim()) {
      setErro("Escreva o post-it antes de fixar.");
      return;
    }
    setCorMarca(null);
    setSublinhar(false);
    setMenuGrifo(false);
    setEscrevendoPostit(false);
    setColocandoPostit(true);
    setAviso("Clique no ponto da página. A bolinha fica nesse ponto.");
  }

  async function soltarPostit(evento: React.PointerEvent<HTMLDivElement>) {
    if (!colocandoPostit) return;
    const ponto = pontoNaFolha(evento);
    setColocandoPostit(false);
    if (!ponto) return;
    setErro(null);
    try {
      await repo.postits.criar({
        pdfId,
        pagina: paginaSegura,
        texto: postit,
        x: ponto.x,
        y: ponto.y,
      });
      setPostit("");
      setEscrevendoPostit(false);
      setAviso("Post-it marcado nesse ponto.");
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível fixar o post-it."));
    }
  }

  function iniciarArraste(evento: React.PointerEvent<HTMLButtonElement>, item: PostIt) {
    evento.preventDefault();
    evento.stopPropagation();
    const folha = folhaRef.current;
    if (!folha) return;
    const origemX = item.x;
    const origemY = item.y;
    const ponto = { x: evento.clientX, y: evento.clientY };
    let moveu = false;
    let quadro = 0;
    function mover(ev: PointerEvent) {
      if (Math.hypot(ev.clientX - ponto.x, ev.clientY - ponto.y) <= 4) return;
      moveu = true;
      const clienteX = ev.clientX;
      const clienteY = ev.clientY;
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => {
        const caixa = folha!.getBoundingClientRect();
        setRascunho({
          id: item.id,
          x: limitar(origemX + (clienteX - ponto.x) / caixa.width, 0.01, 0.98),
          y: limitar(origemY + (clienteY - ponto.y) / caixa.height, 0.01, 0.98),
        });
      });
    }
    function soltar(ev: PointerEvent) {
      cancelAnimationFrame(quadro);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      if (!moveu) {
        setRascunho(null);
        setPostitAberto((atual) => (atual === item.id ? null : item.id));
        return;
      }
      const caixa = folha!.getBoundingClientRect();
      const x = limitar(origemX + (ev.clientX - ponto.x) / caixa.width, 0.01, 0.98);
      const y = limitar(origemY + (ev.clientY - ponto.y) / caixa.height, 0.01, 0.98);
      setRascunho(null);
      void repo.postits.mover(item.id, x, y);
    }
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  }

  function aplicarZoom(texto: string) {
    const limpo = texto.replace("%", "").replace(",", ".").trim();
    setZoomRascunho(null);
    if (!limpo) return;
    const numero = Number(limpo);
    if (!Number.isFinite(numero)) return;
    ajusteManual.current = true;
    setEscala(Number(limitar(numero / 100, ZOOM_MIN, ZOOM_MAX).toFixed(2)));
  }

  function alterarLado(delta: number) {
    const maximo = Math.round(window.innerWidth * 0.75);
    const aplicar = (atual: number) => limitar(atual + delta, 300, maximo);
    if (painel === "caderno") setLarguraCaderno(aplicar);
    if (painel === "anotacoes" || painel === "busca") setLarguraPainel(aplicar);
  }

  function iniciarDivisao(evento: React.PointerEvent<HTMLButtonElement>) {
    if (painel === "oculto") return;
    evento.preventDefault();
    const inicioX = evento.clientX;
    const inicio = painel === "caderno" ? larguraCaderno : larguraPainel;
    const definir = painel === "caderno" ? setLarguraCaderno : setLarguraPainel;
    try {
      evento.currentTarget.setPointerCapture(evento.pointerId);
    } catch {
      /* o navegador recusa a captura fora de um ponteiro real */
    }
    function mover(ev: PointerEvent) {
      const maximo = Math.round(window.innerWidth * 0.75);
      definir(limitar(inicio + inicioX - ev.clientX, 300, maximo));
    }
    function soltar() {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
    }
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  }

  function irParaMarca(destino: FocoMarca) {
    setPagina(destino.pagina);
    setFoco(destino);
  }

  async function ajustar() {
    ajusteManual.current = false;
    const palco = palcoRef.current;
    if (!palco || !documento) return;
    const page = await documento.getPage(paginaSegura);
    const base = page.getViewport({ scale: escalaCss(1) });
    const largura = Math.max(280, palco.clientWidth - 32);
    setEscala(Number(limitar(largura / base.width, ZOOM_MIN, 1.8).toFixed(2)));
    page.cleanup();
  }

  return (
    <div className={`flex min-h-0 flex-col overflow-hidden bg-paper ${modoFoco ? "h-dvh pt-[env(safe-area-inset-top,0px)]" : "h-[calc(100dvh-var(--header-h))]"}`}>
      <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link href={caminhoMateria(materiaId)} className="selo selo-pine max-w-[42vw] shrink overflow-hidden rounded-full no-underline sm:max-w-52">
            <span className="min-w-0 truncate">{materia?.nome ?? "Matéria"}</span>
          </Link>
          <h1 className="min-w-0 truncate font-serif text-xl">{arquivo.nome}</h1>
          {painel === "caderno" ? <span className="selo hidden rounded-full sm:inline-flex">PDF interativo</span> : null}
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto" role="group" aria-label="O que fica ao lado do PDF">
          <button type="button" className="btn btn-seletor" aria-pressed={painel === "oculto" && !modoFoco} onClick={() => { sairFoco(); setPainel("oculto"); }}>
            Só o PDF
          </button>
          <button type="button" className="btn btn-seletor" aria-pressed={painel === "anotacoes"} onClick={() => { sairFoco(); setPainel("anotacoes"); }}>
            Painel
          </button>
          <button type="button" className="btn btn-seletor" aria-pressed={painel === "caderno"} onClick={() => { sairFoco(); setPainel("caderno"); }}>
            Cadernão
          </button>
          <button type="button" className="btn btn-seletor" aria-pressed={painel === "busca"} onClick={() => { sairFoco(); setPainel("busca"); }}>
            Buscar
          </button>
          <button type="button" className="btn btn-seletor" aria-pressed={modoFoco} onClick={() => (modoFoco ? sairFoco() : entrarFoco())}>
            Foco
          </button>
        </div>
      </div>
      <div
        className={`grid min-h-0 flex-1 ${
          painel === "oculto"
            ? "grid-cols-1"
            : "grid-cols-1 md:grid-cols-[minmax(0,1.15fr)_minmax(220px,0.85fr)] lg:grid-cols-[minmax(0,1fr)_minmax(280px,var(--lado))]"
        }`}
        style={{ "--lado": `${painel === "caderno" ? larguraCaderno : larguraPainel}px` } as React.CSSProperties}
      >
      <div className={`flex h-full min-h-0 min-w-0 flex-col ${painel !== "oculto" ? "max-md:hidden" : ""}`}>
        {estreita && !ferramentas && !modoFoco ? (
          <div className="mx-2 mb-2 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button type="button" className="btn" aria-label="Página anterior" onClick={() => setPagina((atual) => Math.max(1, atual - 1))}>
                ←
              </button>
              <span className="text-sm text-muted">
                {paginaSegura} / {total}
              </span>
              <button type="button" className="btn" aria-label="Próxima página" onClick={() => setPagina((atual) => Math.min(total, atual + 1))}>
                →
              </button>
              <button type="button" className="btn ml-auto" onClick={() => desfazerRef.current()}>
                Voltar
              </button>
              <button type="button" className="btn" onClick={() => setFerramentas(true)}>
                Ferramentas
              </button>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Marcar">
              {PRIORIDADES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="btn btn-cor"
                  aria-pressed={corMarca === item.id}
                  onClick={() => escolherCor(item.id)}
                >
                  <span className={`ponto ponto-${item.id}`} aria-hidden />
                  {item.nome}
                </button>
              ))}
              <button
                type="button"
                className="btn btn-cor"
                aria-pressed={corMarca === IMPORTANTE.id}
                onClick={() => escolherCor(IMPORTANTE.id)}
              >
                <span className="ponto ponto-importante" aria-hidden />
                {IMPORTANTE.nome}
              </button>
              <button
                type="button"
                className="btn btn-cor"
                aria-pressed={sublinhando}
                onClick={escolherRisco}
              >
                <span className="ponto ponto-esconder" aria-hidden />
                Esconder
              </button>
              <button
                type="button"
                className="btn btn-cor"
                disabled={!selecao}
                title="Cria um card a partir do trecho selecionado (tecla C)"
                onMouseDown={(evento) => evento.preventDefault()}
                onClick={criarCardDaSelecao}
              >
                <span className="ponto ponto-card" aria-hidden />
                Card
              </button>
            </div>
            {corMarca || sublinhando ? (
              <p className="text-sm text-muted">
                {sublinhando
                  ? "Toque na linha da resposta para esconder. Toque de novo para mostrar."
                  : "Arraste o dedo sobre o trecho. Toque de novo na cor para soltar."}
              </p>
            ) : null}
            {painel === "oculto" && (erro || aviso) ? (
              <div>
                {erro ? <Aviso texto={erro} /> : null}
                {aviso ? <p className="text-sm text-pine">{aviso}</p> : null}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className={`cartao mx-2 mb-2 px-2 py-2 sm:mx-5 sm:mb-3 sm:px-3 sm:py-3 ${estreita && !ferramentas ? "hidden" : ""} ${!estreita && !barra ? "hidden" : ""} ${modoFoco && ((estreita && !ferramentas) || (!estreita && !barra)) ? "hidden" : ""}`}>
          <div className="mb-2 flex justify-end">
            <button type="button" className="btn" onClick={() => (estreita ? setFerramentas(false) : setBarra(false))}>
              Ocultar
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="numero-pagina">
                Página
              </label>
              <button type="button" className="btn" aria-label="Página anterior" onClick={() => setPagina((atual) => Math.max(1, atual - 1))}>
                <span aria-hidden>←</span>
                <span className="hidden sm:inline">Anterior</span>
              </button>
              <input
                id="numero-pagina"
                className="campo campo-pagina"
                type="number"
                min={1}
                max={total}
                value={paginaSegura}
                onChange={(evento) => {
                  const valor = Number(evento.target.value);
                  if (Number.isInteger(valor)) setPagina(valor);
                }}
              />
              <span className="text-sm text-muted">/ {total}</span>
              <button type="button" className="btn" aria-label="Próxima página" onClick={() => setPagina((atual) => Math.min(total, atual + 1))}>
                <span className="hidden sm:inline">Próxima</span>
                <span aria-hidden>→</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  ajusteManual.current = true;
                  setEscala((atual) => Number(Math.max(ZOOM_MIN, atual - 0.15).toFixed(2)));
                }}
              >
                −
              </button>
              <label className="sr-only" htmlFor="zoom-pdf">
                Zoom
              </label>
              <input
                id="zoom-pdf"
                className="campo campo-zoom"
                inputMode="numeric"
                aria-describedby="zoom-unidade"
                value={zoomRascunho ?? porcentagemZoom(escala)}
                onFocus={(evento) => {
                  setZoomRascunho(porcentagemZoom(escala));
                  evento.target.select();
                }}
                onChange={(evento) => setZoomRascunho(evento.target.value)}
                onBlur={(evento) => {
                  if (evento.target instanceof HTMLInputElement) aplicarZoom(evento.target.value);
                }}
                onKeyDown={(evento) => {
                  if (evento.key !== "Enter") return;
                  evento.preventDefault();
                  aplicarZoom(evento.currentTarget.value);
                  evento.currentTarget.blur();
                }}
              />
              <span id="zoom-unidade" className="text-sm text-muted">
                %
              </span>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  ajusteManual.current = true;
                  setEscala((atual) => Number(Math.min(ZOOM_MAX, atual + 0.15).toFixed(2)));
                }}
              >
                +
              </button>
              <button type="button" className="btn" onClick={() => void ajustar()}>
                Ajustar
              </button>
              <button
                type="button"
                className="btn"
                aria-pressed={invertido}
                title="Inverte as cores da página para ler no escuro"
                onClick={() => definirInversao(invertido ? "nao" : "sim")}
              >
                Inverter
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className="text-xs tracking-wider text-muted" id="rotulo-marcar">
              MARCAR
            </span>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="rotulo-marcar">
              {PRIORIDADES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="btn btn-cor"
                  aria-pressed={corMarca === item.id}
                  onMouseDown={(evento) => evento.preventDefault()}
                  onClick={() => escolherCor(item.id)}
                >
                  <span className={`ponto ponto-${item.id}`} aria-hidden />
                  {item.nome}
                </button>
              ))}
              <button
                type="button"
                className="btn btn-cor"
                aria-pressed={corMarca === IMPORTANTE.id}
                onMouseDown={(evento) => evento.preventDefault()}
                onClick={() => escolherCor(IMPORTANTE.id)}
              >
                <span className="ponto ponto-importante" aria-hidden />
                {IMPORTANTE.nome}
              </button>
              <button
                type="button"
                className="btn btn-cor"
                aria-pressed={sublinhando}
                onMouseDown={(evento) => evento.preventDefault()}
                onClick={escolherRisco}
              >
                <span className="ponto ponto-esconder" aria-hidden />
                Esconder
              </button>
              <button
                type="button"
                className="btn btn-cor"
                disabled={!selecao}
                title="Cria um card a partir do trecho selecionado (tecla C)"
                onMouseDown={(evento) => evento.preventDefault()}
                onClick={criarCardDaSelecao}
              >
                <span className="ponto ponto-card" aria-hidden />
                Card
              </button>
            </div>
            {estreita ? (
              <button type="button" className="btn" onClick={() => desfazerRef.current()}>
                Voltar
              </button>
            ) : (
              <span className="atalho ml-auto hidden sm:inline">Ctrl+Z</span>
            )}
          </div>
          <p className="mt-2 text-sm text-muted sm:hidden">
            {sublinhando
              ? "Toque na linha da resposta para esconder. Toque de novo para mostrar."
              : corMarca === IMPORTANTE.id
              ? "Arraste o dedo em volta da figura. A área vai para o cadernão."
              : corMarca
                ? "Arraste o dedo sobre o trecho. Toque de novo na cor para soltar. Voltar desfaz."
                : "Escolha uma cor e arraste, ou toque em Esconder e depois na linha da resposta."}
          </p>
          <p className="mt-2 hidden text-sm text-muted sm:block">
              {sublinhando
                ? "Clique na linha da resposta para cobrir o texto. Clique de novo para mostrar. Some só nesta leitura."
                : corMarca === IMPORTANTE.id
                ? "Arraste um quadrado em volta do trecho ou da figura. A área vai como imagem para o cadernão. Clique de novo, ou Esc, para soltar."
                : corMarca
                  ? "Arraste na página para grifar uma área. Clique de novo na cor, ou Esc, para soltar. Ctrl+Z desfaz a última marcação."
                  : "Clique numa cor e arraste na página. Esconder cobre a linha clicada, para você responder sem ler. Ctrl+Z desfaz."}
          </p>
        </div>
        {erroLeitura ? <div className="px-4 pb-3"><Aviso texto={erroLeitura} /></div> : null}
        <div
          ref={palcoRef}
          className="flex min-h-0 flex-1 items-start justify-center overflow-auto px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5"
        >
          {(modoFoco ? (estreita ? !ferramentas : !barra) : !estreita && !barra) ? (
            <div ref={trilhoRef} className="sticky top-8 z-20 mr-3 flex w-[7.5rem] shrink-0 flex-col gap-2 self-start">
              <button
                type="button"
                className="btn w-full"
                aria-label="Página anterior"
                disabled={paginaSegura <= 1}
                onClick={() => setPagina((atual) => Math.max(1, atual - 1))}
              >
                ↑
              </button>
              <span className="text-center text-sm text-muted">
                {paginaSegura} / {total}
              </span>
              <button
                type="button"
                className="btn w-full"
                aria-label="Próxima página"
                disabled={paginaSegura >= total}
                onClick={() => setPagina((atual) => Math.min(total, atual + 1))}
              >
                ↓
              </button>
              <div className="zoom-trilho">
                <button
                  type="button"
                  className="btn"
                  aria-label="Diminuir zoom"
                  onClick={() => {
                    ajusteManual.current = true;
                    setEscala((atual) => Number(Math.max(ZOOM_MIN, atual - 0.15).toFixed(2)));
                  }}
                >
                  −
                </button>
                <label className="sr-only" htmlFor="zoom-trilho">
                  Zoom
                </label>
                <input
                  id="zoom-trilho"
                  className="campo campo-zoom"
                  inputMode="numeric"
                  aria-describedby="zoom-trilho-unidade"
                  value={zoomRascunho ?? porcentagemZoom(escala)}
                  onFocus={(evento) => {
                    setZoomRascunho(porcentagemZoom(escala));
                    evento.target.select();
                  }}
                  onChange={(evento) => setZoomRascunho(evento.target.value)}
                  onBlur={(evento) => {
                    if (evento.target instanceof HTMLInputElement) aplicarZoom(evento.target.value);
                  }}
                  onKeyDown={(evento) => {
                    if (evento.key !== "Enter") return;
                    evento.preventDefault();
                    aplicarZoom(evento.currentTarget.value);
                    evento.currentTarget.blur();
                  }}
                />
                <span id="zoom-trilho-unidade" className="text-sm text-muted">
                  %
                </span>
                <button
                  type="button"
                  className="btn"
                  aria-label="Aumentar zoom"
                  onClick={() => {
                    ajusteManual.current = true;
                    setEscala((atual) => Number(Math.min(ZOOM_MAX, atual + 0.15).toFixed(2)));
                  }}
                >
                  +
                </button>
              </div>
              <div className={`trilho-grifo${menuGrifo ? " aberto" : ""}`} data-barra-grifo>
                <button
                  type="button"
                  className="btn w-full"
                  aria-pressed={corMarca !== null || sublinhando}
                  aria-expanded={menuGrifo}
                  aria-haspopup="true"
                  onClick={() => {
                    setEscrevendoPostit(false);
                    setMenuGrifo((atual) => !atual);
                  }}
                >
                  {sublinhando ? <span className="ponto ponto-esconder" aria-hidden /> : corMarca ? <span className={`ponto ponto-${corMarca}`} aria-hidden /> : null}
                  Grifar
                </button>
                <div className="cores-flutuantes">
                  {PRIORIDADES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="btn btn-cor"
                      aria-pressed={corMarca === item.id}
                      onMouseDown={(evento) => evento.preventDefault()}
                      onClick={() => escolherCor(item.id)}
                    >
                      <span className={`ponto ponto-${item.id}`} aria-hidden />
                      {item.nome}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="btn btn-cor"
                    aria-pressed={corMarca === IMPORTANTE.id}
                    onMouseDown={(evento) => evento.preventDefault()}
                    onClick={() => escolherCor(IMPORTANTE.id)}
                  >
                    <span className="ponto ponto-importante" aria-hidden />
                    {IMPORTANTE.nome}
                  </button>
                  <button
                    type="button"
                    className="btn btn-cor"
                    aria-pressed={sublinhando}
                    onMouseDown={(evento) => evento.preventDefault()}
                    onClick={escolherRisco}
                  >
                    <span className="ponto ponto-esconder" aria-hidden />
                    Esconder
                  </button>
                </div>
              </div>
              <div className="trilho-postit">
                <button
                  type="button"
                  className="btn w-full"
                  aria-pressed={escrevendoPostit || colocandoPostit}
                  aria-expanded={escrevendoPostit}
                  onClick={() => {
                    if (escrevendoPostit || colocandoPostit) {
                      setEscrevendoPostit(false);
                      setColocandoPostit(false);
                      return;
                    }
                    setMenuGrifo(false);
                    setCorMarca(null);
                    setSublinhar(false);
                    setEscrevendoPostit(true);
                  }}
                >
                  Post-it
                </button>
                {escrevendoPostit ? (
                  <form className="postit-flutuante" onSubmit={fixarPostit}>
                    <label className="sr-only" htmlFor="postit-trilho">
                      Texto do post-it
                    </label>
                    <textarea
                      id="postit-trilho"
                      className="campo min-h-20"
                      placeholder="Nota neste ponto da página"
                      value={postit}
                      onChange={(evento) => setPostit(evento.target.value)}
                      autoComplete="off"
                    />
                    {erro ? <p className="text-sm text-alta">{erro}</p> : null}
                    <button className="btn w-full" type="submit">
                      {colocandoPostit ? "Toque na página…" : "Fixar na página"}
                    </button>
                    <button
                      type="button"
                      className="btn w-full"
                      onClick={() => {
                        setEscrevendoPostit(false);
                        setColocandoPostit(false);
                      }}
                    >
                      Cancelar
                    </button>
                  </form>
                ) : colocandoPostit ? (
                  <p className="text-center text-xs leading-tight text-muted">Toque na página</p>
                ) : null}
              </div>
              <button
                type="button"
                className="btn w-full"
                onClick={() => (estreita ? setFerramentas(true) : setBarra(true))}
              >
                Marcações
              </button>
            </div>
          ) : null}
          {documento ? (
            <div
              ref={folhaRef}
              className={invertido ? "folha folha-invertida" : "folha"}
              style={{
                width: medidaAtual?.w,
                height: medidaAtual?.h,
                flexShrink: 0,
                opacity: pronta && medidaAtual ? 1 : 0,
                ["--scale-factor" as string]: medidaAtual ? String(medidaAtual.escala) : "1",
                ["--scale-round-x" as string]: medidaAtual ? `${medidaAtual.roundX}px` : "1px",
                ["--scale-round-y" as string]: medidaAtual ? `${medidaAtual.roundY}px` : "1px",
              }}
            >
              <canvas ref={canvasRef} className="folha-canvas" role="presentation" />
              <div className="pointer-events-none absolute inset-0 z-[1]">
                {grifosDaPagina.flatMap((grifo) =>
                  grifo.rects.map((rect, indice) => (
                    <span
                      key={`${grifo.id}-${indice}`}
                      data-marca={grifo.id}
                      className={`grifo grifo-${grifo.cor}${foco?.id === grifo.id ? " marca-foco" : ""}`}
                      style={{
                        left: `${rect.x * 100}%`,
                        top: `${rect.y * 100}%`,
                        width: `${rect.w * 100}%`,
                        height: `${rect.h * 100}%`,
                      }}
                    />
                  )),
                )}
              </div>
              {selecao && !corMarca ? (
                <div className="pointer-events-none absolute inset-0 z-[4]">
                  {selecao.rects.map((rect, indice) => (
                    <span
                      key={`selecao-${indice}`}
                      className="grifo grifo-vivo"
                      style={{
                        left: `${rect.x * 100}%`,
                        top: `${rect.y * 100}%`,
                        width: `${rect.w * 100}%`,
                        height: `${rect.h * 100}%`,
                      }}
                    />
                  ))}
                </div>
              ) : null}
              <div
                ref={textoRef}
                className="textLayer"
                onMouseDown={(evento) => {
                  if (evento.button !== 0) return;
                  const camada = textoRef.current;
                  if (!camada) return;
                  const camadaEl = camada;
                  const inicioX = evento.clientX;
                  const inicioY = evento.clientY;
                  let arrastou = false;
                  function mover(ev: MouseEvent) {
                    if (Math.hypot(ev.clientX - inicioX, ev.clientY - inicioY) <= 4) return;
                    arrastou = true;
                    camadaEl.classList.add("selecting");
                  }
                  function soltar() {
                    window.removeEventListener("mousemove", mover);
                    window.removeEventListener("mouseup", soltar);
                    if (arrastou) return;
                    camadaEl.classList.remove("selecting");
                    window.getSelection()?.removeAllRanges();
                    setSelecao(null);
                  }
                  window.addEventListener("mousemove", mover);
                  window.addEventListener("mouseup", soltar);
                }}
              />
              <div className="pointer-events-none absolute inset-0 z-[5]">
                {riscos
                  .filter((risco) => risco.pagina === paginaSegura)
                  .flatMap((risco) =>
                    risco.rects.map((rect, indice) => (
                      <span
                        key={`${risco.id}-${indice}`}
                        className="tapa-linha"
                        style={{
                          left: `${rect.x * 100}%`,
                          top: `${rect.y * 100}%`,
                          width: `${rect.w * 100}%`,
                          height: `${rect.h * 100}%`,
                        }}
                      />
                    )),
                  )}
              </div>
              {colocandoPostit ? (
                <div
                  className="marca-camada"
                  role="group"
                  aria-label="Clique no ponto da página para fixar o post-it"
                  onPointerUp={soltarPostit}
                />
              ) : null}
              {corMarca || sublinhando ? (
                <div
                  className="marca-camada"
                  role="group"
                  aria-label={sublinhando ? "Toque na linha para esconder" : "Arraste para grifar nesta página"}
                  style={{ touchAction: "none" }}
                  onPointerDown={aoMarcarDown}
                  onPointerMove={aoMarcarMove}
                  onPointerUp={aoMarcarUp}
                >
                  {traco && traco.w > 0 && traco.h > 0 ? (
                    <span
                      className={sublinhando ? "tapa-linha tapa-linha-viva" : `grifo grifo-vivo grifo-${corMarca}`}
                      style={{
                        left: `${traco.x * 100}%`,
                        top: `${traco.y * 100}%`,
                        width: `${traco.w * 100}%`,
                        height: `${traco.h * 100}%`,
                      }}
                    />
                  ) : null}
                </div>
              ) : null}
              {postitsDaPagina.map((item) => {
                const x = rascunho?.id === item.id ? rascunho.x : item.x;
                const y = rascunho?.id === item.id ? rascunho.y : item.y;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`postit-marca${foco?.id === item.id ? " marca-foco" : ""}`}
                    style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
                    aria-pressed={postitAberto === item.id}
                    aria-controls={`postit-${item.id}`}
                    aria-label={`Post-it: ${item.texto}`}
                    title={item.texto}
                    onPointerDown={(evento) => iniciarArraste(evento, item)}
                  />
                );
              })}
            </div>
          ) : (
            <p className="text-muted">Montando o PDF…</p>
          )}
        </div>
      </div>

      {painel === "caderno" ? (
        <aside className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-3 md:pr-4" aria-label="Cadernão">
          <BarraLado
            nome="cadernão"
            aoAjustar={alterarLado}
            aoOcultar={() => setPainel("oculto")}
            aoDivisao={iniciarDivisao}
          />
          <div className="min-h-0 flex-1">
            <Caderno materiaId={materiaId} pdfId={pdfId} aoLado={irParaMarca} />
          </div>
        </aside>
      ) : null}
      {painel === "busca" ? (
        <aside className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-3 md:pr-4" aria-label="Busca e sumário">
          <BarraLado
            nome="busca"
            aoAjustar={alterarLado}
            aoOcultar={() => setPainel("oculto")}
            aoDivisao={iniciarDivisao}
          />
          {documento ? (
            <PainelBusca
              documento={documento}
              onIrParaPagina={(destino) => setPagina(Math.min(total, Math.max(1, destino)))}
              onTermo={setTermoBusca}
            />
          ) : (
            <p className="text-sm text-muted">O PDF ainda está abrindo…</p>
          )}
        </aside>
      ) : null}
      {painel === "anotacoes" ? (
      <aside className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-3 md:pr-4" aria-label="Anotações da página">
        <BarraLado
          nome="painel"
          aoAjustar={alterarLado}
          aoOcultar={() => setPainel("oculto")}
          aoDivisao={iniciarDivisao}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
        {erro || aviso ? (
          <div className="px-4 pt-4">
            {erro ? <Aviso texto={erro} /> : null}
            {aviso ? <p className="text-sm text-pine">{aviso}</p> : null}
          </div>
        ) : null}
        <section className="cartao shrink-0 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-2xl">Novo card</h2>
              <p className="mt-1 text-sm text-muted">
                Página {paginaSegura} · {questoes.length} {questoes.length === 1 ? "card" : "cards"} neste PDF
              </p>
            </div>
            <button
              type="button"
              className="btn shrink-0"
              onClick={() => {
                setEditandoQuestao(null);
                const dialogo = questoesDialogo.current;
                if (dialogo && !dialogo.open) dialogo.showModal();
              }}
            >
              Cards da página ({cardsDaPagina.length})
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Tipo de card">
            <button type="button" className="btn btn-seletor" aria-pressed={tipoCard === "lacuna"} onClick={() => setTipoCard("lacuna")}>
              Lacuna
            </button>
            <button type="button" className="btn btn-seletor" aria-pressed={tipoCard === "basico"} onClick={() => setTipoCard("basico")}>
              Pergunta e resposta
            </button>
          </div>
          <form onSubmit={salvarCard} className="mt-3 grid gap-2">
            <div>
              <label className="rotulo" htmlFor="enunciado-leitor">
                {tipoCard === "lacuna" ? "Texto (marque as lacunas com {{ }})" : "Frente"}
              </label>
              <textarea
                id="enunciado-leitor"
                ref={campoEnunciado}
                className="campo min-h-24"
                placeholder={
                  tipoCard === "lacuna"
                    ? "Selecione um trecho no PDF e aperte C. Ou cole aqui e use Marcar lacuna."
                    : "A pergunta que você quer saber responder de cabeça."
                }
                value={enunciado}
                onChange={(evento) => setEnunciado(evento.target.value)}
                onKeyDown={(evento) => {
                  if (evento.key === "Enter" && (evento.ctrlKey || evento.metaKey)) {
                    evento.preventDefault();
                    evento.currentTarget.form?.requestSubmit();
                  }
                }}
                autoComplete="off"
              />
              {tipoCard === "lacuna" ? (
                <button type="button" className="btn mt-2" onClick={marcarLacuna}>
                  Marcar lacuna na seleção
                </button>
              ) : null}
            </div>
            <div>
              <label className="rotulo" htmlFor="resposta-leitor">
                {tipoCard === "lacuna" ? "Comentário (opcional)" : "Verso"}
              </label>
              <textarea
                id="resposta-leitor"
                className="campo min-h-16"
                placeholder={
                  tipoCard === "lacuna" ? "Uma dica ou a fundamentação, se quiser." : "A resposta, do jeito que você quer lembrar."
                }
                value={resposta}
                onChange={(evento) => setResposta(evento.target.value)}
                onKeyDown={(evento) => {
                  if (evento.key === "Enter" && (evento.ctrlKey || evento.metaKey)) {
                    evento.preventDefault();
                    evento.currentTarget.form?.requestSubmit();
                  }
                }}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="rotulo" htmlFor="topico-leitor">
                Tópico do edital
              </label>
              <select id="topico-leitor" className="campo" value={topicoId} onChange={(evento) => setTopicoId(evento.target.value)}>
                <option value="">Sem tópico</option>
                {topicosDaMateria.map((topico) => (
                  <option key={topico.id} value={topico.id}>
                    {topico.nome}
                  </option>
                ))}
              </select>
              {topicosDaMateria.length === 0 ? (
                <p className="mt-1 text-xs text-muted">
                  Cadastre os tópicos em Editais para ver depois onde você mais erra.
                </p>
              ) : null}
            </div>
            {imagemCard ? (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--campo-bg)] px-3 py-2 text-sm">
                <span>Com a figura do trecho marcado</span>
                <button type="button" className="btn-perigo" onClick={() => setImagemCard(null)}>
                  Tirar
                </button>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button className="btn btn-primario" type="submit" disabled={guardandoQuestao}>
                {guardandoQuestao ? "Salvando…" : "Salvar card"}
              </button>
              <p className="text-sm text-muted">Ctrl+Enter salva. Fica ligado a esta página.</p>
            </div>
          </form>
        </section>
        <div className="cartao p-4">
        <section>
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-serif text-2xl">Esta página</h2>
          </div>
          {pronta && !temTexto ? (
            <p className="mt-3 text-sm text-muted">
              Esta página não tem texto selecionável. O post-it continua disponível.
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted">
              As cores ficam na barra de cima. Clique numa cor e arraste na página. Clique de novo na cor para soltar.
            </p>
          )}
        </section>

        <section className="mt-6">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-xs tracking-wider text-pine">Grifos da página</h2>
            <span className="text-xs text-muted">
              {grifosDaPagina.length} {grifosDaPagina.length === 1 ? "marcação ativa" : "marcações ativas"}
            </span>
          </div>
          {grifosDaPagina.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nenhum grifo nesta página.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {grifosDaPagina.map((grifo) => (
                <li key={grifo.id} className="mt-2 flex items-start justify-between gap-3 rounded-xl bg-[var(--campo-bg)] px-3 py-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left text-inherit"
                    title="Mostrar no PDF"
                    onClick={() =>
                      irParaMarca({
                        id: grifo.id,
                        pagina: grifo.pagina,
                        y: Math.min(...grifo.rects.map((rect) => rect.y)),
                      })
                    }
                  >
                    <span className={`marca marca-${grifo.cor}`}>
                      <span className={`quadrado quadrado-${grifo.cor}`} aria-hidden />
                      {nomeDaCor(grifo.cor)}
                    </span>
                    <span className="recorte mt-1 text-sm">{grifo.texto}</span>
                  </button>
                  <div className="mt-1 flex shrink-0 flex-col items-end gap-1">
                    <button
                      type="button"
                      className="btn"
                      title="Gera um card a partir deste grifo"
                      onClick={() => {
                        const soFigura = grifo.texto.startsWith("Figura ·");
                        if (grifo.imagem) preencherCard(soFigura ? "" : grifo.texto, "basico", grifo.imagem);
                        else preencherCard(grifo.texto, "lacuna");
                      }}
                    >
                      Virar card
                    </button>
                    <button
                      type="button"
                      className="btn-perigo"
                      onClick={() => {
                        marcasParaDesfazer.current = marcasParaDesfazer.current.filter((item) => item.id !== grifo.id);
                        void repo.grifos.remover(grifo.id);
                      }}
                    >
                      Apagar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6 border-t border-line pt-4">
          <h2 className="text-xs tracking-wider text-pine">Post-it</h2>
          <form onSubmit={fixarPostit} className="mt-2 grid gap-2">
            <label className="rotulo" htmlFor="novo-postit">
              Texto na página {paginaSegura}
            </label>
            <textarea
              id="novo-postit"
              className="campo min-h-20"
              placeholder="Adicione uma nota vinculada a uma coordenada da página..."
              value={postit}
              onChange={(evento) => setPostit(evento.target.value)}
              autoComplete="off"
            />
            <div className="flex flex-wrap gap-2">
              <button className="btn" type="submit">
                {colocandoPostit ? "Clique na página…" : "Fixar no ponto da página"}
              </button>
              {colocandoPostit ? (
                <button type="button" className="btn" onClick={() => setColocandoPostit(false)}>
                  Cancelar
                </button>
              ) : null}
            </div>
            <p className="text-sm text-muted">
              A bolinha marca o ponto na página e o texto abre aqui. No cadernão, a nota fica acima ou abaixo das marcações conforme essa altura. Arraste a bolinha para mudar o ponto.
            </p>
          </form>
          <ul className="mt-3 flex flex-col gap-2">
            {postitsDaPagina.length === 0 ? (
              <li className="text-sm text-muted">Nenhum post-it nesta página.</li>
            ) : (
              postitsDaPagina.map((item) => (
                <li
                  key={item.id}
                  id={`postit-${item.id}`}
                  className={postitAberto === item.id ? "postit-item postit-item-aberto" : "postit-item"}
                >
                  <button
                    type="button"
                    className={postitAberto === item.id ? "postit-item-texto" : "postit-item-texto recorte"}
                    aria-pressed={postitAberto === item.id}
                    onClick={() => {
                      setPostitAberto((atual) => (atual === item.id ? null : item.id));
                      irParaMarca({ id: item.id, pagina: item.pagina, y: item.y });
                    }}
                  >
                    {item.texto}
                  </button>
                  <Confirmar
                    className="btn-perigo mt-1"
                    rotulo="Tirar"
                    confirmar="Tirar"
                    onConfirmar={() => {
                      if (postitAberto === item.id) setPostitAberto(null);
                      return repo.postits.remover(item.id);
                    }}
                  />
                </li>
              ))
            )}
          </ul>
        </section>

        </div>
        </div>
      </aside>
      ) : null}

      <dialog
        ref={questoesDialogo}
        className="popup"
        aria-labelledby="titulo-popup-questoes"
        onClose={() => setEditandoQuestao(null)}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 id="titulo-popup-questoes" className="min-w-0 break-words font-serif text-xl sm:text-2xl">
            Cards da página {paginaSegura}
          </h2>
          <button type="button" className="btn shrink-0" onClick={() => questoesDialogo.current?.close()}>
            Fechar
          </button>
        </div>
        <div className="max-h-[70dvh] overflow-auto px-4 py-4">
          <p className="text-sm text-muted">
            {cardsDaPagina.length} {cardsDaPagina.length === 1 ? "card" : "cards"} nesta página, {questoes.length} no PDF todo,
            em {materia?.nome ?? "esta matéria"}.
          </p>
          {cardsDaPagina.length === 0 ? (
            <p className="mt-4 text-muted">Esta página ainda não tem cards.</p>
          ) : (
            <ol className="mt-4 flex flex-col gap-3">
              {cardsDaPagina.map((questao, indice) => (
                <li key={questao.id} className="border border-line p-3">
                  {editandoQuestao === questao.id ? (
                    <FormularioQuestao
                      questao={questao}
                      indice={indice + 1}
                      onSalvo={() => setEditandoQuestao(null)}
                      onCancelar={() => setEditandoQuestao(null)}
                    />
                  ) : (
                    <QuestaoConferencia
                      indice={indice + 1}
                      enunciado={resumoDoCard(questao.tipo, questao.enunciado, 400) || "(card só com imagem)"}
                      resposta={questao.resposta || "(sem comentário)"}
                      extra={
                        <button type="button" className="btn shrink-0" onClick={() => setEditandoQuestao(questao.id)}>
                          Editar
                        </button>
                      }
                    />
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </dialog>
      </div>
    </div>
  );
}

function FormularioQuestao({
  questao,
  indice,
  onSalvo,
  onCancelar,
}: {
  questao: Questao;
  indice: number;
  onSalvo: () => void;
  onCancelar: () => void;
}) {
  const [enunciado, setEnunciado] = useState(questao.enunciado);
  const [resposta, setResposta] = useState(questao.resposta);
  const [guardando, setGuardando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  return (
    <form
      className="grid gap-2"
      onSubmit={(evento) => {
        evento.preventDefault();
        setGuardando(true);
        setFalha(null);
        void repo.questoes
          .atualizar(questao.id, { enunciado, resposta })
          .then(() => onSalvo())
          .catch((falhaSalvar) => setFalha(mensagemErro(falhaSalvar, "Não foi possível salvar o card.")))
          .finally(() => setGuardando(false));
      }}
    >
      <h3 className="font-serif text-xl">Editar card {indice}</h3>
      <div>
        <label className="rotulo" htmlFor={`enunciado-${questao.id}`}>
          {questao.tipo === "lacuna" ? "Texto (use {{ }} nas lacunas)" : "Frente"}
        </label>
        <textarea
          id={`enunciado-${questao.id}`}
          className="campo min-h-20"
          value={enunciado}
          onChange={(evento) => setEnunciado(evento.target.value)}
        />
      </div>
      <div>
        <label className="rotulo" htmlFor={`resposta-${questao.id}`}>
          {questao.tipo === "lacuna" ? "Comentário (opcional)" : "Verso"}
        </label>
        <textarea
          id={`resposta-${questao.id}`}
          className="campo min-h-16"
          value={resposta}
          onChange={(evento) => setResposta(evento.target.value)}
        />
      </div>
      {falha ? <Aviso texto={falha} /> : null}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primario" type="submit" disabled={guardando}>
          {guardando ? "Salvando…" : "Salvar"}
        </button>
        <button className="btn" type="button" onClick={onCancelar}>
          Cancelar
        </button>
        <Confirmar
          rotulo="Excluir card"
          confirmar="Excluir"
          onConfirmar={async () => {
            try {
              await repo.questoes.remover(questao.id);
              onSalvo();
            } catch (falhaExcluir) {
              setFalha(mensagemErro(falhaExcluir, "Não foi possível excluir o card."));
            }
          }}
        />
      </div>
    </form>
  );
}
