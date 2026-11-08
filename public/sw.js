// Cache de abertura offline. O app continua funcionando só com a rede para os dados
// do Supabase; aqui ficam apenas os arquivos do próprio site.
//
// Regra de ouro: nenhum cache cresce sem limite.
// - Mudar VERSAO apaga, na ativação, tudo o que as versões antigas guardaram.
// - Arquivos estáticos: no máximo MAX_ESTATICOS; os mais antigos saem primeiro.
// - Páginas: uma entrada por caminho (sem ?pagina=…), no máximo MAX_PAGINAS.
const VERSAO = "foco-v2";
const ESTATICOS = `${VERSAO}-estaticos`;
const PAGINAS = `${VERSAO}-paginas`;
const MAX_ESTATICOS = 120;
const MAX_PAGINAS = 24;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(
        nomes
          .filter((nome) => nome.startsWith("foco-v") && !nome.startsWith(VERSAO))
          .map((nome) => caches.delete(nome)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Mantém só as `maximo` entradas mais recentes (keys() devolve da mais antiga para a mais nova). */
async function limitar(cache, maximo) {
  const chaves = await cache.keys();
  const sobra = chaves.length - maximo;
  for (let i = 0; i < sobra; i += 1) await cache.delete(chaves[i]);
}

async function guardar(cache, chave, resposta, maximo) {
  await cache.put(chave, resposta);
  await limitar(cache, maximo);
}

async function primeiroCache(requisicao) {
  const cache = await caches.open(ESTATICOS);
  const guardado = await cache.match(requisicao);
  if (guardado) return guardado;
  const resposta = await fetch(requisicao);
  if (resposta.ok) void guardar(cache, requisicao, resposta.clone(), MAX_ESTATICOS);
  return resposta;
}

/** Páginas com ?pagina=3 e ?pagina=4 são o mesmo documento: guarda por caminho. */
function chaveDaPagina(url) {
  return new Request(url.origin + url.pathname);
}

async function redePrimeiro(requisicao, url) {
  const cache = await caches.open(PAGINAS);
  const chave = chaveDaPagina(url);
  try {
    const resposta = await fetch(requisicao);
    if (resposta.ok && !resposta.redirected) void guardar(cache, chave, resposta.clone(), MAX_PAGINAS);
    return resposta;
  } catch (erro) {
    const guardado =
      (await cache.match(chave)) ||
      (await cache.match(new Request(url.origin + "/hoje"))) ||
      (await cache.match(new Request(url.origin + "/")));
    if (guardado) return guardado;
    throw erro;
  }
}

self.addEventListener("fetch", (evento) => {
  const requisicao = evento.request;
  if (requisicao.method !== "GET") return;
  const url = new URL(requisicao.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/pdf.worker.min.mjs" || /\.(png|svg|ico|woff2?)$/.test(url.pathname)) {
    evento.respondWith(primeiroCache(requisicao));
    return;
  }

  if (requisicao.mode === "navigate") {
    evento.respondWith(redePrimeiro(requisicao, url));
  }
});
