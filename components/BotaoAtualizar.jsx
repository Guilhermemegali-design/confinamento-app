"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { styles } from "@/lib/styles";

export default function BotaoAtualizar() {
  const [atualizando, setAtualizando] = useState(false);

  async function atualizar() {
    if (atualizando) return;
    setAtualizando(true);
    try {
      if ("serviceWorker" in navigator) {
        const registros = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registros.map((registro) => registro.update()));
      }
    } finally {
      window.location.reload();
    }
  }

  return (
    <button
      type="button"
      onClick={atualizar}
      disabled={atualizando}
      style={{ ...styles.iconBtn, width: "auto", alignItems: "center", gap: 5, opacity: atualizando ? 0.65 : 1 }}
      title="Buscar atualizações e recarregar"
      aria-label="Atualizar aplicativo"
    >
      <RefreshCw size={15} />
      <span style={{ fontSize: 11.5, fontWeight: 700 }}>{atualizando ? "Atualizando" : "Atualizar"}</span>
    </button>
  );
}
