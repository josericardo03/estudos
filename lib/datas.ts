const DIA = 86_400_000;

/** Meia-noite local do dia de `ms`. */
export function inicioDoDia(ms = Date.now()) {
  const data = new Date(ms);
  data.setHours(0, 0, 0, 0);
  return data.getTime();
}

/** Meia-noite local, `dias` dias depois do dia de `ms`. Respeita horário de verão. */
export function somarDias(ms: number, dias: number) {
  const data = new Date(inicioDoDia(ms));
  data.setDate(data.getDate() + dias);
  return data.getTime();
}

/** Dias de calendário entre dois instantes (positivo se `ate` é depois de `de`). */
export function diasEntre(de: number, ate: number) {
  return Math.round((inicioDoDia(ate) - inicioDoDia(de)) / DIA);
}

/** AAAA-MM-DD no fuso local. */
export function chaveDia(ms: number) {
  const data = new Date(ms);
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${mes}-${dia}`;
}

export function dataDaChave(chave: string) {
  const [ano, mes, dia] = chave.split("-").map(Number);
  return new Date(ano, mes - 1, dia).getTime();
}

export function formatarData(ms: number, opcoes?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("pt-BR", opcoes ?? { day: "numeric", month: "long", year: "numeric" }).format(ms);
}

/** Valor para <input type="date">. */
export function paraCampoData(ms: number | null | undefined) {
  return ms ? chaveDia(ms) : "";
}

/** Valor de <input type="date"> para meia-noite local. */
export function deCampoData(valor: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  return dataDaChave(valor);
}

export function formatarDuracao(segundos: number) {
  const total = Math.max(0, Math.round(segundos));
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  if (horas > 0) return `${horas}h${String(minutos).padStart(2, "0")}`;
  if (minutos > 0) return `${minutos} min`;
  return `${total}s`;
}
