"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { mensagemErro, mensagemPdf } from "@/lib/erros";
import { blocoDaPagina, descreverFaixa } from "@/lib/faixa";
import { abrirDocumento, carregarPdfjs, escalaCss, type DocumentoPdf } from "@/lib/pdf";
import { normalizarRects } from "@/lib/rects";
import { repo } from "@/lib/repo";
import { caminhoBloco, caminhoMateria } from "@/lib/rotas";
import { Caderno } from "../Caderno";
import type { Grifo, PostIt, Prioridade, Questao, Rect } from "@/lib/types";
import { MAX_QUESTOES, PRIORIDADES } from "@/lib/types";
import { useConsulta } from "@/lib/useConsulta";
import { Abrindo, Aviso, Confirmar, NaoEncontrado } from "../ui";

type Selecao = { texto: string; rects: Rect[]; x: number; y: number };
type Medida = { w: number; h: number; escala: number; pagina: number };
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

export function LeitorPdf({
  materiaId,
  pdfId,
  paginaInicial,
}: {
  materiaId: string;
  pdfId: string;
  paginaInicial: number;
}) {
  const palcoRef = useRef<HTMLDivElement>(null);
  const folhaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textoRef = useRef<HTMLDivElement>(null);
  const docIdRef = useRef<string | null>(null);
  const ajusteManual = useRef(false);
  const origemMarca = useRef<{ x: number; y: number } | null>(null);
  const questoesDialogo = useRef<HTMLDialogElement>(null);
  const marcasParaDesfazer = useRef<{ id: string; pagina: number }[]>([]);
  const grifosAtuais = useRef<Grifo[]>([]);

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
  const [titulo, setTitulo] = useState("");
  const [inicio, setInicio] = useState(String(Math.max(1, paginaInicial || 1)));
  const [fim, setFim] = useState(String(Math.max(1, paginaInicial || 1)));
  const [corMarca, setCorMarca] = useState<Prioridade | null>(null);
  const [traco, setTraco] = useState<Rect | null>(null);
  const [postit, setPostit] = useState("");
  const [colocandoPostit, setColocandoPostit] = useState(false);
  const [postitAberto, setPostitAberto] = useState<string | null>(null);
  const [painel, setPainel] = useState<"anotacoes" | "caderno" | "oculto">("anotacoes");
  const [enunciado, setEnunciado] = useState("");
  const [resposta, setResposta] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [guardandoQuestao, setGuardandoQuestao] = useState(false);
  const [editandoQuestao, setEditandoQuestao] = useState<string | null>(null);

  if (paginaInicial !== origem) {
    setOrigem(paginaInicial);
    const proxima = Math.max(1, paginaInicial || 1);
    setPagina(proxima);
    setInicio(String(proxima));
    setFim(String(proxima));
  }

  const { dados: arquivo, pronto: arquivoPronto, erro: erroArquivo } = useConsulta(
    () => repo.pdfs.obter(pdfId),
    [pdfId],
    null,
  );
  const { dados: materia } = useConsulta(
    () => (arquivo ? repo.materias.obter(arquivo.materiaId) : Promise.resolve(null)),
    [arquivo?.materiaId],
    null,
  );
  const { dados: blocos } = useConsulta(() => repo.blocos.listarPorPdf(pdfId), [pdfId], []);
  const { dados: grifos } = useConsulta(() => repo.grifos.listarPorPdf(pdfId), [pdfId], []);
  const { dados: postits } = useConsulta(() => repo.postits.listarPorPdf(pdfId), [pdfId], []);
  const { dados: questoes } = useConsulta(() => repo.questoes.listarPorPdf(pdfId), [pdfId], []);

  useEffect(() => {
    grifosAtuais.current = grifos;
  }, [grifos]);

  const total = documento?.numPages ?? arquivo?.numPages ?? 1;
  const paginaNumero = Number.isFinite(pagina) ? pagina : 1;
  const paginaSegura = Math.min(total, Math.max(1, paginaNumero));
  const blocoIdAtual = blocoDaPagina(blocos, paginaSegura)?.id ?? null;

  useEffect(() => {
    questoesDialogo.current?.close();
    setEditandoQuestao(null);
  }, [blocoIdAtual]);

  useEffect(() => {
    setColocandoPostit(false);
    setPostitAberto(null);
  }, [paginaSegura]);

  useEffect(() => {
    if (!postitAberto) return;
    document.getElementById(`postit-${postitAberto}`)?.scrollIntoView({ block: "nearest" });
  }, [postitAberto]);

  useEffect(() => {
    const arquivoId = arquivo?.id;
    const blob = arquivo?.blob;
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
  }, [arquivo]);

  useEffect(() => {
    const palco = palcoRef.current;
    if (!palco || !documento) return;
    let quadro = 0;
    let ativo = true;
    const medir = () => {
      if (!ativo || ajusteManual.current) return;
      const largura = Math.max(280, palco.clientWidth - 32);
      void documento.getPage(paginaSegura).then((page) => {
        if (!ativo || ajusteManual.current) {
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
  }, [documento, paginaSegura]);

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
        folha.style.width = `${viewport.width}px`;
        folha.style.height = `${viewport.height}px`;
        folha.style.setProperty("--scale-factor", String(viewport.scale));
        setMedida({
          w: viewport.width,
          h: viewport.height,
          escala: viewport.scale,
          pagina: paginaSegura,
        });

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        const renderizacao = page.render({
          canvas,
          viewport,
          transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
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
      const alvo = evento.target;
      if (
        alvo instanceof HTMLElement &&
        (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable)
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
      if (evento.key === "Escape") {
        setCorMarca(null);
        setColocandoPostit(false);
        setPostitAberto(null);
      }
      if ((evento.ctrlKey || evento.metaKey) && !evento.shiftKey && evento.key.toLowerCase() === "z") {
        evento.preventDefault();
        let alvo: { id: string; pagina: number } | undefined;
        while (marcasParaDesfazer.current.length) {
          const item = marcasParaDesfazer.current.pop();
          if (item && grifosAtuais.current.some((grifo) => grifo.id === item.id)) {
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
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [total]);

  if (!arquivoPronto) return <Abrindo texto="Abrindo o PDF…" />;
  if (erroArquivo) return <div className="px-5 py-10"><Aviso texto={erroArquivo} /></div>;
  if (!arquivo || arquivo.materiaId !== materiaId) {
    return <NaoEncontrado titulo="PDF não encontrado" detalhe="Esse arquivo não está nesta matéria." />;
  }

  const blocoAtual = blocoDaPagina(blocos, paginaSegura);
  const grifosDaPagina = grifos.filter((grifo) => grifo.pagina === paginaSegura);
  const postitsDaPagina = postits
    .filter((item) => item.pagina === paginaSegura)
    .sort((a, b) => a.y - b.y || a.createdAt - b.createdAt);
  const questoesDoBloco = blocoAtual
    ? questoes.filter((questao) => questao.blocoId === blocoAtual.id)
    : [];
  const medidaAtual = medida?.pagina === paginaSegura ? medida : null;

  async function gravarGrifo(cor: Prioridade, texto: string, rects: Rect[]) {
    setErro(null);
    setAviso(null);
    try {
      const criado = await repo.grifos.criar({ pdfId, pagina: paginaSegura, texto, cor, rects });
      marcasParaDesfazer.current.push({ id: criado.id, pagina: criado.pagina });
      grifosAtuais.current = [...grifosAtuais.current.filter((item) => item.id !== criado.id), criado];
      const nome = PRIORIDADES.find((item) => item.id === cor)?.nome ?? "cor";
      setAviso(`Marcado em ${nome.toLowerCase()}.`);
      setCorMarca(cor);
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível marcar."));
    }
  }

  async function grifar(cor: Prioridade) {
    if (!selecao) return;
    await gravarGrifo(cor, selecao.texto, selecao.rects);
    window.getSelection()?.removeAllRanges();
    setSelecao(null);
  }

  function escolherCor(cor: Prioridade) {
    setColocandoPostit(false);
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
  }

  function pontoNaFolha(evento: React.PointerEvent<HTMLDivElement>) {
    const folha = folhaRef.current;
    if (!folha) return null;
    const caixa = folha.getBoundingClientRect();
    if (caixa.width <= 0 || caixa.height <= 0) return null;
    return {
      x: limitar((evento.clientX - caixa.left) / caixa.width, 0, 1),
      y: limitar((evento.clientY - caixa.top) / caixa.height, 0, 1),
    };
  }

  function aoMarcarDown(evento: React.PointerEvent<HTMLDivElement>) {
    if (!corMarca) return;
    const ponto = pontoNaFolha(evento);
    if (!ponto) return;
    origemMarca.current = ponto;
    try {
      evento.currentTarget.setPointerCapture(evento.pointerId);
    } catch {
      /* o navegador recusa a captura fora de um ponteiro real */
    }
    setTraco({ x: ponto.x, y: ponto.y, w: 0, h: 0 });
  }

  function aoMarcarMove(evento: React.PointerEvent<HTMLDivElement>) {
    const origem = origemMarca.current;
    const ponto = pontoNaFolha(evento);
    if (!origem || !ponto) return;
    setTraco({
      x: Math.min(origem.x, ponto.x),
      y: Math.min(origem.y, ponto.y),
      w: Math.abs(ponto.x - origem.x),
      h: Math.abs(ponto.y - origem.y),
    });
  }

  function aoMarcarUp(evento: React.PointerEvent<HTMLDivElement>) {
    const origem = origemMarca.current;
    origemMarca.current = null;
    const ponto = pontoNaFolha(evento);
    setTraco(null);
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
    const extraido = folha ? textoSobRects(folha, [rect]).slice(0, 280) : "";
    void gravarGrifo(corMarca, extraido || `Página ${paginaSegura}`, [rect]);
  }

  async function criarBloco(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setErro(null);
    setAviso(null);
    try {
      await repo.blocos.criar({
        pdfId,
        titulo,
        paginaInicio: Number(inicio),
        paginaFim: Number(fim),
      });
      setTitulo("");
      setAviso("Bloco criado. Os grifos e post-its dessa faixa já entram nele.");
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível criar o bloco."));
    } finally {
      setGuardando(false);
    }
  }

  async function salvarQuestao(evento: React.FormEvent) {
    evento.preventDefault();
    if (!blocoAtual) return;
    setGuardandoQuestao(true);
    setErro(null);
    setAviso(null);
    try {
      await repo.questoes.criar({
        blocoId: blocoAtual.id,
        materiaId,
        enunciado,
        resposta,
      });
      setEnunciado("");
      setResposta("");
      setAviso(`Questão salva no banco, no bloco ${blocoAtual.titulo}.`);
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível salvar a questão."));
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
    function mover(ev: PointerEvent) {
      if (Math.hypot(ev.clientX - ponto.x, ev.clientY - ponto.y) <= 4) return;
      moveu = true;
      const caixa = folha!.getBoundingClientRect();
      setRascunho({
        id: item.id,
        x: limitar(origemX + (ev.clientX - ponto.x) / caixa.width, 0.01, 0.98),
        y: limitar(origemY + (ev.clientY - ponto.y) / caixa.height, 0.01, 0.98),
      });
    }
    function soltar(ev: PointerEvent) {
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
    <div className="flex h-[calc(100dvh-4rem)] flex-col bg-paper">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={caminhoMateria(materiaId)} className="selo selo-pine shrink-0 rounded-full no-underline">
            {materia?.nome ?? "Matéria"}
          </Link>
          <h1 className="min-w-0 truncate font-serif text-xl">{arquivo.nome}</h1>
          {painel === "caderno" ? <span className="selo hidden rounded-full sm:inline-flex">PDF interativo</span> : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2" role="group" aria-label="O que fica ao lado do PDF">
          <button type="button" className="btn btn-seletor" aria-pressed={painel === "oculto"} onClick={() => setPainel("oculto")}>
            Só o PDF
          </button>
          <button type="button" className="btn btn-seletor" aria-pressed={painel === "anotacoes"} onClick={() => setPainel("anotacoes")}>
            Painel
          </button>
          <button type="button" className="btn btn-seletor" aria-pressed={painel === "caderno"} onClick={() => setPainel("caderno")}>
            Cadernão
          </button>
        </div>
      </div>
      <div
        className={`grid min-h-0 flex-1 ${
          painel === "oculto"
            ? "grid-cols-1"
            : painel === "caderno"
              ? "lg:grid-cols-[minmax(0,1fr)_minmax(18rem,32rem)]"
              : "lg:grid-cols-[minmax(0,1fr)_24rem]"
        }`}
      >
      <div className="flex min-w-0 flex-col lg:min-h-0">
        <div className="cartao mx-4 mb-3 px-3 py-3 sm:mx-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="numero-pagina">
                Página
              </label>
              <button type="button" className="btn" onClick={() => setPagina((atual) => Math.max(1, atual - 1))}>
                ← Anterior
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
              <button type="button" className="btn" onClick={() => setPagina((atual) => Math.min(total, atual + 1))}>
                Próxima →
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
            </div>
            <span className="atalho ml-auto">Ctrl+Z</span>
          </div>
          <p className="mt-2 text-sm text-muted">
              {corMarca
                ? "Arraste na página para grifar uma área. Clique de novo na cor, ou Esc, para soltar. Ctrl+Z desfaz a última marcação."
                : "Clique numa cor e arraste na página. Se houver trecho selecionado, a cor grifa o trecho. Ctrl+Z desfaz a última marcação."}
          </p>
        </div>
        {erroLeitura ? <div className="px-4 pb-3"><Aviso texto={erroLeitura} /></div> : null}
        <div
          ref={palcoRef}
          className="flex min-h-[70vh] flex-1 justify-center overflow-auto px-4 pb-4 sm:px-5"
        >
          {documento ? (
            <div
              ref={folhaRef}
              className="folha"
              style={{
                width: medidaAtual?.w,
                height: medidaAtual?.h,
                opacity: pronta && medidaAtual ? 1 : 0,
                ["--scale-factor" as string]: medidaAtual ? String(medidaAtual.escala) : "1",
              }}
            >
              <canvas ref={canvasRef} className="folha-canvas" role="presentation" />
              <div className="pointer-events-none absolute inset-0 z-[1]">
                {grifosDaPagina.flatMap((grifo) =>
                  grifo.rects.map((rect, indice) => (
                    <span
                      key={`${grifo.id}-${indice}`}
                      className={`grifo grifo-${grifo.cor}`}
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
              <div
                ref={textoRef}
                className="textLayer"
                onMouseDown={(evento) => {
                  if (evento.button !== 0) return;
                  const camada = textoRef.current;
                  if (!camada) return;
                  const inicioX = evento.clientX;
                  const inicioY = evento.clientY;
                  let arrastou = false;
                  function mover(ev: MouseEvent) {
                    if (Math.hypot(ev.clientX - inicioX, ev.clientY - inicioY) <= 4) return;
                    arrastou = true;
                    camada.classList.add("selecting");
                  }
                  function soltar() {
                    window.removeEventListener("mousemove", mover);
                    window.removeEventListener("mouseup", soltar);
                    if (arrastou) return;
                    camada.classList.remove("selecting");
                    window.getSelection()?.removeAllRanges();
                    setSelecao(null);
                  }
                  window.addEventListener("mousemove", mover);
                  window.addEventListener("mouseup", soltar);
                }}
              />
              {colocandoPostit ? (
                <div
                  className="marca-camada"
                  role="group"
                  aria-label="Clique no ponto da página para fixar o post-it"
                  onPointerUp={soltarPostit}
                />
              ) : null}
              {corMarca ? (
                <div
                  className="marca-camada"
                  role="group"
                  aria-label="Arraste para grifar nesta página"
                  onPointerDown={aoMarcarDown}
                  onPointerMove={aoMarcarMove}
                  onPointerUp={aoMarcarUp}
                >
                  {traco && traco.w > 0 && traco.h > 0 ? (
                    <span
                      className={`grifo grifo-${corMarca}`}
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
                    className="postit-marca"
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
        <aside className="flex min-h-[70vh] flex-col px-3 pb-4 lg:min-h-0 lg:overflow-hidden lg:pr-4" aria-label="Cadernão">
          <Caderno materiaId={materiaId} pdfId={pdfId} aoLado={setPagina} />
        </aside>
      ) : null}
      {painel === "anotacoes" ? (
      <aside className="flex flex-col gap-3 overflow-auto px-3 pb-4 lg:min-h-0 lg:pr-4" aria-label="Anotações da página">
        {erro || aviso ? (
          <div className="px-4 pt-4">
            {erro ? <Aviso texto={erro} /> : null}
            {aviso ? <p className="text-sm text-pine">{aviso}</p> : null}
          </div>
        ) : null}
        <section className="cartao shrink-0 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-2xl">Questões do bloco</h2>
              {blocoAtual ? (
                <p className="mt-1 text-sm text-muted">
                  {descreverFaixa(blocoAtual.paginaInicio, blocoAtual.paginaFim)} · {questoesDoBloco.length}/{MAX_QUESTOES}
                </p>
              ) : null}
            </div>
            {blocoAtual ? (
              <button
                type="button"
                className="btn shrink-0"
                onClick={() => {
                  setEditandoQuestao(null);
                  const dialogo = questoesDialogo.current;
                  if (dialogo && !dialogo.open) dialogo.showModal();
                }}
              >
                Ver questões ({questoesDoBloco.length})
              </button>
            ) : null}
          </div>
          {blocoAtual ? (
            <>
              {questoesDoBloco.length >= MAX_QUESTOES ? (
                <p className="mt-3 text-sm">Este bloco já tem 15 questões.</p>
              ) : (
                <form onSubmit={salvarQuestao} className="mt-3 grid gap-2">
                  <div>
                    <label className="rotulo" htmlFor="enunciado-leitor">
                      Enunciado
                    </label>
                    <textarea
                      id="enunciado-leitor"
                      className="campo min-h-20"
                      placeholder="Digite ou cole aqui a questão para fixação mnêmica..."
                      value={enunciado}
                      onChange={(evento) => setEnunciado(evento.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="rotulo" htmlFor="resposta-leitor">
                      Resposta
                    </label>
                    <textarea
                      id="resposta-leitor"
                      className="campo min-h-16"
                      placeholder="Gabarito comentado ou síntese da fundamentação legal..."
                      value={resposta}
                      onChange={(evento) => setResposta(evento.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button className="btn btn-primario" type="submit" disabled={guardandoQuestao}>
                      {guardandoQuestao ? "Salvando…" : "Salvar questão"}
                    </button>
                    <p className="text-sm text-muted">Ao salvar, a questão entra no banco.</p>
                  </div>
                </form>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Crie o bloco desta página para escrever as questões da faixa.
            </p>
          )}
        </section>
        <div className="cartao p-4">
        <section>
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-serif text-2xl">Esta página</h2>
            {blocoAtual ? (
              <Link className="shrink-0 text-sm text-pine no-underline hover:underline" href={caminhoBloco(materiaId, pdfId, blocoAtual.id)}>
                Abrir pacote do bloco
              </Link>
            ) : null}
          </div>
          {blocoAtual ? (
            <p className="mt-2 text-sm text-muted">
              {blocoAtual.titulo} · {descreverFaixa(blocoAtual.paginaInicio, blocoAtual.paginaFim)}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted">Esta página ainda não está num bloco.</p>
          )}
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
                <li key={grifo.id} className="mt-2 flex items-start justify-between gap-3 rounded-xl bg-[#fbf8f4] px-3 py-2">
                  <span className={`marca marca-${grifo.cor}`}>
                    <span className={`quadrado quadrado-${grifo.cor}`} aria-hidden />
                    {PRIORIDADES.find((item) => item.id === grifo.cor)?.nome}
                  </span>
                  <p className="recorte mt-1 text-sm">{grifo.texto}</p>
                  <button
                    type="button"
                    className="btn-perigo mt-1"
                    onClick={() => {
                      marcasParaDesfazer.current = marcasParaDesfazer.current.filter((item) => item.id !== grifo.id);
                      void repo.grifos.remover(grifo.id);
                    }}
                  >
                    Apagar
                  </button>
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
                    onClick={() => setPostitAberto((atual) => (atual === item.id ? null : item.id))}
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
        <section className="cartao p-4">
          <h2 className="font-serif text-xl">Novo bloco</h2>
          <form onSubmit={criarBloco} className="mt-2 grid gap-2">
            <div>
              <label className="rotulo" htmlFor="titulo-novo-bloco">
                Título
              </label>
              <input
                id="titulo-novo-bloco"
                className="campo"
                value={titulo}
                onChange={(evento) => setTitulo(evento.target.value)}
                placeholder="Opcional"
                autoComplete="off"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="rotulo" htmlFor="inicio-novo">
                  De
                </label>
                <input
                  id="inicio-novo"
                  className="campo"
                  type="number"
                  min={1}
                  max={total}
                  value={inicio}
                  onChange={(evento) => setInicio(evento.target.value)}
                />
              </div>
              <div>
                <label className="rotulo" htmlFor="fim-novo">
                  Até
                </label>
                <input
                  id="fim-novo"
                  className="campo"
                  type="number"
                  min={1}
                  max={total}
                  value={fim}
                  onChange={(evento) => setFim(evento.target.value)}
                />
              </div>
            </div>
            <button className="btn btn-primario justify-self-start" type="submit" disabled={guardando}>
              {guardando ? "Criando…" : "Criar bloco"}
            </button>
          </form>
        </section>

        <section className="cartao p-4">
          <h2 className="font-serif text-xl">Blocos deste PDF</h2>
          {blocos.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nenhuma faixa ainda.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {blocos.map((bloco) => (
                <li key={bloco.id} className="flex items-start justify-between gap-2 rounded-xl bg-[#fbf8f4] px-3 py-2">
                  <button type="button" className="text-left" onClick={() => setPagina(bloco.paginaInicio)}>
                    <span className="block font-medium">{bloco.titulo}</span>
                    <span className="text-sm text-muted">{descreverFaixa(bloco.paginaInicio, bloco.paginaFim)}</span>
                  </button>
                  <Link className="text-sm text-pine no-underline hover:underline" href={caminhoBloco(materiaId, pdfId, bloco.id)}>
                    Pacote
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
      ) : null}

      {blocoAtual ? (
        <dialog
          ref={questoesDialogo}
          className="popup"
          aria-labelledby="titulo-popup-questoes"
          onClose={() => setEditandoQuestao(null)}
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 id="titulo-popup-questoes" className="font-serif text-2xl">
              {blocoAtual.titulo}
            </h2>
            <button type="button" className="btn" onClick={() => questoesDialogo.current?.close()}>
              Fechar
            </button>
          </div>
          <div className="max-h-[70dvh] overflow-auto px-4 py-4">
            <p className="text-sm text-muted">
              {questoesDoBloco.length}/{MAX_QUESTOES} no banco de {materia?.nome ?? "esta matéria"}.
            </p>
            {questoesDoBloco.length === 0 ? (
              <p className="mt-4 text-muted">Este bloco ainda não tem questões.</p>
            ) : (
              <ol className="mt-4 flex flex-col gap-3">
                {questoesDoBloco.map((questao, indice) => (
                  <li key={questao.id} className="border border-line p-3">
                    {editandoQuestao === questao.id ? (
                      <FormularioQuestao
                        questao={questao}
                        indice={indice + 1}
                        onSalvo={() => setEditandoQuestao(null)}
                        onCancelar={() => setEditandoQuestao(null)}
                      />
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-serif text-xl">Questão {indice + 1}</h3>
                          <button type="button" className="btn" onClick={() => setEditandoQuestao(questao.id)}>
                            Editar
                          </button>
                        </div>
                        <p className="mt-2">{questao.enunciado}</p>
                        <p className="mt-2 text-sm text-muted">{questao.resposta}</p>
                      </>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </dialog>
      ) : null}
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
          .catch((falhaSalvar) => setFalha(mensagemErro(falhaSalvar, "Não foi possível salvar a questão.")))
          .finally(() => setGuardando(false));
      }}
    >
      <h3 className="font-serif text-xl">Editar questão {indice}</h3>
      <div>
        <label className="rotulo" htmlFor={`enunciado-${questao.id}`}>
          Enunciado
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
          Resposta
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
          rotulo="Excluir questão"
          confirmar="Excluir"
          onConfirmar={async () => {
            try {
              await repo.questoes.remover(questao.id);
              onSalvo();
            } catch (falhaExcluir) {
              setFalha(mensagemErro(falhaExcluir, "Não foi possível excluir a questão."));
            }
          }}
        />
      </div>
    </form>
  );
}
