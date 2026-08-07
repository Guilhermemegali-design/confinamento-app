"use client";

import { useState } from "react";
import { Wheat, Trash2, Plus, AlertTriangle } from "lucide-react";
import { styles } from "@/lib/styles";
import { formatBRL } from "@/lib/format";
import { TIPOS_DIETA, labelTipoDieta, ingredienteVazio, calcularDieta } from "@/lib/dieta";
import { ListHeader, BackHeader, EmptyHint, InputField, SelectField, PrimaryButton } from "./UI";

export default function DietaTab({ dietas, view, setView, onAddDieta, onUpdateDieta, onDeleteDieta }) {
  if (view.screen === "nova-dieta") {
    return <FormDieta onCancel={() => setView({ screen: "list" })} onSave={onAddDieta} />;
  }

  if (view.screen === "editar-dieta") {
    const d = dietas.find((x) => x.id === view.id);
    if (!d) return <EmptyHint text="Dieta não encontrada." />;
    return (
      <FormDieta
        dietaExistente={d}
        onCancel={() => setView({ screen: "list" })}
        onSave={async (dados) => {
          await onUpdateDieta(d.id, dados);
          setView({ screen: "list" });
        }}
        onDelete={async () => {
          if (confirm("Excluir esta dieta? Essa ação não pode ser desfeita.")) {
            await onDeleteDieta(d.id);
            setView({ screen: "list" });
          }
        }}
      />
    );
  }

  const ordenadas = [...dietas].sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <div>
      <ListHeader title="Dietas" actionLabel="Nova dieta" onAction={() => setView({ screen: "nova-dieta" })} />

      {ordenadas.length === 0 && <EmptyHint text="Nenhuma dieta cadastrada." />}
      {ordenadas.map((d) => {
        const { custoPorKgMn } = calcularDieta(d.ingredientes);
        return (
          <div key={d.id} style={styles.listItem} onClick={() => setView({ screen: "editar-dieta", id: d.id })}>
            <div style={styles.avatar}>
              <Wheat size={17} color="#1F4D45" />
            </div>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={styles.listItemTitle}>{d.nome}</div>
              <div style={styles.listItemSub}>
                {(d.ingredientes || []).length} ingrediente(s)
                {custoPorKgMn > 0 ? ` · ${formatBRL(custoPorKgMn)}/kg MN` : ""}
              </div>
            </div>
            <span style={styles.dietaTipoTag}>{labelTipoDieta(d.tipo)}</span>
          </div>
        );
      })}
    </div>
  );
}

