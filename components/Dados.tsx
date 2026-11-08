"use client";

import { useEffect, useState } from "react";
import { baixarBackup, pedirArmazenamentoPersistente, restaurarBackup, usoDoArmazenamento } from "@/lib/backup";
import { mensagemErro } from "@/lib/erros";
import { usePreferencia } from "@/lib/preferencias";
import { supabase, supabaseConfigurado } from "@/lib/supabase";
import { CHAVE_TEMA, TEMAS, type EscolhaDeTema } from "@/lib/tema";
import { Aviso } from "./ui";

function megabytes(bytes: number) {
  return `${(bytes / 1_048_576).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

export function Dados() {
  const remoto = supabaseConfigurado();
  const [tema, definirTema] = usePreferencia<EscolhaDeTema>(CHAVE_TEMA, "auto");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [uso, setUso] = useState<{ usado: number; cota: number } | null>(null);
  const [persistente, setPersistente] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    void usoDoArmazenamento().then((resultado) => {
      if (ativo) setUso(resultado);
    });
    if (remoto) {
      void supabase()
        .auth.getUser()
        .then(({ data }) => {
          if (ativo) setEmail(data.user?.email ?? null);
        });
    } else {
      void pedirArmazenamentoPersistente().then((resultado) => {
        if (ativo) setPersistente(resultado);
      });
    }
    return () => {
      ativo = false;
    };
  }, [remoto]);

  async function exportar() {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      const tamanho = await baixarBackup();
      setAviso(`Backup gerado (${megabytes(tamanho)}). Guarde o arquivo fora deste aparelho.`);
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível gerar o backup."));
    } finally {
      setOcupado(false);
    }
  }

  async function importar(arquivo: File) {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      const total = await restaurarBackup(arquivo);
      setAviso(`${total} itens restaurados. Os que já existiam foram sobrescritos pelo backup.`);
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível restaurar o backup."));
    } finally {
      setOcupado(false);
    }
  }

  async function limparCacheDePdfs() {
    setErro(null);
    setAviso(null);
    try {
      await caches.delete("foco-pdfs-v1");
      setUso(await usoDoArmazenamento());
      setAviso("PDFs guardados para uso offline foram removidos deste aparelho. Eles voltam a baixar quando você abrir.");
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível limpar o cache."));
    }
  }

  async function sair() {
    await supabase().auth.signOut();
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <p className="olho">Conta e aparelho</p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight">Dados</h1>
      {erro ? <div className="mt-4"><Aviso texto={erro} /></div> : null}
      {aviso ? <p className="mt-4 text-sm text-pine" role="status">{aviso}</p> : null}

      <section className="mt-8" aria-labelledby="titulo-aparencia">
        <h2 id="titulo-aparencia" className="font-serif text-3xl">
          Aparência
        </h2>
        <p className="mt-2 text-sm text-muted">
          O escuro também inverte as páginas do PDF no leitor (dá para desligar lá). O sépia esquenta as cores para a leitura longa.
        </p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Tema">
          {TEMAS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="btn btn-seletor"
              aria-pressed={tema === item.id}
              onClick={() => definirTema(item.id)}
            >
              {item.nome}
            </button>
          ))}
        </div>
      </section>

      {remoto ? (
        <section className="mt-10" aria-labelledby="titulo-conta">
          <h2 id="titulo-conta" className="font-serif text-3xl">
            Conta
          </h2>
          <p className="mt-2 text-muted">
            Seus dados ficam no Supabase{email ? `, na conta ${email}` : ""}. Eles acompanham você em qualquer aparelho em que entrar.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => void sair()}>
              Sair
            </button>
            <button type="button" className="btn" onClick={() => void limparCacheDePdfs()}>
              Limpar PDFs guardados offline
            </button>
          </div>
        </section>
      ) : (
        <section className="mt-10" aria-labelledby="titulo-backup">
          <h2 id="titulo-backup" className="font-serif text-3xl">
            Backup
          </h2>
          <p className="mt-2 text-muted">
            Sem Supabase, tudo fica só neste navegador. Limpar os dados do navegador, ou ficar semanas sem abrir o app no
            Safari, pode apagar o estudo. Exporte de vez em quando.
            {persistente === true
              ? " O navegador marcou estes dados como persistentes."
              : persistente === false
                ? " O navegador não confirmou o armazenamento persistente. O backup é ainda mais importante."
                : ""}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primario" disabled={ocupado} onClick={() => void exportar()}>
              {ocupado ? "Trabalhando…" : "Exportar backup"}
            </button>
            <label className={`btn ${ocupado ? "opacity-60" : ""}`}>
              Restaurar backup
              <input
                className="sr-only"
                type="file"
                accept="application/json,.json"
                disabled={ocupado}
                onChange={(evento) => {
                  const arquivo = evento.target.files?.[0];
                  evento.target.value = "";
                  if (arquivo) void importar(arquivo);
                }}
              />
            </label>
          </div>
        </section>
      )}

      {uso ? (
        <section className="mt-10" aria-labelledby="titulo-espaco">
          <h2 id="titulo-espaco" className="font-serif text-3xl">
            Espaço usado
          </h2>
          <p className="mt-2 text-muted">
            {megabytes(uso.usado)} de {megabytes(uso.cota)} disponíveis para este site neste aparelho.
          </p>
        </section>
      ) : null}

      <section className="mt-10" aria-labelledby="titulo-instalar">
        <h2 id="titulo-instalar" className="font-serif text-3xl">
          Instalar no celular
        </h2>
        <p className="mt-2 text-muted">
          No Chrome, abra o menu e escolha “Instalar app”. No iPhone, toque em Compartilhar e depois em “Adicionar à Tela de
          Início”. Instalado, o Foco abre em tela cheia e os arquivos do site ficam guardados para abrir mesmo sem rede.
        </p>
      </section>
    </main>
  );
}
