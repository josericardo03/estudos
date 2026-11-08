// Cache de abertura offline. O app continua funcionando só com a rede para os dados
// do Supabase; aqui ficam apenas os arquivos do próprio site.
const VERSAO = "foco-v1";
const ESTATICOS = `${VERSAO}-estaticos`;
const PAGINAS = `${VERSAO}-paginas`;

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

async function primeiroCache(requisicao, nomeDoCache) {
  const cache = await caches.open(nomeDoCache);
  const guardado = await cache.match(requisicao);
  if (guardado) return guardado;
  const resposta = await fetch(requisicao);
  if (resposta.ok) cache.put(requisicao, resposta.clone());
  return resposta;
}

async function redePrimeiro(requisicao) {
  const cache = await caches.open(PAGINAS);
  try {
    const resposta = await fetch(requisicao);
    if (resposta.ok) cache.put(requisicao, resposta.clone());
    return resposta;
  } catch (erro) {
    const guardado = (await cache.match(requisicao)) || (await cache.match("/hoje")) || (await cache.match("/"));
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
    evento.respondWith(primeiroCache(requisicao, ESTATICOS));
    return;
  }

  if (requisicao.mode === "navigate") {
    evento.respondWith(redePrimeiro(requisicao));
  }
});