function FormDieta({ onCancel, onSave, dietaExistente, onDelete }) {
  const ehEdicao = Boolean(dietaExistente);
  const [nome, setNome] = useState(dietaExistente?.nome || "");
  const [tipo, setTipo] = useState(dietaExistente?.tipo || TIPOS_DIETA[0].value);
  const [ingredientes, setIngredientes] = useState(
    dietaExistente?.ingredientes?.length ? dietaExistente.ingredientes : [ingredienteVazio()]
  );
  const [salvando, setSalvando] = useState(false);

  function atualizarIngrediente(index, campo, valor) {
    setIngredientes((lista) => lista.map((ing, i) => (i === index ? { ...ing, [campo]: valor } : ing)));
  }

  function removerIngrediente(index) {
    setIngredientes((lista) => lista.filter((_, i) => i !== index));
  }

  function adicionarIngrediente() {
    setIngredientes((lista) => [...lista, ingredienteVazio()]);
  }

  const ingredientesValidos = ingredientes.filter((ing) => ing.nome.trim());
  const { linhas, totalParticipacaoMs, custoPorKgMs, custoPorKgMn } = calcularDieta(ingredientesValidos);
  const msForaDoEsperado = ingredientesValidos.length > 0 && Math.abs(totalParticipacaoMs - 100) > 0.5;

  const valido = nome.trim() && ingredientesValidos.length > 0;

  async function handleSave() {
    setSalvando(true);
    try {
      await onSave({ nome: nome.trim(), tipo, ingredientes: ingredientesValidos });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <BackHeader title={ehEdicao ? "Editar dieta" : "Nova dieta"} onBack={onCancel} />
      <div style={styles.card}>
        <InputField label="Nome da dieta *" value={nome} onChange={setNome} placeholder="Ex: Dieta padrão terminação" />
        <SelectField label="Fase *" value={tipo} onChange={setTipo} options={TIPOS_DIETA} />
      </div>

      <div style={{ marginTop: 16, marginBottom: 8, fontSize: 12.5, fontWeight: 700, color: "#8A8A86", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Ingredientes
      </div>

      {ingredientes.map((ing, i) => {
        const linha = linhas[i];
        return (
          <div key={i} style={styles.ingredienteCard}>
            <div style={styles.ingredienteHeaderRow}>
              <input
                value={ing.nome}
                onChange={(e) => atualizarIngrediente(i, "nome", e.target.value)}
                placeholder={`Ingrediente ${i + 1}`}
                style={{ ...styles.ingredienteMiniInput, border: "none", background: "transparent", fontSize: 14.5, fontWeight: 600, padding: 0 }}
              />
              {ingredientes.length > 1 && (
                <button onClick={() => removerIngrediente(i)} style={styles.ingredienteRemoveBtn}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>
            <div style={styles.ingredienteGrid}>
              <label style={styles.ingredienteMiniField}>
                <div style={styles.ingredienteMiniLabel}>% MS do alimento</div>
                <input
                  type="number"
                  value={ing.ms}
                  onChange={(e) => atualizarIngrediente(i, "ms", e.target.value)}
                  placeholder="Ex: 88"
                  style={styles.ingredienteMiniInput}
                />
              </label>
              <label style={styles.ingredienteMiniField}>
                <div style={styles.ingredienteMiniLabel}>% na dieta (MS)</div>
                <input
                  type="number"
                  value={ing.participacao_ms}
                  onChange={(e) => atualizarIngrediente(i, "participacao_ms", e.target.value)}
                  placeholder="Ex: 20"
                  style={styles.ingredienteMiniInput}
                />
              </label>
              <label style={styles.ingredienteMiniField}>
                <div style={styles.ingredienteMiniLabel}>Preço R$/kg</div>
                <input
                  type="number"
                  value={ing.preco}
                  onChange={(e) => atualizarIngrediente(i, "preco", e.target.value)}
                  placeholder="Ex: 0,90"
                  style={styles.ingredienteMiniInput}
                />
              </label>
            </div>
            {ing.nome.trim() && (
              <div style={styles.ingredienteMnResult}>
                Participação em matéria natural: <span style={styles.ingredienteMnValor}>{linha ? linha.participacaoMn.toFixed(1) : "0,0"}%</span>
              </div>
            )}
          </div>
        );
      })}

      <button onClick={adicionarIngrediente} style={styles.addIngredienteBtn}>
        <Plus size={16} /> Adicionar ingrediente
      </button>

      {ingredientesValidos.length > 0 && (
        <div style={styles.dietaResumoCard}>
          <div style={styles.dietaResumoRow}>
            <span style={styles.dietaResumoLabel}>Custo por kg de matéria natural</span>
            <span style={styles.dietaResumoValor}>{formatBRL(custoPorKgMn)}</span>
          </div>
          <div style={styles.dietaResumoRow}>
            <span style={styles.dietaResumoLabel}>Custo por kg de matéria seca</span>
            <span style={styles.dietaResumoValor}>{formatBRL(custoPorKgMs)}</span>
          </div>
          {msForaDoEsperado && (
            <div style={styles.dietaResumoAviso}>
              <AlertTriangle size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
              A soma da participação em MS está em {totalParticipacaoMs.toFixed(1)}% (o esperado é 100%).
            </div>
          )}
        </div>
      )}

      <PrimaryButton disabled={!valido || salvando} onClick={handleSave}>
        {salvando ? "Salvando..." : ehEdicao ? "Salvar alterações" : "Salvar dieta"}
      </PrimaryButton>
      {ehEdicao && onDelete && (
        <button onClick={onDelete} style={styles.dangerLinkBtn}>
          <Trash2 size={14} /> Excluir dieta
        </button>
      )}
    </div>
  );
}
