"use client";

import { useEffect } from "react";

export default function RegistroServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("Erro ao registrar Service Worker:", err);
      });
    }
  }, []);

  return null;
}
