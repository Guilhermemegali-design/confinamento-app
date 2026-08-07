"use client";

import { Users, Calendar, FileText, Receipt, BarChart3, Wheat } from "lucide-react";
import { styles } from "@/lib/styles";

export default function BottomNav({ tab, setTab }) {
  const items = [
    { key: "clientes", label: "Clientes", icon: Users },
    { key: "agenda", label: "Agenda", icon: Calendar },
    { key: "relatorios", label: "Relatórios", icon: FileText },
    { key: "dietas", label: "Dietas", icon: Wheat },
    { key: "despesas", label: "Despesas", icon: Receipt },
    { key: "gestao", label: "Gestão", icon: BarChart3 },
  ];
  return (
    <div style={styles.bottomNav}>
      {items.map(({ key, label, icon: Icon }) => (
        <button key={key} onClick={() => setTab(key)} style={{ ...styles.navBtn, color: tab === key ? "#1F4D45" : "#8A8A86" }}>
          <Icon size={18} strokeWidth={tab === key ? 2.4 : 1.8} />
          <span style={{ fontWeight: tab === key ? 600 : 500 }}>{label}</span>
        </button>
      ))}
    </div>
  );
}
