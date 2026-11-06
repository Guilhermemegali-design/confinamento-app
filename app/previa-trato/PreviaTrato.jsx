"use client";

import { AbaCargas } from "@/components/ConfinamentoTab";
import { cargasPeriodo } from "@/tests/fixtures/tratoPeriodo.mjs";

const ingredientesMs = cargasPeriodo[0].itens.map((i) => ({ ingrediente_chave: i.ingrediente_chave,
  ingrediente_nome: i.ingrediente, ms_percentual: 40, custo_kg_mn: 1 }));
const lotes = [1, 2].map((i) => ({ id: `exemplo-${i}`, nome: `Lote ${i}` }));

export default function PreviaTrato() {
  return <main style={{ maxWidth: 1220, margin: "0 auto", padding: "28px 20px 60px" }}>
    <div style={{ marginBottom: 24, padding: "22px 24px", borderRadius: 14, background: "#1F4D45", color: "white" }}>
      <div style={{ fontSize: 11, letterSpacing: 1.4, marginBottom: 10 }}>PRÉVIA LOCAL · DADOS FICTÍCIOS</div>
      <h1 style={{ margin: "0 0 12px", fontSize: 27 }}>Teste o relatório do trato</h1>
      <p style={{ margin: "0 0 8px", lineHeight: 1.6 }}>Escolha um dia ou período e clique em <strong>Exportar erros em PDF</strong>.</p>
      <p style={{ margin: 0, lineHeight: 1.6, opacity: 0.85 }}>Neste exemplo, a Turma A trabalha nos dias ímpares e a Turma B nos pares. Ambas fazem cargas às 7h e às 14h. Os nomes vêm dos logins.</p>
    </div>
    <AbaCargas cliente={{ id: "previa-local-trato", nome: "Prévia local - dados fictícios" }} cargas={cargasPeriodo}
      ingredientesMs={ingredientesMs} lotes={lotes} consumos={[]} modoInicial="periodo" />
  </main>;
}
