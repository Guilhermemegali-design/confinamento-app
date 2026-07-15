"use client";

import { useState } from "react";
import { Trash2, Pencil, ChevronUp, ChevronDown } from "lucide-react";
import { styles } from "@/lib/styles";
import { formatDataBR, formatBRL } from "@/lib/format";
import { calcularIndicadoresLote, calcularPainelConfinamento, calcularEvolucaoLote, calcularEvolucaoConsumo } from "@/lib/confinamento";
import { BackHeader, SectionTitle, EmptyHint, Field, InputField, TextAreaField, PrimaryButton } from "./UI";

const FASES_DIETA = [
  { value: "adaptacao", label: "Adaptação" },
  { value: "crescimento", label: "Crescimento" },
  { value: "terminacao", label: "Terminação" },
];
const FASE_LABEL = Object.fromEntries(FASES_DIETA.map((f) => [f.value, f.label]));

const OPCOES_ORDENACAO = [
  { value: "manual", label: "Ordem manual" },
  { value: "entrada_desc", label: "Mais recentes" },
  { value: "entrada_asc", label: "Mais antigos" },
  { value: "nome", label: "Nome (A-Z)" },
  { value: "cabecas_desc", label: "Nº de cabeças" },
];

function compararLotes(ordenacao) {
  return (a, b) => {
    if (ordenacao === "manual") {
      const oa = a.lote.ordem != null ? a.lote.ordem : Infinity;
      const ob = b.lote.ordem != null ? b.lote.ordem : Infinity;
      if (oa !== ob) return oa - ob;
      return b.lote.data_entrada.localeCompare(a.lote.data_entrada);
    }
    // "numeric: true" faz "Curral 2" vir antes de "Curral 10".
    if (ordenacao === "nome") return a.lote.nome.localeCompare(b.lote.nome, "pt-BR", { numeric: true });
    if (ordenacao === "cabecas_desc") return Number(b.lote.num_cabecas || 0) - Number(a.lote.num_cabecas || 0);
    if (ordenacao === "entrada_asc") return a.lote.data_entrada.localeCompare(b.lote.data_entrada);
    return b.lote.data_entrada.localeCompare(a.lote.data_entrada);
  };
}

function custoKgMnDaFase(lote, fase) {
  if (fase === "adaptacao") return lote.custo_kg_mn_adaptacao;
  if (fase === "crescimento") return lote.custo_kg_mn_crescimento;
  if (fase === "terminacao") return lote.custo_kg_mn_terminacao;
  return null;
}

// A MS da dieta é a mesma para qualquer lote na mesma fase — fica
// configurada uma vez no cliente (fazenda), não lote por lote.
function msDaFase(cliente, fase) {
  if (!cliente) return null;
  if (fase === "adaptacao") return cliente.ms_adaptacao;
  if (fase === "crescimento") return cliente.ms_crescimento;
  if (fase === "terminacao") return cliente.ms_terminacao;
  return null;
}

