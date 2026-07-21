"use client";

import { useEffect } from "react";

export default function RegistroServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let recarregando = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (recarregando) return;
      recarregando = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        // Ao voltar pro app (ex: reabrir pelo ícone na tela inicial), força
        // checar se tem versão nova em vez de continuar com a instância parada em memória.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") registration.update();
        });
      })
      .catch((err) => {
        console.error("Erro ao registrar Service Worker:", err);
      });
  }, []);

  return null;
}
