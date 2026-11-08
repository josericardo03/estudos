// Confere, sem login, se o banco real conhece as colunas que o app usa.
// Sem sessão as regras de acesso devolvem vazio (leitura) ou negam (escrita), mas uma coluna
// inexistente falha antes disso, com erro 400. Lê as chaves de .env.local e não as imprime.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((linha) => linha.includes("="))
    .map((linha) => [linha.slice(0, linha.indexOf("=")).trim(), linha.slice(linha.indexOf("=") + 1).trim()]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const chave = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const cabecalhos = { apikey: chave, Authorization: `Bearer ${chave}`, "Content-Type": "application/json" };

const COLUNAS_LEVES =
  "id, materia_id, pdf_id, pagina, topico_id, tipo, imagem_path, suspensa, julgada_em, erros_seguidos, erro_com_certeza, status_revisao, sequencia, facilidade, intervalo_dias, proxima_em, created_at";

async function pedir(descricao, caminho, opcoes = {}) {
  const resposta = await fetch(`${url}/rest/v1/${caminho}`, { headers: cabecalhos, ...opcoes });
  const corpo = await resposta.text();
  console.log(`${resposta.status} ${descricao}${resposta.ok ? "" : ` -> ${corpo.slice(0, 160)}`}`);
  return resposta.status;
}

await pedir("ler questoes (colunas leves)", `questoes?select=${encodeURIComponent(COLUNAS_LEVES)}&limit=1`);
await pedir("ler questoes (todas as colunas)", "questoes?select=*&limit=1");
await pedir("ler tentativas (nova etc.)", "tentativas?select=id,nova,confianca,motivo,em&limit=1");
await pedir("ler editais (data da prova)", "editais?select=*&limit=1");

const linhaCard = {
  id: crypto.randomUUID(),
  materia_id: crypto.randomUUID(),
  pdf_id: null,
  pagina: null,
  topico_id: null,
  tipo: "basico",
  enunciado: "x",
  resposta: "y",
  imagem_path: null,
  suspensa: false,
  julgada_em: null,
  erros_seguidos: 0,
  erro_com_certeza: false,
  status_revisao: "nova",
  sequencia: 0,
  facilidade: 2.5,
  intervalo_dias: 0,
  proxima_em: new Date().toISOString(),
  created_at: new Date().toISOString(),
};
// 401/403 = as colunas existem e a regra de acesso barrou (o esperado). 400 = coluna desconhecida.
await pedir("inserir card em lote (esperado: negado pela regra de acesso)", "questoes", {
  method: "POST",
  body: JSON.stringify([linhaCard]),
});
