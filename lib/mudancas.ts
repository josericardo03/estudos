const ouvintes = new Set<() => void>();
let agendado: ReturnType<typeof setTimeout> | null = null;

/**
 * Avisa as telas de que algo mudou. Várias gravações seguidas (um grifo, um
 * julgamento, uma sessão) viram uma só releitura, o que poupa requisições
 * quando os dados vêm do Supabase.
 */
export function avisarMudanca() {
  if (agendado !== null) return;
  agendado = setTimeout(() => {
    agendado = null;
    for (const ouvir of [...ouvintes]) ouvir();
  }, 60);
}

export function aoMudar(ouvir: () => void) {
  ouvintes.add(ouvir);
  return () => {
    ouvintes.delete(ouvir);
  };
}
