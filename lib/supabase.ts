import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export function chaveSupabase() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  );
}

export function supabaseConfigurado() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && chaveSupabase());
}

let cliente: SupabaseClient | null = null;

export function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = chaveSupabase();
  if (!url || !chave) {
    throw new Error("Supabase sem URL ou chave.");
  }
  if (!cliente) cliente = createBrowserClient(url, chave);
  return cliente;
}
