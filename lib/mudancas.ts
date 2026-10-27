const ouvintes = new Set<() => void>();

export function avisarMudanca() {
  for (const ouvir of ouvintes) ouvir();
}

export function aoMudar(ouvir: () => void) {
  ouvintes.add(ouvir);
  return () => {
    ouvintes.delete(ouvir);
  };
}