// Módulo de confinamento de um cliente: Painel (resumo) + Lotes ativos/finalizados
// + detalhe do lote (histórico de pesagens e de consumo/nutrição) + formulários.
// Reaproveitado tanto na tela do consultor (com criar/excluir) quanto no portal
// do cliente (ver e editar).
export default function ConfinamentoTab({
  cliente, lotes, pesagens = [], consumos = [],
  onAdicionar, onAtualizar, onExcluir,
  onAdicionarPesagem, onExcluirPesagem,
  onAdicionarConsumo, onAtualizarConsumo, onExcluirConsumo,
  onBack,
}) {
  const [tela, setTela] = useState({ modo: "lista" });
  const [aba, setAba] = useState("painel");
  const [ordenacao, setOrdenacao] = useState("manual");

  const pesagensPorLote = {};
  for (const p of pesagens) {
    (pesagensPorLote[p.lote_id] ||= []).push(p);
  }
  const consumosPorLote = {};
  for (const c of consumos) {
    (consumosPorLote[c.lote_id] ||= []).push(c);
  }

  if (tela.modo === "novo") {
    return (
      <FormLote
        onCancel={() => setTela({ modo: "lista" })}
        onSave={async (dados) => {
          await onAdicionar(dados);
          setTela({ modo: "lista" });
        }}
      />
    );
  }

  if (tela.modo === "editar") {
    const lote = lotes.find((l) => l.id === tela.id);
    if (!lote) return <EmptyHint text="Lote não encontrado." />;
    return (
      <FormLote
        lote={lote}
        onCancel={() => setTela({ modo: "lote", id: lote.id })}
        onSave={async (dados) => {
          await onAtualizar(lote.id, dados);
          setTela({ modo: "lote", id: lote.id });
        }}
        onDelete={
          onExcluir &&
          (async () => {
            if (confirm(`Excluir o lote "${lote.nome}"? Essa ação não pode ser desfeita.`)) {
              await onExcluir(lote.id);
              setTela({ modo: "lista" });
            }
          })
        }
      />
    );
  }

  if (tela.modo === "nova-pesagem") {
    const lote = lotes.find((l) => l.id === tela.loteId);
    if (!lote) return <EmptyHint text="Lote não encontrado." />;
    return (
      <FormPesagem
        onCancel={() => setTela({ modo: "lote", id: lote.id })}
        onSave={async (dados) => {
          await onAdicionarPesagem(lote.id, dados);
          setTela({ modo: "lote", id: lote.id });
        }}
      />
    );
  }

  if (tela.modo === "novo-consumo") {
    const lote = lotes.find((l) => l.id === tela.loteId);
    if (!lote) return <EmptyHint text="Lote não encontrado." />;
    return (
      <FormConsumo
        lote={lote}
        cliente={cliente}
        onCancel={() => setTela({ modo: "lote", id: lote.id })}
        onSave={async (dados) => {
          await onAdicionarConsumo(lote.id, dados);
          setTela({ modo: "lote", id: lote.id });
        }}
      />
    );
  }

  if (tela.modo === "editar-consumo") {
    const lote = lotes.find((l) => l.id === tela.loteId);
    const consumo = (consumosPorLote[tela.loteId] || []).find((c) => c.id === tela.consumoId);
    if (!lote || !consumo) return <EmptyHint text="Consumo não encontrado." />;
    return (
      <FormConsumo
        lote={lote}
        cliente={cliente}
        consumo={consumo}
        onCancel={() => setTela({ modo: "lote", id: lote.id })}
        onSave={async (dados) => {
          await onAtualizarConsumo(consumo.id, dados);
          setTela({ modo: "lote", id: lote.id });
        }}
      />
    );
  }

  if (tela.modo === "lancar-consumo") {
    const lotesAtivos = lotes.filter((l) => !l.data_saida);
    return (
      <FormConsumoEmMassa
        lotesAtivos={lotesAtivos}
        cliente={cliente}
        onCancel={() => setTela({ modo: "lista" })}
        onSalvarLote={onAdicionarConsumo}
        onConcluido={() => setTela({ modo: "lista" })}
      />
    );
  }

  if (tela.modo === "lote") {
    const lote = lotes.find((l) => l.id === tela.id);
    if (!lote) return <EmptyHint text="Lote não encontrado." />;
    const pesagensLote = pesagensPorLote[lote.id] || [];
    const consumosLote = consumosPorLote[lote.id] || [];
    const indicadores = calcularIndicadoresLote(lote, pesagensLote, consumosLote);
    const evolucao = calcularEvolucaoLote(lote, pesagensLote);
    const evolucaoConsumo = calcularEvolucaoConsumo(lote, pesagensLote, consumosLote);
    return (
      <LoteDetalhe
        lote={lote}
        indicadores={indicadores}
        evolucao={evolucao}
        evolucaoConsumo={evolucaoConsumo}
        onBack={() => setTela({ modo: "lista" })}
        onEditar={() => setTela({ modo: "editar", id: lote.id })}
        onNovaPesagem={onAdicionarPesagem && (() => setTela({ modo: "nova-pesagem", loteId: lote.id }))}
        onExcluirPesagem={onExcluirPesagem}
        onNovoConsumo={onAdicionarConsumo && (() => setTela({ modo: "novo-consumo", loteId: lote.id }))}
        onEditarConsumo={onAtualizarConsumo && ((consumoId) => setTela({ modo: "editar-consumo", loteId: lote.id, consumoId }))}
        onExcluirConsumo={onExcluirConsumo}
      />
    );
  }

  const painel = calcularPainelConfinamento(lotes, pesagensPorLote);
  const comIndicadores = lotes.map((l) => ({
    lote: l,
    ...calcularIndicadoresLote(l, pesagensPorLote[l.id] || [], consumosPorLote[l.id] || []),
  }));
  const ativos = comIndicadores
    .filter((i) => i.status === "Ativo")
    .sort(compararLotes(ordenacao));
  const finalizados = comIndicadores
    .filter((i) => i.status === "Finalizado")
    .sort((a, b) => (b.lote.data_saida || "").localeCompare(a.lote.data_saida || ""));

  // Move um lote ativo para cima/baixo na lista. Na primeira vez que isso é
  // usado, dá uma "ordem" (10, 20, 30...) para todos os lotes ativos com
  // base na posição atual deles na tela — depois só troca a ordem dos dois
  // lotes envolvidos na troca.
  async function moverLote(index, delta) {
    const novoIndex = index + delta;
    if (novoIndex < 0 || novoIndex >= ativos.length) return;

    const comOrdemAtual = ativos.map((item, i) => ({
      lote: item.lote,
      ordemAtual: item.lote.ordem != null ? item.lote.ordem : i * 10,
    }));

    const a = comOrdemAtual[index];
    const b = comOrdemAtual[novoIndex];

    await Promise.all([
      onAtualizar(a.lote.id, { ordem: b.ordemAtual }),
      onAtualizar(b.lote.id, { ordem: a.ordemAtual }),
      ...comOrdemAtual
        .filter((item) => item.lote.ordem == null && item.lote.id !== a.lote.id && item.lote.id !== b.lote.id)
        .map((item) => onAtualizar(item.lote.id, { ordem: item.ordemAtual })),
    ]);

    if (ordenacao !== "manual") setOrdenacao("manual");
  }

  return (
    <div>
      <div style={styles.backHeaderRow}>
        {onBack ? <BackHeader title="Confinamento" onBack={onBack} semMargem /> : <h1 style={styles.h1}>Confinamento</h1>}
        <div style={{ display: "flex", gap: 8 }}>
          {onAdicionarConsumo && (
            <button onClick={() => setTela({ modo: "lancar-consumo" })} style={styles.editLinkBtn}>
              + Consumo
            </button>
          )}
          {onAdicionar && (
            <button onClick={() => setTela({ modo: "novo" })} style={styles.editLinkBtn}>
              + Novo lote
            </button>
          )}
        </div>
      </div>
      {onBack && (
        <div style={{ fontSize: 13, color: "#9A9A94", marginTop: -8, marginBottom: 14 }}>{cliente.nome}</div>
      )}

      <div style={styles.viewToggle}>
        <button
          onClick={() => setAba("painel")}
          style={{ ...styles.viewToggleBtn, ...(aba === "painel" ? styles.viewToggleBtnActive : {}), flex: 1, justifyContent: "center", padding: "7px 10px" }}
        >
          Painel
        </button>
        <button
          onClick={() => setAba("graficos")}
          style={{ ...styles.viewToggleBtn, ...(aba === "graficos" ? styles.viewToggleBtnActive : {}), flex: 1, justifyContent: "center", padding: "7px 10px" }}
        >
          Gráficos
        </button>
      </div>

      {aba === "graficos" ? (
        <AbaGraficos lotes={lotes} pesagensPorLote={pesagensPorLote} consumosPorLote={consumosPorLote} />
      ) : (
        <>
          <SectionTitle>Painel</SectionTitle>
          <div style={styles.gestaoGrid}>
            <PainelCard label="Total de lotes" valor={painel.totalLotes} />
            <PainelCard label="Lotes ativos" valor={painel.lotesAtivos} />
            <PainelCard label="Lotes finalizados" valor={painel.lotesFinalizados} />
            <PainelCard label="Cabeças ativas" valor={painel.cabecasAtivas} />
            <PainelCard
              label="GMD médio (finalizados)"
              valor={painel.gmdMedioFinalizados != null ? `${painel.gmdMedioFinalizados.toFixed(2)} kg/dia` : "—"}
            />
            <PainelCard
              label="GMD esperado médio"
              valor={painel.gmdEsperadoMedio != null ? `${painel.gmdEsperadoMedio.toFixed(2)} kg/dia` : "—"}
            />
            <PainelCard
              label="Peso médio geral"
              valor={painel.pesoMedioGeral != null ? `${painel.pesoMedioGeral.toFixed(1)} kg` : "—"}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "20px 4px 8px" }}>
            <div style={{ ...styles.sectionTitle, margin: 0 }}>Lotes ativos</div>
            <select
              value={ordenacao}
              onChange={(e) => setOrdenacao(e.target.value)}
              style={{ fontSize: 12, color: "#5C5C58", background: "#F1EFE8", border: "none", borderRadius: 8, padding: "5px 8px", fontFamily: "inherit" }}
            >
              {OPCOES_ORDENACAO.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          {ativos.length === 0 && <EmptyHint text="Nenhum lote ativo." />}
          {ativos.map((item, index) => {
            const { lote, diasConfinamento, gmdAcumulado, pesoEsperadoHoje, custoAcumuladoAnimal } = item;
            return (
              <div key={lote.id} style={styles.listItem}>
                {ordenacao === "manual" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <button
                      onClick={() => moverLote(index, -1)}
                      disabled={index === 0}
                      style={{ background: "transparent", border: "none", color: index === 0 ? "#D8D6CD" : "#5C5C58", cursor: index === 0 ? "default" : "pointer", padding: 2, display: "flex" }}
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      onClick={() => moverLote(index, 1)}
                      disabled={index === ativos.length - 1}
                      style={{ background: "transparent", border: "none", color: index === ativos.length - 1 ? "#D8D6CD" : "#5C5C58", cursor: index === ativos.length - 1 ? "default" : "pointer", padding: 2, display: "flex" }}
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setTela({ modo: "lote", id: lote.id })}
                  style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, background: "transparent", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
                >
                  <div style={styles.avatar}>{lote.nome.charAt(0)}</div>
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={styles.listItemTitle}>{lote.nome}</div>
                    <div style={styles.listItemSub}>
                      {lote.num_cabecas} cab. · entrada {formatDataBR(lote.data_entrada)} · {diasConfinamento}d
                    </div>
                    {custoAcumuladoAnimal != null && (
                      <div style={{ fontSize: 11.5, color: "#A85A2A", marginTop: 2 }}>
                        Custo acum. {formatBRL(custoAcumuladoAnimal)}/animal
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#1F4D45" }}>
                      {pesoEsperadoHoje != null ? `${pesoEsperadoHoje.toFixed(1)} kg` : "—"}
                    </div>
                    <div style={{ fontSize: 11.5, color: "#9A9A94" }}>
                      {gmdAcumulado != null ? `GMD ${gmdAcumulado.toFixed(2)}` : "—"}
                    </div>
                  </div>
                </button>
              </div>
            );
          })}

          <SectionTitle>Lotes finalizados</SectionTitle>
          {finalizados.length === 0 && <EmptyHint text="Nenhum lote finalizado ainda." />}
          {finalizados.map(({ lote, diasConfinamento, gmdVivoEntradaSaida }) => (
            <button key={lote.id} style={styles.listItem} onClick={() => setTela({ modo: "lote", id: lote.id })}>
              <div style={{ ...styles.avatar, background: "#F1EFE8", color: "#5C5C58" }}>{lote.nome.charAt(0)}</div>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={styles.listItemTitle}>{lote.nome}</div>
                <div style={styles.listItemSub}>
                  {lote.num_cabecas} cab. · saída {formatDataBR(lote.data_saida)} · {diasConfinamento}d
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#22231F" }}>
                  {lote.peso_saida_vivo != null ? `${lote.peso_saida_vivo} kg` : "—"}
                </div>
                <div style={{ fontSize: 11.5, color: "#9A9A94" }}>
                  {gmdVivoEntradaSaida != null ? `GMD ${gmdVivoEntradaSaida.toFixed(2)}` : "—"}
                </div>
              </div>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

function PainelCard({ label, valor }) {
  return (
    <div style={styles.gestaoCard}>
      <div style={styles.gestaoCardHeader}>
        <span>{label}</span>
      </div>
      <div style={styles.gestaoCardValor}>{valor}</div>
    </div>
  );
}

function LoteDetalhe({
  lote, indicadores, evolucao, evolucaoConsumo,
  onBack, onEditar,
  onNovaPesagem, onExcluirPesagem,
  onNovoConsumo, onEditarConsumo, onExcluirConsumo,
}) {
  return (
    <div>
      <div style={styles.backHeaderRow}>
        <BackHeader title={lote.nome} onBack={onBack} semMargem />
        {onEditar && (
          <button onClick={onEditar} style={styles.editLinkBtn}>
            Editar
          </button>
        )}
      </div>

      <div style={styles.card}>
        <Field label="Status" value={indicadores.status} highlight />
        <Field label="Nº de cabeças" value={lote.num_cabecas} />
        <Field label="Data de entrada" value={formatDataBR(lote.data_entrada)} />
        <Field label="Peso de entrada" value={`${lote.peso_entrada} kg`} />
        {lote.gmd_esperado != null && <Field label="GMD esperado" value={`${lote.gmd_esperado} kg/dia`} />}
        {lote.custo_kg_mn_adaptacao != null && (
          <Field label="Custo MN — Adaptação (atual)" value={formatBRL(lote.custo_kg_mn_adaptacao)} />
        )}
        {lote.custo_kg_mn_crescimento != null && (
          <Field label="Custo MN — Crescimento (atual)" value={formatBRL(lote.custo_kg_mn_crescimento)} />
        )}
        {lote.custo_kg_mn_terminacao != null && (
          <Field label="Custo MN — Terminação (atual)" value={formatBRL(lote.custo_kg_mn_terminacao)} />
        )}
        <Field label="Dias de confinamento" value={indicadores.diasConfinamento} />
        {indicadores.status === "Ativo" ? (
          <>
            <Field
              label="Peso esperado hoje"
              value={indicadores.pesoEsperadoHoje != null ? `${indicadores.pesoEsperadoHoje.toFixed(1)} kg` : "—"}
            />
            <Field
              label="GMD acumulado"
              value={indicadores.gmdAcumulado != null ? `${indicadores.gmdAcumulado.toFixed(2)} kg/dia` : "—"}
            />
          </>
        ) : (
          <>
            <Field label="Data de saída" value={formatDataBR(lote.data_saida)} />
            <Field label="Peso de saída vivo" value={`${lote.peso_saida_vivo} kg`} />
            <Field
              label="GMD entrada-saída"
              value={indicadores.gmdVivoEntradaSaida != null ? `${indicadores.gmdVivoEntradaSaida.toFixed(2)} kg/dia` : "—"}
            />
          </>
        )}
        {lote.observacoes && <Field label="Observações" value={lote.observacoes} multiline />}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "20px 4px 8px" }}>
        <div style={{ ...styles.sectionTitle, margin: 0 }}>Histórico de pesagens</div>
        {onNovaPesagem && (
          <button onClick={onNovaPesagem} style={styles.editLinkBtn}>
            + Pesagem
          </button>
        )}
      </div>

      {evolucao.length > 1 ? (
        <GraficoLinha pontos={evolucao} valueKey="peso" unidade="kg" />
      ) : (
        <EmptyHint text="Ainda só há o peso de entrada — registre uma pesagem para ver a evolução." />
      )}

      <div style={{ marginTop: 10 }}>
        {[...evolucao].reverse().map((p, i) => (
          <div key={`${p.data}-${i}`} style={styles.rowCard}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{formatDataBR(p.data)}</div>
              <div style={{ fontSize: 11.5, color: "#9A9A94" }}>
                {p.tipo === "entrada" ? "Entrada" : p.tipo === "saida" ? "Saída" : "Pesagem"}
                {p.gmdIntervalo != null ? ` · GMD ${p.gmdIntervalo.toFixed(2)} kg/dia` : ""}
              </div>
            </div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{p.peso} kg</div>
            {onExcluirPesagem && p.tipo === "pesagem" && (
              <button
                onClick={() => {
                  if (confirm("Excluir esta pesagem?")) onExcluirPesagem(p.id);
                }}
                style={{ background: "transparent", border: "none", color: "#B8763E", cursor: "pointer", padding: 4, display: "flex" }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "20px 4px 8px" }}>
        <div style={{ ...styles.sectionTitle, margin: 0 }}>Nutrição</div>
        {onNovoConsumo && (
          <button onClick={onNovoConsumo} style={styles.editLinkBtn}>
            + Consumo
          </button>
        )}
      </div>

      {indicadores.consumoMS != null && (
        <div style={{ margin: "-4px 4px 4px", fontSize: 13, color: "#A85A2A", fontWeight: 700 }}>
          Consumo de MS por cabeça (mais recente): {indicadores.consumoMS.toFixed(2)} kg/dia
        </div>
      )}
      {(indicadores.custoMedioDiarioAnimal != null || indicadores.custoAcumuladoAnimal != null) && (
        <div style={{ margin: "0 4px 10px", fontSize: 13, color: "#7A4B26" }}>
          {indicadores.custoMedioDiarioAnimal != null && (
            <div>Custo médio diário: {formatBRL(indicadores.custoMedioDiarioAnimal)}/animal</div>
          )}
          {indicadores.custoAcumuladoAnimal != null && (
            <div style={{ fontWeight: 700 }}>
              Custo acumulado: {formatBRL(indicadores.custoAcumuladoAnimal)}/animal
            </div>
          )}
        </div>
      )}

      {evolucaoConsumo.length > 0 ? (
        <>
          {evolucaoConsumo.length > 1 && (
            <GraficoLinha pontos={evolucaoConsumo} valueKey="consumoTotalLote" unidade="kg/dia" cor="#A85A2A" />
          )}
          <div style={{ marginTop: evolucaoConsumo.length > 1 ? 10 : 0 }}>
            {[...evolucaoConsumo].reverse().map((c, i) => (
              <div key={`${c.data}-${i}`} style={styles.rowCard}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{formatDataBR(c.data)}</div>
                  <div style={{ fontSize: 11.5, color: "#9A9A94" }}>
                    {c.consumoTotalLote} kg/dia (matéria natural)
                    {c.msDieta != null ? ` · MS ${c.msDieta}%` : ""}
                    {c.consumoMSCabeca != null ? ` · ${c.consumoMSCabeca.toFixed(2)} kg MS/cab/dia` : ""}
                    {c.dietaFase ? ` · ${FASE_LABEL[c.dietaFase]}` : ""}
                    {c.custoDiarioAnimal != null ? ` · ${formatBRL(c.custoDiarioAnimal)}/animal` : ""}
                  </div>
                </div>
                {onEditarConsumo && (
                  <button
                    onClick={() => onEditarConsumo(c.id)}
                    style={{ background: "transparent", border: "none", color: "#5C5C58", cursor: "pointer", padding: 4, display: "flex" }}
                  >
                    <Pencil size={14} />
                  </button>
                )}
                {onExcluirConsumo && (
                  <button
                    onClick={() => {
                      if (confirm("Excluir este registro de consumo?")) onExcluirConsumo(c.id);
                    }}
                    style={{ background: "transparent", border: "none", color: "#B8763E", cursor: "pointer", padding: 4, display: "flex" }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <EmptyHint text="Nenhum consumo registrado ainda — lance o consumo do dia para acompanhar a nutrição do lote." />
      )}
    </div>
  );
}

// Gráfico de linha simples e genérico (valor x data). Marca única série —
// sem legenda — com pontos ≥8px, linha fina de 2px e o rótulo exato
// disponível na lista logo abaixo (que já funciona como "tabela" acessível
// dos mesmos dados).
function GraficoLinha({ pontos, valueKey, unidade = "", cor = "#1F4D45" }) {
  const largura = 320;
  const altura = 120;
  const paddingEsquerda = 34;
  const paddingDireita = 10;
  const paddingY = 16;

  const valores = pontos.map((p) => p[valueKey]);
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const meio = (min + max) / 2;
  const span = max - min || 1;

  const coords = pontos.map((p, i) => {
    const x =
      pontos.length > 1
        ? paddingEsquerda + (i / (pontos.length - 1)) * (largura - paddingEsquerda - paddingDireita)
        : (paddingEsquerda + largura - paddingDireita) / 2;
    const y = altura - paddingY - ((p[valueKey] - min) / span) * (altura - paddingY * 2);
    return { ...p, x, y };
  });

  const linha = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const formatEixo = (v) => `${Number.isInteger(v) ? v : v.toFixed(1)} ${unidade}`;

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #ECEAE3", padding: "14px 10px 10px" }}>
      <svg viewBox={`0 0 ${largura} ${altura}`} style={{ width: "100%", height: altura, display: "block" }}>
        <line x1={paddingEsquerda} y1={paddingY} x2={largura - paddingDireita} y2={paddingY} stroke="#F1EFE8" strokeWidth="1" />
        <line
          x1={paddingEsquerda}
          y1={altura / 2}
          x2={largura - paddingDireita}
          y2={altura / 2}
          stroke="#F1EFE8"
          strokeWidth="1"
        />
        <line
          x1={paddingEsquerda}
          y1={altura - paddingY}
          x2={largura - paddingDireita}
          y2={altura - paddingY}
          stroke="#F1EFE8"
          strokeWidth="1"
        />
        <text x={0} y={paddingY + 3} fontSize="9" fill="#ABA9A0">{formatEixo(max)}</text>
        <text x={0} y={altura / 2 + 3} fontSize="9" fill="#ABA9A0">{formatEixo(meio)}</text>
        <text x={0} y={altura - paddingY + 3} fontSize="9" fill="#ABA9A0">{formatEixo(min)}</text>
        <polyline points={linha} fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r="4" fill={cor}>
            <title>{`${formatDataBR(c.data)}: ${c[valueKey]} ${unidade}`}</title>
          </circle>
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "#9A9A94", padding: "2px 6px 0 34px" }}>
        <span>{formatDataBR(pontos[0].data)}</span>
        <span>{formatDataBR(pontos[pontos.length - 1].data)}</span>
      </div>
    </div>
  );
}

function FormLote({ lote, onCancel, onSave, onDelete }) {
  const editando = Boolean(lote);
  const [nome, setNome] = useState(lote?.nome || "");
  const [dataEntrada, setDataEntrada] = useState(lote?.data_entrada || new Date().toISOString().slice(0, 10));
  const [numCabecas, setNumCabecas] = useState(lote?.num_cabecas != null ? String(lote.num_cabecas) : "");
  const [pesoEntrada, setPesoEntrada] = useState(lote?.peso_entrada != null ? String(lote.peso_entrada) : "");
  const [gmdEsperado, setGmdEsperado] = useState(lote?.gmd_esperado != null ? String(lote.gmd_esperado) : "");
  const [custoAdaptacao, setCustoAdaptacao] = useState(lote?.custo_kg_mn_adaptacao != null ? String(lote.custo_kg_mn_adaptacao) : "");
  const [custoCrescimento, setCustoCrescimento] = useState(lote?.custo_kg_mn_crescimento != null ? String(lote.custo_kg_mn_crescimento) : "");
  const [custoTerminacao, setCustoTerminacao] = useState(lote?.custo_kg_mn_terminacao != null ? String(lote.custo_kg_mn_terminacao) : "");
  const [dataSaida, setDataSaida] = useState(lote?.data_saida || "");
  const [pesoSaidaVivo, setPesoSaidaVivo] = useState(lote?.peso_saida_vivo != null ? String(lote.peso_saida_vivo) : "");
  const [observacoes, setObservacoes] = useState(lote?.observacoes || "");
  const [salvando, setSalvando] = useState(false);

  const valido = nome.trim().length > 0 && dataEntrada && numCabecas !== "" && pesoEntrada !== "";

  async function handleSave() {
    setSalvando(true);
    try {
      await onSave({
        nome: nome.trim(),
        data_entrada: dataEntrada,
        num_cabecas: Number(numCabecas),
        peso_entrada: Number(pesoEntrada),
        gmd_esperado: gmdEsperado !== "" ? Number(gmdEsperado) : null,
        custo_kg_mn_adaptacao: custoAdaptacao !== "" ? Number(custoAdaptacao) : null,
        custo_kg_mn_crescimento: custoCrescimento !== "" ? Number(custoCrescimento) : null,
        custo_kg_mn_terminacao: custoTerminacao !== "" ? Number(custoTerminacao) : null,
        data_saida: dataSaida || null,
        peso_saida_vivo: pesoSaidaVivo !== "" ? Number(pesoSaidaVivo) : null,
        observacoes: observacoes || null,
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <BackHeader title={editando ? "Editar lote" : "Novo lote"} onBack={onCancel} />
      <div style={styles.card}>
        <InputField label="Nome do lote *" value={nome} onChange={setNome} placeholder="Ex: Bois 1" />
        <InputField label="Data de entrada *" type="date" value={dataEntrada} onChange={setDataEntrada} />
        <InputField label="Nº de cabeças *" type="number" value={numCabecas} onChange={setNumCabecas} placeholder="Ex: 130" />
        <InputField label="Peso de entrada (kg) *" type="number" value={pesoEntrada} onChange={setPesoEntrada} placeholder="Ex: 410" />
        <InputField label="GMD esperado (kg/dia)" type="number" value={gmdEsperado} onChange={setGmdEsperado} placeholder="Ex: 1.5" />
      </div>

      <SectionTitle>Custo do kg de MN por fase</SectionTitle>
      <div style={styles.card}>
        <InputField label="Adaptação (R$/kg)" type="number" value={custoAdaptacao} onChange={setCustoAdaptacao} placeholder="Ex: 1.10" />
        <InputField label="Crescimento (R$/kg)" type="number" value={custoCrescimento} onChange={setCustoCrescimento} placeholder="Ex: 1.20" />
        <InputField label="Terminação (R$/kg)" type="number" value={custoTerminacao} onChange={setCustoTerminacao} placeholder="Ex: 1.35" />
        <div style={{ fontSize: 11.5, color: "#9A9A94", padding: "0 0 10px" }}>
          Ao lançar o consumo do dia, basta escolher a dieta — o custo é preenchido automaticamente.
        </div>
      </div>

      <SectionTitle>Saída</SectionTitle>
      <div style={styles.card}>
        <InputField label="Data de saída" type="date" value={dataSaida} onChange={setDataSaida} />
        <InputField label="Peso de saída vivo (kg)" type="number" value={pesoSaidaVivo} onChange={setPesoSaidaVivo} />
      </div>

      <div style={styles.card}>
        <TextAreaField label="Observações" value={observacoes} onChange={setObservacoes} placeholder="Notas gerais sobre o lote" />
      </div>

      <PrimaryButton disabled={!valido || salvando} onClick={handleSave}>
        {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Salvar lote"}
      </PrimaryButton>

      {editando && onDelete && (
        <button onClick={onDelete} style={styles.dangerLinkBtn}>
          <Trash2 size={14} /> Excluir lote
        </button>
      )}
    </div>
  );
}

function FormPesagem({ onCancel, onSave }) {
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [peso, setPeso] = useState("");
  const [salvando, setSalvando] = useState(false);
  const valido = data && peso !== "";

  async function handleSave() {
    setSalvando(true);
    try {
      await onSave({ data, peso: Number(peso) });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <BackHeader title="Nova pesagem" onBack={onCancel} />
      <div style={styles.card}>
        <InputField label="Data *" type="date" value={data} onChange={setData} />
        <InputField label="Peso (kg) *" type="number" value={peso} onChange={setPeso} placeholder="Ex: 480" />
      </div>
      <PrimaryButton disabled={!valido || salvando} onClick={handleSave}>
        {salvando ? "Salvando..." : "Salvar pesagem"}
      </PrimaryButton>
    </div>
  );
}

function FormConsumo({ lote, cliente, consumo, onCancel, onSave }) {
  const editando = Boolean(consumo);
  const [data, setData] = useState(consumo?.data || new Date().toISOString().slice(0, 10));
  const [consumoTotalLote, setConsumoTotalLote] = useState(consumo?.consumo_total_lote != null ? String(consumo.consumo_total_lote) : "");
  const [msDieta, setMsDieta] = useState(consumo?.ms_dieta != null ? String(consumo.ms_dieta) : "");
  const [dietaFase, setDietaFase] = useState(consumo?.dieta_fase || null);
  const [salvando, setSalvando] = useState(false);
  const valido = data && consumoTotalLote !== "";
  const consumoMSPreview =
    consumoTotalLote !== "" && msDieta !== "" && lote.num_cabecas > 0
      ? (Number(consumoTotalLote) * (Number(msDieta) / 100)) / Number(lote.num_cabecas)
      : null;
  const custoKgMnAtual = dietaFase ? custoKgMnDaFase(lote, dietaFase) : null;
  const custoDiarioPreview =
    consumoTotalLote !== "" && custoKgMnAtual != null && lote.num_cabecas > 0
      ? (Number(consumoTotalLote) / Number(lote.num_cabecas)) * Number(custoKgMnAtual)
      : null;

  function selecionarFase(fase) {
    setDietaFase(fase);
    const ms = msDaFase(cliente, fase);
    if (ms != null) setMsDieta(String(ms));
  }

  async function handleSave() {
    setSalvando(true);
    try {
      await onSave({
        data,
        consumo_total_lote: Number(consumoTotalLote),
        ms_dieta: msDieta !== "" ? Number(msDieta) : null,
        dieta_fase: dietaFase,
        custo_kg_mn: custoKgMnAtual,
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <BackHeader title={editando ? "Editar consumo" : "Novo consumo"} onBack={onCancel} />
      <div style={styles.card}>
        <InputField label="Data *" type="date" value={data} onChange={setData} />
        <div style={{ padding: "10px 0 4px" }}>
          <div style={styles.fieldLabel}>Dieta fornecida</div>
          <div style={{ ...styles.viewToggle, marginTop: 6 }}>
            {FASES_DIETA.map((f) => (
              <button
                key={f.value}
                onClick={() => selecionarFase(f.value)}
                style={{
                  ...styles.viewToggleBtn,
                  ...(dietaFase === f.value ? styles.viewToggleBtnActive : {}),
                  flex: 1, justifyContent: "center", padding: "7px 6px", fontSize: 12.5,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <InputField
          label="Consumo de matéria natural (kg/dia, lote) *"
          type="number"
          value={consumoTotalLote}
          onChange={setConsumoTotalLote}
          placeholder="Total do lote/dia"
        />
        <InputField label="MS da dieta (%)" type="number" value={msDieta} onChange={setMsDieta} placeholder="Ex: 65" />
        <Field
          label="Consumo de MS por cabeça (calculado)"
          value={consumoMSPreview != null ? `${consumoMSPreview.toFixed(2)} kg/dia` : "Preencha consumo e MS"}
          highlight={consumoMSPreview != null}
        />
        <Field
          label="Custo diário por animal (calculado)"
          value={
            !dietaFase
              ? "Selecione a dieta"
              : custoKgMnAtual == null
              ? "Preço não cadastrado — edite o lote"
              : consumoTotalLote === ""
              ? "Preencha o consumo para calcular"
              : formatBRL(custoDiarioPreview)
          }
          highlight={custoDiarioPreview != null}
        />
      </div>
      <PrimaryButton disabled={!valido || salvando} onClick={handleSave}>
        {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Salvar consumo"}
      </PrimaryButton>
    </div>
  );
}

// Lançamento do consumo do dia para todos os lotes ativos de uma vez —
// uma data só, um cartão por lote (só quem tiver o consumo preenchido é
// salvo).
function FormConsumoEmMassa({ lotesAtivos, cliente, onCancel, onSalvarLote, onConcluido }) {
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [valores, setValores] = useState({}); // { [loteId]: { consumo: "", ms: "", fase: "" } }
  const [faseGlobal, setFaseGlobal] = useState(null);
  const [msGlobal, setMsGlobal] = useState("");
  const [salvando, setSalvando] = useState(false);

  function setCampo(loteId, campo, valor) {
    setValores((v) => ({ ...v, [loteId]: { ...v[loteId], [campo]: valor } }));
  }

  // Digitou a MS uma vez aqui em cima? Aplica na hora pra todos os lotes —
  // não precisa repetir o mesmo número lote por lote.
  function aplicarMsATodos(valor) {
    setMsGlobal(valor);
    setValores((v) => {
      const novo = { ...v };
      for (const lote of lotesAtivos) {
        novo[lote.id] = { ...novo[lote.id], ms: valor };
      }
      return novo;
    });
  }

  function selecionarFase(loteId, fase) {
    const ms = msDaFase(cliente, fase);
    setValores((v) => ({
      ...v,
      [loteId]: { ...v[loteId], fase, ms: ms != null ? String(ms) : v[loteId]?.ms },
    }));
  }

  // Aplica a mesma dieta (e a MS correspondente) a todos os lotes de uma
  // vez — evita clicar lote por lote quando todo mundo está na mesma fase.
  function aplicarFaseATodos(fase) {
    setFaseGlobal(fase);
    const ms = msDaFase(cliente, fase);
    if (ms != null) setMsGlobal(String(ms));
    setValores((v) => {
      const novo = { ...v };
      for (const lote of lotesAtivos) {
        novo[lote.id] = { ...novo[lote.id], fase, ms: ms != null ? String(ms) : novo[lote.id]?.ms };
      }
      return novo;
    });
  }

  const linhasPreenchidas = lotesAtivos.filter((l) => valores[l.id]?.consumo);
  const valido = Boolean(data) && linhasPreenchidas.length > 0;

  async function handleSave() {
    setSalvando(true);
    try {
      for (const lote of linhasPreenchidas) {
        const { consumo, ms, fase } = valores[lote.id];
        const custo = fase ? custoKgMnDaFase(lote, fase) : null;
        await onSalvarLote(lote.id, {
          data,
          consumo_total_lote: Number(consumo),
          ms_dieta: ms ? Number(ms) : null,
          dieta_fase: fase || null,
          custo_kg_mn: custo,
        });
      }
      onConcluido();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <BackHeader title="Lançar consumo do dia" onBack={onCancel} />
      <div style={styles.card}>
        <InputField label="Data *" type="date" value={data} onChange={setData} />
        <div style={{ padding: "10px 0 14px" }}>
          <div style={styles.fieldLabel}>Dieta de hoje (aplica a todos os lotes)</div>
          <div style={{ ...styles.viewToggle, marginTop: 6 }}>
            {FASES_DIETA.map((f) => (
              <button
                key={f.value}
                onClick={() => aplicarFaseATodos(f.value)}
                style={{
                  ...styles.viewToggleBtn,
                  ...(faseGlobal === f.value ? styles.viewToggleBtnActive : {}),
                  flex: 1, justifyContent: "center", padding: "7px 6px", fontSize: 12.5,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: "#9A9A94", paddingTop: 6 }}>
            Se algum lote estiver numa fase diferente, ajuste só ele no card abaixo.
          </div>
        </div>
        <InputField
          label="MS da dieta (%) — aplica a todos os lotes"
          type="number"
          value={msGlobal}
          onChange={aplicarMsATodos}
          placeholder="Ex: 65"
        />
      </div>

      <SectionTitle>Lotes ativos</SectionTitle>
      {lotesAtivos.length === 0 && <EmptyHint text="Nenhum lote ativo para lançar consumo." />}
      {lotesAtivos.map((lote) => {
        const valorLote = valores[lote.id] || {};
        const preview =
          valorLote.consumo && valorLote.ms && lote.num_cabecas > 0
            ? (Number(valorLote.consumo) * (Number(valorLote.ms) / 100)) / Number(lote.num_cabecas)
            : null;
        const custoAtual = valorLote.fase ? custoKgMnDaFase(lote, valorLote.fase) : null;
        const previewCusto =
          valorLote.consumo && custoAtual != null && lote.num_cabecas > 0
            ? (Number(valorLote.consumo) / Number(lote.num_cabecas)) * Number(custoAtual)
            : null;
        return (
          <div key={lote.id} style={{ ...styles.card, marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5, padding: "10px 0 0" }}>{lote.nome}</div>
            <div style={{ padding: "6px 0 4px" }}>
              <div style={styles.fieldLabel}>Dieta fornecida</div>
              <div style={{ ...styles.viewToggle, marginTop: 6 }}>
                {FASES_DIETA.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => selecionarFase(lote.id, f.value)}
                    style={{
                      ...styles.viewToggleBtn,
                      ...(valorLote.fase === f.value ? styles.viewToggleBtnActive : {}),
                      flex: 1, justifyContent: "center", padding: "6px 4px", fontSize: 11.5,
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <InputField
              label="Consumo (kg/dia, matéria natural)"
              type="number"
              value={valorLote.consumo || ""}
              onChange={(v) => setCampo(lote.id, "consumo", v)}
              placeholder="Ex: 2800"
            />
            <InputField
              label="MS da dieta (%)"
              type="number"
              value={valorLote.ms || ""}
              onChange={(v) => setCampo(lote.id, "ms", v)}
              placeholder="Ex: 65"
            />
            {preview != null && (
              <div style={{ fontSize: 12, color: "#A85A2A", fontWeight: 600, padding: "0 0 4px" }}>
                {preview.toFixed(2)} kg MS/cab/dia
              </div>
            )}
            {previewCusto != null && (
              <div style={{ fontSize: 12, color: "#7A4B26", fontWeight: 600, padding: "4px 0 10px" }}>
                {formatBRL(previewCusto)}/animal/dia
              </div>
            )}
          </div>
        );
      })}

      <PrimaryButton disabled={!valido || salvando} onClick={handleSave}>
        {salvando
          ? "Salvando..."
          : linhasPreenchidas.length > 0
          ? `Salvar consumo (${linhasPreenchidas.length} lote${linhasPreenchidas.length > 1 ? "s" : ""})`
          : "Preencha ao menos um lote"}
      </PrimaryButton>
    </div>
  );
}

// Gráfico de consumo por lote: consumo de MS em relação ao peso vivo (%).
// Só entra na lista quem já tem pelo menos 2 lançamentos de consumo com o
// dado necessário (MS da dieta preenchida).
function AbaGraficos({ lotes, pesagensPorLote, consumosPorLote }) {
  const comDados = lotes
    .map((lote) => ({
      lote,
      pontosPV: calcularEvolucaoConsumo(lote, pesagensPorLote[lote.id] || [], consumosPorLote[lote.id] || []).filter(
        (p) => p.percentualPV != null
      ),
    }))
    .filter((x) => x.pontosPV.length > 0);

  if (comDados.length === 0) {
    return (
      <EmptyHint text="Ainda não há consumo lançado com MS da dieta preenchida. Lance o consumo com a MS para ver os gráficos aqui." />
    );
  }

  return (
    <div>
      {comDados.map(({ lote, pontosPV }) => (
        <div key={lote.id} style={{ marginBottom: 26 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, margin: "0 4px 10px" }}>{lote.nome}</div>
          <div style={{ ...styles.sectionTitle, margin: "0 4px 6px" }}>Consumo de MS em relação ao peso vivo (%)</div>
          {pontosPV.length > 1 ? (
            <GraficoLinha pontos={pontosPV} valueKey="percentualPV" unidade="%" cor="#1F4D45" />
          ) : (
            <EmptyHint text="Falta a % de MS em pelo menos 2 lançamentos para montar este gráfico." />
          )}
        </div>
      ))}
    </div>
  );
}
