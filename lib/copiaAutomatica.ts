"use client";

import { chaveDia } from "./datas";
import { gravarBruto, lerBruto, useBruto } from "./preferencias";
import { supabase, supabaseConfigurado } from "./supabase";

/**
 * Cópia automática dos dados da nuvem, guardada neste aparelho.
 *
 * Protege contra o pior caso do plano gratuito do Supabase (que não faz backup): se algo
 * der errado lá, a última cópia ainda está aqui e se restaura em Dados. Fica no Cache
 * Storage, ao lado dos PDFs offline, com no máximo DUAS cópias. O arquivo para guardar
 * fora do aparelho continua sendo o de "Exportar dados da nuvem".
 */

const CACHE = "foco-copias-v1";
const CHAVE_ULTIMA = "foco.ultimaCopiaAuto";
export const DIAS_ENTRE_COPIAS = 7;
const COPIAS_GUARDADAS = 2;
const DIA = 86_400_000;

export type CopiaGuardada = { chave: string; dia: string; tamanho: number };

const temCache = () => typeof caches !== "undefined";
const requisicao = (dia: string) => new Request(`/copias-automaticas/${dia}.json`);

export async function listarCopiasAutomaticas(): Promise<CopiaGuardada[]> {
  if (!temCache()) return [];
  try {
    const cache = await caches.open(CACHE);
    const chaves = await cache.keys();
    const copias = await Promise.all(
      chaves.map(async (chave) => {
        const resposta = await cache.match(chave);
        const tamanho = Number(resposta?.headers.get("content-length") ?? 0);
        const dia = new URL(chave.url).pathname.replace("/copias-automaticas/", "").replace(".json", "");
        return { chave: chave.url, dia, tamanho };
      }),
    );
    return copias.sort((a, b) => b.dia.localeCompare(a.dia));
  } catch {
    return [];
  }
}

export async function lerCopiaAutomatica(dia: string): Promise<Blob | null> {
  if (!temCache()) return null;
  const resposta = await (await caches.open(CACHE)).match(requisicao(dia));
  return resposta ? resposta.blob() : null;
}

async function guardar(dia: string, blob: Blob) {
  const cache = await caches.open(CACHE);
  await cache.put(
    requisicao(dia),
    new Response(blob, { headers: { "content-type": "application/json", "content-length": String(blob.size) } }),
  );
  const todas = await listarCopiasAutomaticas();
  for (const antiga of todas.slice(COPIAS_GUARDADAS)) await cache.delete(new Request(antiga.chave));
}

/**
 * Faz a cópia se já passou uma semana da última. Só roda com a sessão aberta (sem login as
 * tabelas voltam vazias) e nunca troca uma cópia boa por uma vazia.
 */
export async function copiarSeNecessario(agora = Date.now()): Promise<boolean> {
  if (!supabaseConfigurado() || !temCache()) return false;
  const ultima = Number(lerBruto(CHAVE_ULTIMA) ?? 0);
  if (Number.isFinite(ultima) && agora - ultima < DIAS_ENTRE_COPIAS * DIA) return false;

  const { data } = await supabase().auth.getSession();
  if (!data.session) return false;

  const { gerarCopiaDaNuvem } = await import("./nuvem");
  const { blob, total } = await gerarCopiaDaNuvem();
  if (total === 0) return false;
  await guardar(chaveDia(agora), blob);
  gravarBruto(CHAVE_ULTIMA, String(agora));
  return true;
}

/** Quando foi a última cópia automática deste aparelho. */
export function useUltimaCopiaAutomatica() {
  const bruto = useBruto(CHAVE_ULTIMA);
  const valor = bruto ? Number(bruto) : NaN;
  return Number.isFinite(valor) ? valor : null;
}
