"use client";

import { useEffect } from "react";

export default function RegistroServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let recarregando = false;
    let registrationAtual = null;

    function aoTrocarController() {
      if (recarregando) return;
      recarregando = true;
      window.location.reload();
    }

    function aoMudarVisibilidade() {
      if (document.visibilityState === "visible") registrationAtual?.update();
    }

    navigator.serviceWorker.addEventListener("controllerchange", aoTrocarController);
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        registrationAtual = registration;
        // Força a checagem imediatamente também: quem já tem o PWA instalado
        // recebe a nova marca/cache ao abrir, sem depender de esperar o navegador.
        registration.update();
        // Ao voltar pro app (ex: reabrir pelo ícone na tela inicial), força
        // checar se tem versão nova em vez de continuar com a instância parada em memória.
        document.addEventListener("visibilitychange", aoMudarVisibilidade);
      })
      .catch((err) => {
        console.error("Erro ao registrar Service Worker:", err);
      });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", aoTrocarController);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, []);

  return null;
}
