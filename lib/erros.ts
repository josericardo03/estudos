export class ErroEstudo extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroEstudo";
  }
}

export function mensagemErro(erro: unknown, fallback: string) {
  if (erro instanceof ErroEstudo) return erro.message;
  if (erro instanceof Error && erro.name === "QuotaExceededError") {
    return "O navegador recusou o arquivo por falta de espaço local.";
  }
  return fallback;
}

export function mensagemUpload(erro: unknown) {
  if (erro instanceof ErroEstudo || (erro instanceof Error && erro.name === "QuotaExceededError")) {
    return mensagemErro(erro, "Não foi possível guardar este PDF.");
  }
  return mensagemPdf(erro);
}

export function mensagemPdf(erro: unknown) {
  const texto = erro instanceof Error ? `${erro.name} ${erro.message}` : "";
  if (/password/i.test(texto)) {
    return "Este PDF pede senha. Use uma cópia sem senha.";
  }
  if (/invalid pdf/i.test(texto)) {
    return "Este arquivo não é um PDF válido.";
  }
  if (/worker/i.test(texto)) {
    return "Não foi possível iniciar o leitor de PDF. Recarregue a página.";
  }
  return "Não consegui abrir este PDF.";
}
