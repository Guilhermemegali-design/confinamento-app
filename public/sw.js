// ============================================================
// SERVICE WORKER
//
// Função: deixar o app abrir mesmo sem internet, guardando
// uma cópia das telas (HTML/CSS/JS) no celular. Não sincroniza
// dados — só garante que a interface carregue offline.
// ============================================================

const CACHE_NAME = "rastro-confinamento-cache-v4";

const ARQUIVOS_ESSENCIAIS = [
  "/",
  "/portal",
  "/manifest.json",
  "/manifest-portal.json",
  "/rastro-logo.png",
  "/rastro-icon-192.png",
  "/rastro-icon-512.png",
  "/gmegali-logo.png",
  // Mantém compatibilidade com instalações antigas, que ainda apontam
  // para estes nomes mesmo depois da troca de marca.
  "/icon.jpg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/logo.jpg",
];

// Um Service Worker recém-registrado NÃO intercepta os próprios arquivos
// carregados durante a visita que o instalou (limitação conhecida de todo
// SW) — sem isso, na primeira visita só os arquivos da lista acima ficavam
// salvos, e abrir offline logo depois de instalar o ícone mostrava tela
// branca (o HTML carregava do cache, mas o JS/CSS que desenha a tela nunca
// tinha sido salvo). Por isso buscamos "/" e "/portal" de novo aqui dentro
// e cacheamos também tudo que elas referenciam (_next/static/...), já na
// instalação — tanto pro consultor quanto pro cliente.
async function precacheChunksDe(caminho, cache) {
  try {
    const resposta = await fetch(caminho);
    const html = await resposta.text();
    const urls = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]);
    if (urls.length) await cache.addAll(urls);
  } catch {
    // sem internet no instante da instalação — sem problema, o fetch
    // handler abaixo ainda cacheia tudo normalmente nas próximas visitas
  }
}

async function precache(cache) {
  await cache.addAll(ARQUIVOS_ESSENCIAIS);
  await Promise.all([precacheChunksDe("/", cache), precacheChunksDe("/portal", cache)]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(precache));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(
        nomes.filter((nome) => nome !== CACHE_NAME).map((nome) => caches.delete(nome))
      )
    )
  );
  self.clients.claim();
});

// Estratégia: tenta a rede primeiro; se falhar (sem internet),
// usa o que estiver salvo no cache.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        return resposta;
      })
      .catch(() => caches.match(event.request))
  );
});
