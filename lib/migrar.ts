// A migração do IndexedDB para o Supabase foi retirada: o app recomeçou do zero e
// o banco novo não tem blocos. A função continua exportada para não quebrar quem a chama.
export function garantirMigracao() {
  return Promise.resolve();
}
