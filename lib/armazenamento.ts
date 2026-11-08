/** Pede ao navegador que não apague os dados do estudo quando faltar espaço. */
export async function pedirArmazenamentoPersistente() {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function usoDoArmazenamento() {
  try {
    const estimativa = await navigator.storage?.estimate?.();
    if (!estimativa) return null;
    return { usado: estimativa.usage ?? 0, cota: estimativa.quota ?? 0 };
  } catch {
    return null;
  }
}
