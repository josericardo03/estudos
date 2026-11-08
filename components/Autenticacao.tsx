"use client";

import { useEffect, useState } from "react";
import { supabase, supabaseConfigurado } from "@/lib/supabase";
import { Abrindo, Aviso } from "./ui";

type Estado = "carregando" | "fora" | "dentro";

/**
 * Com Supabase configurado, o app só abre para quem entrou com o e-mail.
 * Sem Supabase (modo local), não pede nada.
 */
export function Autenticacao({ children }: { children: React.ReactNode }) {
  const configurado = supabaseConfigurado();
  const [estado, setEstado] = useState<Estado>(configurado ? "carregando" : "dentro");

  useEffect(() => {
    if (!configurado) return;
    const cliente = supabase();
    let ativo = true;
    void cliente.auth.getSession().then(({ data }) => {
      if (ativo) setEstado(data.session ? "dentro" : "fora");
    });
    const { data } = cliente.auth.onAuthStateChange((_evento, sessao) => {
      if (ativo) setEstado(sessao ? "dentro" : "fora");
    });
    return () => {
      ativo = false;
      data.subscription.unsubscribe();
    };
  }, [configurado]);

  if (estado === "dentro") return <>{children}</>;
  if (estado === "carregando") return <Abrindo texto="Abrindo…" />;
  return <Entrar />;
}

function Entrar() {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const limpo = email.trim();
    if (!limpo) {
      setErro("Digite o seu e-mail.");
      return;
    }
    setEnviando(true);
    setErro(null);
    const { error } = await supabase().auth.signInWithOtp({
      email: limpo,
      options: { emailRedirectTo: window.location.origin },
    });
    setEnviando(false);
    if (error) {
      setErro(
        /signups? (not allowed|are disabled)/i.test(error.message)
          ? "Este e-mail não está cadastrado."
          : "Não foi possível enviar o link. Tente de novo em instantes.",
      );
      return;
    }
    setEnviado(true);
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 py-16">
      <p className="olho">Foco</p>
      <h1 className="mt-2 font-serif text-4xl tracking-tight">Entrar</h1>
      <p className="mt-3 text-muted">
        Os seus PDFs e questões ficam guardados na sua conta. Digite o e-mail e abra o link que chegar. Não há senha.
      </p>
      {enviado ? (
        <p className="mt-8 rounded-xl bg-pine-soft px-4 py-3 text-pine" role="status">
          Enviamos um link para {email.trim()}. Abra-o neste aparelho. Pode fechar esta aba depois.
        </p>
      ) : (
        <form onSubmit={enviar} className="mt-8 grid gap-3">
          <div>
            <label className="rotulo" htmlFor="email-entrar">
              E-mail
            </label>
            <input
              id="email-entrar"
              className="campo"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              placeholder="voce@exemplo.com"
            />
          </div>
          {erro ? <Aviso texto={erro} /> : null}
          <button className="btn btn-primario justify-self-start" type="submit" disabled={enviando}>
            {enviando ? "Enviando…" : "Receber link de acesso"}
          </button>
        </form>
      )}
    </main>
  );
}
