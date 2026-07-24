// ============================================================
// SERVICE WORKER
//
// Função: deixar o app abrir mesmo sem internet, guardando
// uma cópia das telas (HTML/CSS/JS) no celular. Não sincroniza
// dados — só garante que a interface carregue offline.
// ============================================================

const CACHE_NAME = "rastro-confinamento-cache-v3";

const ARQUIVOS_ESSENCIAIS = [
  "/",
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

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARQUIVOS_ESSENCIAIS))
  );
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
