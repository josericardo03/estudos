import { connection } from "next/server";

/**
 * O plano gratuito do Supabase pausa o projeto depois de cerca de uma semana sem nenhum acesso.
 * O Vercel chama esta rota todo dia (veja vercel.json) e ela faz uma leitura mínima no banco,
 * o que conta como atividade. A leitura volta vazia (as regras de acesso só liberam as suas
 * linhas quando você está logado), então a rota não expõe nada.
 */
export async function GET() {
  await connection();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave) return Response.json({ ok: false, motivo: "Supabase não configurado." });

  try {
    const resposta = await fetch(`${url}/rest/v1/materias?select=id&limit=1`, {
      headers: { apikey: chave, Authorization: `Bearer ${chave}` },
      cache: "no-store",
    });
    return Response.json({ ok: resposta.ok, status: resposta.status });
  } catch {
    return Response.json({ ok: false, motivo: "Sem resposta do Supabase." });
  }
}
