"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Trash2, Pencil, ChevronUp, ChevronDown, Download, Upload } from "lucide-react";
import { styles } from "@/lib/styles";
import { formatDataBR, formatBRL } from "@/lib/format";
import {
  calcularIndicadoresLote, calcularPainelConfinamento, calcularEvolucaoLote, calcularEvolucaoConsumo,
  calcularResumoSaidas, calcularCabecasNaData, calcularFechamentoCusto,
  NOTAS_LEITURA_COCHO, calcularQuantidadeEsperada, obterConsumoReferenciaCocho, obterConsumoReferenciaAntesDe,
  ajustePercentualDaNota, calcularHistoricoEsperadoRealizado, montarTabelaConsumoEsperado,
} from "@/lib/confinamento";
import { BackHeader, SectionTitle, EmptyHint, Field, InputField, TextAreaField, PrimaryButton } from "./UI";

// Leaflet mexe com "window"/"document" ao criar o mapa — precisa ficar fora
// do SSR do Next, senão quebra o build.
const MapaCurrais = dynamic(() => import("./MapaCurrais"), { ssr: false });

const FASES_DIETA = [
  { value: "adaptacao", label: "Adaptação" },
  { value: "recria", label: "Recria" },
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

// Só a lista de lotes ativos tem o peso atual (estimado) calculado por
// lote — por isso essa opção não entra no array acima, usado também em
// telas (lançamento em massa, gráficos) que não carregam esse indicador.
const OPCOES_ORDENACAO_ATIVOS = [
  ...OPCOES_ORDENACAO,
  { value: "peso_desc", label: "Peso atual (maior-menor)" },
  { value: "peso_asc", label: "Peso atual (menor-maior)" },
];

// Lembra a ordenação escolhida pelo usuário (por cliente) entre uma
// visita e outra — sem isso, toda vez que abre a tela teria que
// escolher "Nome (A-Z)"/etc de novo.
function usarOrdenacaoPersistida(clienteId) {
  const chave = `confinamento_ordenacao_${clienteId || "geral"}`;
  const [ordenacao, setOrdenacaoState] = useState(() => {
    if (typeof window === "undefined") return "manual";
    return window.localStorage.getItem(chave) || "manual";
  });
  function setOrdenacao(valor) {
    setOrdenacaoState(valor);
    if (typeof window !== "undefined") window.localStorage.setItem(chave, valor);
  }
  return [ordenacao, setOrdenacao];
}

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
    if (ordenacao === "peso_desc") return Number(b.pesoEsperadoHoje || 0) - Number(a.pesoEsperadoHoje || 0);
    if (ordenacao === "peso_asc") return Number(a.pesoEsperadoHoje || 0) - Number(b.pesoEsperadoHoje || 0);
    return b.lote.data_entrada.localeCompare(a.lote.data_entrada);
  };
}

function custoKgMnDaFase(lote, fase) {
  if (fase === "adaptacao") return lote.custo_kg_mn_adaptacao;
  if (fase === "recria") return lote.custo_kg_mn_recria;
  if (fase === "crescimento") return lote.custo_kg_mn_crescimento;
  if (fase === "terminacao") return lote.custo_kg_mn_terminacao;
  return null;
}

// A MS da dieta é a mesma para qualquer lote na mesma fase — fica
// configurada uma vez no cliente (fazenda), não lote por lote.
function msDaFase(cliente, fase) {
  if (!cliente) return null;
  if (fase === "adaptacao") return cliente.ms_adaptacao;
  if (fase === "recria") return cliente.ms_recria;
  if (fase === "crescimento") return cliente.ms_crescimento;
  if (fase === "terminacao") return cliente.ms_terminacao;
  return null;
}

// Módulo de confinamento de um cliente: Painel (resumo) + Lotes ativos/finalizados
// + detalhe do lote (histórico de pesagens e de consumo/nutrição) + formulários.
// Reaproveitado tanto na tela do consultor (com criar/excluir) quanto no portal
// do cliente (ver e editar).
export default function ConfinamentoTab({
  cliente, lotes, pesagens = [], consumos = [], saidas = [], leiturasCocho = [], currais = [], curralOcupacoes = [],
  onAdicionar, onAtualizar, onExcluir,
  onAdicionarPesagem, onExcluirPesagem,
  onAdicionarSaida, onExcluirSaida,
  onAdicionarConsumo, onAtualizarConsumo, onExcluirConsumo, onImportarConsumos,
  onRegistrarLeituraCocho, onImportarLeiturasCocho,
  onAdicionarCurral, onAtualizarCurral, onExcluirCurral, onImportarCurrais, onMoverLoteParaCurral, onAtualizarCliente,
  onBack,
}) {
  const [tela, setTela] = useState({ modo: "lista" });
  const [aba, setAba] = useState("painel");
  const [ordenacao, setOrdenacao] = usarOrdenacaoPersistida(cliente?.id);
  const [movendo, setMovendo] = useState(false);

  const pesagensPorLote = {};
  for (const p of pesagens) {
    (pesagensPorLote[p.lote_id] ||= []).push(p);
  }
  const consumosPorLote = {};
  for (const c of consumos) {
    (consumosPorLote[c.lote_id] ||= []).push(c);
  }
  const saidasPorLote = {};
  for (const s of saidas) {
    (saidasPorLote[s.lote_id] ||= []).push(s);
  }
  const leiturasCochoPorLote = {};
  for (const l of leiturasCocho) {
    (leiturasCochoPorLote[l.lote_id] ||= []).push(l);
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

  if (tela.modo === "nova-saida") {
    const lote = lotes.find((l) => l.id === tela.loteId);
    if (!lote) return <EmptyHint text="Lote não encontrado." />;
    const { cabecasRestantes } = calcularResumoSaidas(lote, saidasPorLote[lote.id] || []);
    return (
      <FormSaida
        cabecasRestantes={cabecasRestantes}
        onCancel={() => setTela({ modo: "lote", id: lote.id })}
        onSave={async (dados) => {
          await onAdicionarSaida(lote.id, dados);
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
        saidas={saidasPorLote[lote.id] || []}
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
        saidas={saidasPorLote[lote.id] || []}
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
        saidasPorLote={saidasPorLote}
        cliente={cliente}
        onCancel={() => setTela({ modo: "lista" })}
        onSalvarLote={onAdicionarConsumo}
        onConcluido={() => setTela({ modo: "lista" })}
      />
    );
  }

  if (tela.modo === "importar-consumo") {
    return (
      <ImportarConsumoPlanilha
        lotes={lotes}
        cliente={cliente}
        consumos={consumos}
        onCancel={() => setTela({ modo: "lista" })}
        onImportar={onImportarConsumos}
        onConcluido={() => setTela({ modo: "lista" })}
      />
    );
  }

  if (tela.modo === "importar-cocho") {
    return (
      <ImportarLeituraCochoPlanilha
        lotes={lotes}
        leiturasCocho={leiturasCocho}
        consumosPorLote={consumosPorLote}
        onCancel={() => setTela({ modo: "lista" })}
        onImportar={onImportarLeiturasCocho}
        onConcluido={() => setTela({ modo: "lista" })}
      />
    );
  }

  if (tela.modo === "lote") {
    const lote = lotes.find((l) => l.id === tela.id);
    if (!lote) return <EmptyHint text="Lote não encontrado." />;
    const pesagensLote = pesagensPorLote[lote.id] || [];
    const consumosLote = consumosPorLote[lote.id] || [];
    const saidasLote = saidasPorLote[lote.id] || [];
    const indicadores = calcularIndicadoresLote(lote, pesagensLote, consumosLote, saidasLote);
    const evolucao = calcularEvolucaoLote(lote, pesagensLote);
    const evolucaoConsumo = calcularEvolucaoConsumo(lote, pesagensLote, consumosLote, saidasLote);
    return (
      <LoteDetalhe
        lote={lote}
        indicadores={indicadores}
        saidas={saidasLote}
        evolucao={evolucao}
        evolucaoConsumo={evolucaoConsumo}
        onBack={() => setTela({ modo: "lista" })}
        onEditar={() => setTela({ modo: "editar", id: lote.id })}
        onNovaPesagem={onAdicionarPesagem && (() => setTela({ modo: "nova-pesagem", loteId: lote.id }))}
        onExcluirPesagem={onExcluirPesagem}
        onNovaSaida={
          onAdicionarSaida &&
          indicadores.status === "Ativo" &&
          indicadores.cabecasRestantes > 0 &&
          (() => setTela({ modo: "nova-saida", loteId: lote.id }))
        }
        onExcluirSaida={onExcluirSaida}
        onNovoConsumo={onAdicionarConsumo && (() => setTela({ modo: "novo-consumo", loteId: lote.id }))}
        onEditarConsumo={onAtualizarConsumo && ((consumoId) => setTela({ modo: "editar-consumo", loteId: lote.id, consumoId }))}
        onExcluirConsumo={onExcluirConsumo}
      />
    );
  }

  const painel = calcularPainelConfinamento(lotes, pesagensPorLote, consumosPorLote, saidasPorLote);
  const comIndicadores = lotes.map((l) => ({
    lote: l,
    ...calcularIndicadoresLote(l, pesagensPorLote[l.id] || [], consumosPorLote[l.id] || [], saidasPorLote[l.id] || []),
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
    // Trava contra cliques rápidos em sequência: sem isso, um segundo clique
    // dispara antes do primeiro salvar, usando dados desatualizados e
    // desfazendo a troca anterior (a ordem "voltava" sozinha).
    if (movendo) return;
    const novoIndex = index + delta;
    if (novoIndex < 0 || novoIndex >= ativos.length) return;

    setMovendo(true);
    try {
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
    } finally {
      setMovendo(false);
    }
  }

  return (
    <div>
      <div style={styles.backHeaderRow}>
        {onBack ? <BackHeader title="Confinamento" onBack={onBack} semMargem /> : <h1 style={styles.h1}>Confinamento</h1>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {onAdicionarConsumo && (
            <button onClick={() => setTela({ modo: "lancar-consumo" })} style={styles.editLinkBtn}>
              + Consumo
            </button>
          )}
          {onImportarConsumos && (
            <button onClick={() => setTela({ modo: "importar-consumo" })} style={styles.editLinkBtn}>
              Importar planilha
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

      <div style={{ ...styles.viewToggle, flexWrap: "wrap" }}>
        <button
          onClick={() => setAba("painel")}
          style={{ ...styles.viewToggleBtn, ...(aba === "painel" ? styles.viewToggleBtnActive : {}), flex: 1, justifyContent: "center", padding: "7px 10px" }}
        >
          Painel
        </button>
        <button
          onClick={() => setAba("lotes-ativos")}
          style={{ ...styles.viewToggleBtn, ...(aba === "lotes-ativos" ? styles.viewToggleBtnActive : {}), flex: 1, justifyContent: "center", padding: "7px 10px" }}
        >
          Lotes ativos
        </button>
        <button
          onClick={() => setAba("lotes-finalizados")}
          style={{ ...styles.viewToggleBtn, ...(aba === "lotes-finalizados" ? styles.viewToggleBtnActive : {}), flex: 1, justifyContent: "center", padding: "7px 10px" }}
        >
          Lotes finalizados
        </button>
        <button
          onClick={() => setAba("graficos")}
          style={{ ...styles.viewToggleBtn, ...(aba === "graficos" ? styles.viewToggleBtnActive : {}), flex: 1, justifyContent: "center", padding: "7px 10px" }}
        >
          Gráficos
        </button>
        {onRegistrarLeituraCocho && (
          <button
            onClick={() => setAba("cocho")}
            style={{ ...styles.viewToggleBtn, ...(aba === "cocho" ? styles.viewToggleBtnActive : {}), flex: 1, justifyContent: "center", padding: "7px 10px" }}
          >
            Leitura de cocho
          </button>
        )}
        <button
          onClick={() => setAba("esperado")}
          style={{ ...styles.viewToggleBtn, ...(aba === "esperado" ? styles.viewToggleBtnActive : {}), flex: 1, justifyContent: "center", padding: "7px 10px" }}
        >
          Consumo esperado
        </button>
        <button
          onClick={() => setAba("mapa")}
          style={{ ...styles.viewToggleBtn, ...(aba === "mapa" ? styles.viewToggleBtnActive : {}), flex: 1, justifyContent: "center", padding: "7px 10px" }}
        >
          Mapa
        </button>
      </div>

      {aba === "graficos" ? (
        <AbaGraficos lotes={lotes} pesagensPorLote={pesagensPorLote} consumosPorLote={consumosPorLote} saidasPorLote={saidasPorLote} clienteId={cliente?.id} />
      ) : aba === "cocho" && onRegistrarLeituraCocho ? (
        <AbaLeituraCocho
          lotes={lotes}
          consumosPorLote={consumosPorLote}
          leiturasCochoPorLote={leiturasCochoPorLote}
          onRegistrar={onRegistrarLeituraCocho}
          onAbrirImportar={onImportarLeiturasCocho && (() => setTela({ modo: "importar-cocho" }))}
        />
      ) : aba === "esperado" ? (
        <AbaConsumoEsperado lotes={lotes} consumosPorLote={consumosPorLote} leiturasCochoPorLote={leiturasCochoPorLote} />
      ) : aba === "mapa" ? (
        <MapaCurrais
          cliente={cliente}
          lotes={lotes}
          currais={currais}
          curralOcupacoes={curralOcupacoes}
          onAdicionarCurral={onAdicionarCurral}
          onAtualizarCurral={onAtualizarCurral}
          onExcluirCurral={onExcluirCurral}
          onImportarCurrais={onImportarCurrais}
          onAtualizarLote={onAtualizar}
          onMoverLoteParaCurral={onMoverLoteParaCurral}
          onAtualizarCliente={onAtualizarCliente}
        />
      ) : aba === "lotes-ativos" ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "4px 4px 8px" }}>
            <div style={{ ...styles.sectionTitle, margin: 0 }}>Lotes ativos</div>
            <select
              value={ordenacao}
              onChange={(e) => setOrdenacao(e.target.value)}
              style={{ fontSize: 12, color: "#5C5C58", background: "#F1EFE8", border: "none", borderRadius: 8, padding: "5px 8px", fontFamily: "inherit" }}
            >
              {OPCOES_ORDENACAO_ATIVOS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          {ativos.length === 0 && <EmptyHint text="Nenhum lote ativo." />}
          {ativos.map((item, index) => {
            const { lote, diasConfinamento, gmdAcumulado, pesoEsperadoHoje, custoAcumuladoAnimal, cabecasRestantes, cabecasSaidas, dataProvavelAbate } = item;
            return (
              <div key={lote.id} style={styles.listItem}>
                {ordenacao === "manual" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <button
                      onClick={() => moverLote(index, -1)}
                      disabled={index === 0 || movendo}
                      style={{ background: "transparent", border: "none", color: index === 0 || movendo ? "#D8D6CD" : "#5C5C58", cursor: index === 0 || movendo ? "default" : "pointer", padding: 2, display: "flex" }}
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      onClick={() => moverLote(index, 1)}
                      disabled={index === ativos.length - 1 || movendo}
                      style={{ background: "transparent", border: "none", color: index === ativos.length - 1 || movendo ? "#D8D6CD" : "#5C5C58", cursor: index === ativos.length - 1 || movendo ? "default" : "pointer", padding: 2, display: "flex" }}
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
                      {cabecasSaidas > 0 ? `${cabecasRestantes} de ${lote.num_cabecas} cab.` : `${lote.num_cabecas} cab.`} · entrada {formatDataBR(lote.data_entrada)} · {diasConfinamento}d
                    </div>
                    {custoAcumuladoAnimal != null && (
                      <div style={{ fontSize: 11.5, color: "#A85A2A", marginTop: 2 }}>
                        Custo acum. {formatBRL(custoAcumuladoAnimal)}/animal
                      </div>
                    )}
                    {dataProvavelAbate != null && (
                      <div style={{ fontSize: 11.5, color: "#1F4D45", marginTop: 2 }}>
                        Abate previsto: {formatDataBR(dataProvavelAbate)}
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
        </>
      ) : aba === "lotes-finalizados" ? (
        <>
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
            <PainelCard
              label="Custo acumulado (ativos)"
              valor={painel.custoAcumuladoAtivosMedio != null ? `${formatBRL(painel.custoAcumuladoAtivosMedio)}/animal` : "—"}
            />
            <PainelCard
              label="Custo médio diário (ativos)"
              valor={painel.custoMedioDiarioAtivosMedio != null ? `${formatBRL(painel.custoMedioDiarioAtivosMedio)}/animal` : "—"}
            />
            <PainelCard
              label="Custo total (finalizados)"
              valor={painel.custoTotalFinalizadosMedio != null ? `${formatBRL(painel.custoTotalFinalizadosMedio)}/animal` : "—"}
            />
            <PainelCard
              label="Custo médio diário (finalizados)"
              valor={painel.custoMedioDiarioFinalizadosMedio != null ? `${formatBRL(painel.custoMedioDiarioFinalizadosMedio)}/animal` : "—"}
            />
          </div>
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
  lote, indicadores, saidas = [], evolucao, evolucaoConsumo,
  onBack, onEditar,
  onNovaPesagem, onExcluirPesagem,
  onNovaSaida, onExcluirSaida,
  onNovoConsumo, onEditarConsumo, onExcluirConsumo,
}) {
  const saidasOrdenadas = [...saidas].sort((a, b) => b.data.localeCompare(a.data));
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
        <Field
          label="Nº de cabeças"
          value={indicadores.cabecasSaidas > 0 ? `${indicadores.cabecasRestantes} restantes de ${lote.num_cabecas}` : lote.num_cabecas}
        />
        <Field label="Data de entrada" value={formatDataBR(lote.data_entrada)} />
        <Field label="Peso de entrada" value={`${lote.peso_entrada} kg`} />
        {lote.rendimento_entrada != null && <Field label="Rendimento de entrada" value={`${lote.rendimento_entrada}%`} />}
        {lote.preco_arroba_entrada != null && <Field label="Preço da arroba na entrada" value={formatBRL(lote.preco_arroba_entrada)} />}
        {lote.gmd_esperado != null && <Field label="GMD esperado" value={`${lote.gmd_esperado} kg/dia`} />}
        {lote.peso_esperado_abate != null && <Field label="Peso esperado de abate" value={`${lote.peso_esperado_abate} kg`} />}
        {lote.custo_kg_mn_adaptacao != null && (
          <Field label="Custo MN — Adaptação (atual)" value={formatBRL(lote.custo_kg_mn_adaptacao)} />
        )}
        {lote.custo_kg_mn_recria != null && (
          <Field label="Custo MN — Recria (atual)" value={formatBRL(lote.custo_kg_mn_recria)} />
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
            {indicadores.dataProvavelAbate != null && (
              <Field label="Data provável de abate" value={formatDataBR(indicadores.dataProvavelAbate)} />
            )}
          </>
        ) : (
          <>
            <Field label="Data de saída" value={formatDataBR(lote.data_saida)} />
            {lote.peso_saida_vivo != null && <Field label="Peso de saída vivo" value={`${lote.peso_saida_vivo} kg`} />}
            <Field
              label="GMD entrada-saída"
              value={indicadores.gmdVivoEntradaSaida != null ? `${indicadores.gmdVivoEntradaSaida.toFixed(2)} kg/dia` : "—"}
            />
            {lote.rendimento_carcaca != null && (
              <Field label="Rendimento de carcaça" value={`${lote.rendimento_carcaca}%`} />
            )}
            {lote.preco_venda_arroba != null && <Field label="Preço de venda da arroba" value={formatBRL(lote.preco_venda_arroba)} />}
            {lote.custo_operacional != null && <Field label="Custo operacional" value={formatBRL(lote.custo_operacional)} />}
          </>
        )}
        {lote.observacoes && <Field label="Observações" value={lote.observacoes} multiline />}
      </div>

      {indicadores.status === "Finalizado" && (
        <FechamentoCustoCard lote={lote} indicadores={indicadores} saidas={saidas} />
      )}

      {(onNovaSaida || saidasOrdenadas.length > 0) && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "20px 4px 8px" }}>
            <div style={{ ...styles.sectionTitle, margin: 0 }}>Saídas registradas</div>
            {onNovaSaida && (
              <button onClick={onNovaSaida} style={styles.editLinkBtn}>
                + Saída
              </button>
            )}
          </div>
          {saidasOrdenadas.length === 0 ? (
            <EmptyHint text="Nenhuma saída lançada ainda — vá registrando conforme for tirando boi do lote." />
          ) : (
            saidasOrdenadas.map((s) => (
              <div key={s.id} style={styles.rowCard}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{formatDataBR(s.data)}</div>
                  <div style={{ fontSize: 11.5, color: "#9A9A94" }}>
                    {s.num_cabecas} cab.{s.peso_saida_vivo != null ? ` · ${s.peso_saida_vivo} kg vivo/cab.` : ""}
                    {s.rendimento_carcaca != null ? ` · ${s.rendimento_carcaca}% carcaça` : ""}
                    {s.observacoes ? ` · ${s.observacoes}` : ""}
                  </div>
                </div>
                {onExcluirSaida && (
                  <button
                    onClick={() => {
                      if (confirm("Excluir esta saída?")) onExcluirSaida(s.id);
                    }}
                    style={{ background: "transparent", border: "none", color: "#B8763E", cursor: "pointer", padding: 4, display: "flex" }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))
          )}
        </>
      )}

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
// Regressão linear simples (mínimos quadrados) usando o índice do ponto
// como eixo x — serve para traçar uma linha de tendência mesmo com datas
// espaçadas de forma irregular.
function calcularRegressaoLinear(valores) {
  const n = valores.length;
  if (n < 2) return null;
  let somaX = 0, somaY = 0, somaXY = 0, somaX2 = 0;
  for (let i = 0; i < n; i++) {
    somaX += i;
    somaY += valores[i];
    somaXY += i * valores[i];
    somaX2 += i * i;
  }
  const denominador = n * somaX2 - somaX * somaX;
  if (denominador === 0) return null;
  const b = (n * somaXY - somaX * somaY) / denominador;
  const a = (somaY - b * somaX) / n;
  return { a, b }; // valor previsto no índice i = a + b*i
}

function GraficoLinha({ pontos, valueKey, unidade = "", cor = "#1F4D45", tendencia = false, id }) {
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

  const regressao = tendencia ? calcularRegressaoLinear(valores) : null;
  const linhaTendencia =
    regressao &&
    (() => {
      const yInicio = regressao.a;
      const yFim = regressao.a + regressao.b * (valores.length - 1);
      return {
        x1: coords[0].x,
        y1: altura - paddingY - ((yInicio - min) / span) * (altura - paddingY * 2),
        x2: coords[coords.length - 1].x,
        y2: altura - paddingY - ((yFim - min) / span) * (altura - paddingY * 2),
      };
    })();

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #ECEAE3", padding: "14px 10px 10px" }}>
      <svg id={id} viewBox={`0 0 ${largura} ${altura}`} style={{ width: "100%", height: altura, display: "block" }}>
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
        {linhaTendencia && (
          <line
            x1={linhaTendencia.x1}
            y1={linhaTendencia.y1}
            x2={linhaTendencia.x2}
            y2={linhaTendencia.y2}
            stroke={cor}
            strokeWidth="1.5"
            strokeDasharray="5 4"
            opacity="0.55"
          />
        )}
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
      {linhaTendencia && (
        <div style={{ fontSize: 10.5, color: "#9A9A94", padding: "4px 6px 0 34px" }}>- - - linha de tendência</div>
      )}
    </div>
  );
}

function FechamentoCustoCard({ lote, indicadores, saidas }) {
  const f = calcularFechamentoCusto(lote, indicadores, saidas);
  const semDados =
    f.valorCompraTotal == null && f.custoAlimentarTotal == null && f.receitaTotal == null && f.custoOperacionalTotal == null;
  if (semDados) return null;

  return (
    <>
      <SectionTitle>Fechamento de custo</SectionTitle>
      <div style={styles.card}>
        {f.valorCompraTotal != null && <Field label="Valor de compra (entrada)" value={formatBRL(f.valorCompraTotal)} />}
        {f.custoAlimentarTotal != null && <Field label="Custo de alimentação" value={formatBRL(f.custoAlimentarTotal)} />}
        {f.custoOperacionalTotal != null && <Field label="Custo operacional" value={formatBRL(f.custoOperacionalTotal)} />}
        {f.custoTotalGeral != null && <Field label="Custo total" value={formatBRL(f.custoTotalGeral)} />}
        {f.receitaTotal != null && <Field label="Receita de venda" value={formatBRL(f.receitaTotal)} />}
        {f.resultadoTotal != null && (
          <Field
            label="Resultado"
            value={`${formatBRL(f.resultadoTotal)}${f.resultadoPorCabeca != null ? ` (${formatBRL(f.resultadoPorCabeca)}/cab.)` : ""}`}
            highlight
          />
        )}
        {f.resultadoPorArroba != null && <Field label="Resultado por arroba produzida" value={formatBRL(f.resultadoPorArroba)} />}
      </div>
    </>
  );
}

function FormLote({ lote, onCancel, onSave, onDelete }) {
  const editando = Boolean(lote);
  const [nome, setNome] = useState(lote?.nome || "");
  const [dataEntrada, setDataEntrada] = useState(lote?.data_entrada || new Date().toISOString().slice(0, 10));
  const [numCabecas, setNumCabecas] = useState(lote?.num_cabecas != null ? String(lote.num_cabecas) : "");
  const [pesoEntrada, setPesoEntrada] = useState(lote?.peso_entrada != null ? String(lote.peso_entrada) : "");
  const [gmdEsperado, setGmdEsperado] = useState(lote?.gmd_esperado != null ? String(lote.gmd_esperado) : "");
  const [pesoEsperadoAbate, setPesoEsperadoAbate] = useState(lote?.peso_esperado_abate != null ? String(lote.peso_esperado_abate) : "");
  const [precoArrobaEntrada, setPrecoArrobaEntrada] = useState(lote?.preco_arroba_entrada != null ? String(lote.preco_arroba_entrada) : "");
  const [rendimentoEntrada, setRendimentoEntrada] = useState(lote?.rendimento_entrada != null ? String(lote.rendimento_entrada) : "");
  const [custoAdaptacao, setCustoAdaptacao] = useState(lote?.custo_kg_mn_adaptacao != null ? String(lote.custo_kg_mn_adaptacao) : "");
  const [custoRecria, setCustoRecria] = useState(lote?.custo_kg_mn_recria != null ? String(lote.custo_kg_mn_recria) : "");
  const [custoCrescimento, setCustoCrescimento] = useState(lote?.custo_kg_mn_crescimento != null ? String(lote.custo_kg_mn_crescimento) : "");
  const [custoTerminacao, setCustoTerminacao] = useState(lote?.custo_kg_mn_terminacao != null ? String(lote.custo_kg_mn_terminacao) : "");
  const [dataSaida, setDataSaida] = useState(lote?.data_saida || "");
  const [pesoSaidaVivo, setPesoSaidaVivo] = useState(lote?.peso_saida_vivo != null ? String(lote.peso_saida_vivo) : "");
  const [rendimentoCarcaca, setRendimentoCarcaca] = useState(lote?.rendimento_carcaca != null ? String(lote.rendimento_carcaca) : "");
  const [precoVendaArroba, setPrecoVendaArroba] = useState(lote?.preco_venda_arroba != null ? String(lote.preco_venda_arroba) : "");
  const [custoOperacional, setCustoOperacional] = useState(lote?.custo_operacional != null ? String(lote.custo_operacional) : "");
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
        peso_esperado_abate: pesoEsperadoAbate !== "" ? Number(pesoEsperadoAbate) : null,
        preco_arroba_entrada: precoArrobaEntrada !== "" ? Number(precoArrobaEntrada) : null,
        rendimento_entrada: rendimentoEntrada !== "" ? Number(rendimentoEntrada) : null,
        custo_kg_mn_adaptacao: custoAdaptacao !== "" ? Number(custoAdaptacao) : null,
        custo_kg_mn_recria: custoRecria !== "" ? Number(custoRecria) : null,
        custo_kg_mn_crescimento: custoCrescimento !== "" ? Number(custoCrescimento) : null,
        custo_kg_mn_terminacao: custoTerminacao !== "" ? Number(custoTerminacao) : null,
        data_saida: dataSaida || null,
        peso_saida_vivo: pesoSaidaVivo !== "" ? Number(pesoSaidaVivo) : null,
        rendimento_carcaca: rendimentoCarcaca !== "" ? Number(rendimentoCarcaca) : null,
        preco_venda_arroba: precoVendaArroba !== "" ? Number(precoVendaArroba) : null,
        custo_operacional: custoOperacional !== "" ? Number(custoOperacional) : null,
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
        <InputField
          label="Peso esperado de abate (kg)"
          type="number"
          value={pesoEsperadoAbate}
          onChange={setPesoEsperadoAbate}
          placeholder="Ex: 550"
        />
        <InputField
          label="Preço da arroba na entrada (R$/@)"
          type="number"
          value={precoArrobaEntrada}
          onChange={setPrecoArrobaEntrada}
          placeholder="Ex: 280"
        />
        <InputField
          label="Rendimento de entrada (%)"
          type="number"
          value={rendimentoEntrada}
          onChange={setRendimentoEntrada}
          placeholder="Ex: 50"
        />
      </div>

      <SectionTitle>Custo do kg de MN por fase</SectionTitle>
      <div style={styles.card}>
        <InputField label="Adaptação (R$/kg)" type="number" value={custoAdaptacao} onChange={setCustoAdaptacao} placeholder="Ex: 1.10" />
        <InputField label="Recria (R$/kg)" type="number" value={custoRecria} onChange={setCustoRecria} placeholder="Ex: 1.15" />
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
        <InputField
          label="Rendimento de carcaça (%)"
          type="number"
          value={rendimentoCarcaca}
          onChange={setRendimentoCarcaca}
          placeholder="Ex: 54.5"
        />
        <InputField
          label="Preço de venda da arroba (R$/@)"
          type="number"
          value={precoVendaArroba}
          onChange={setPrecoVendaArroba}
          placeholder="Ex: 310"
        />
        <InputField
          label="Custo operacional (R$)"
          type="number"
          value={custoOperacional}
          onChange={setCustoOperacional}
          placeholder="Frete, comissão, sanidade..."
        />
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

// Registra a saída de parte das cabeças do lote (vai tirando boi aos poucos
// até esvaziar). Quando o número de cabeças bater com o que resta, o lote
// é finalizado sozinho — não precisa editar o lote pra fechar.
function FormSaida({ cabecasRestantes, onCancel, onSave }) {
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [numCabecas, setNumCabecas] = useState(cabecasRestantes != null ? String(cabecasRestantes) : "");
  const [pesoSaidaVivo, setPesoSaidaVivo] = useState("");
  const [rendimentoCarcaca, setRendimentoCarcaca] = useState("");
  const [precoVendaArroba, setPrecoVendaArroba] = useState("");
  const [custoOperacional, setCustoOperacional] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);
  const numCabecasValido = numCabecas !== "" && Number(numCabecas) > 0 && Number(numCabecas) <= cabecasRestantes;
  const valido = data && numCabecasValido;

  async function handleSave() {
    setSalvando(true);
    try {
      await onSave({
        data,
        num_cabecas: Number(numCabecas),
        peso_saida_vivo: pesoSaidaVivo !== "" ? Number(pesoSaidaVivo) : null,
        rendimento_carcaca: rendimentoCarcaca !== "" ? Number(rendimentoCarcaca) : null,
        preco_venda_arroba: precoVendaArroba !== "" ? Number(precoVendaArroba) : null,
        custo_operacional: custoOperacional !== "" ? Number(custoOperacional) : null,
        observacoes: observacoes || null,
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <BackHeader title="Registrar saída" onBack={onCancel} />
      <div style={styles.card}>
        <InputField label="Data *" type="date" value={data} onChange={setData} />
        <InputField
          label={`Nº de cabeças que saíram * (restam ${cabecasRestantes})`}
          type="number"
          value={numCabecas}
          onChange={setNumCabecas}
          placeholder={`Máx. ${cabecasRestantes}`}
        />
        {numCabecas !== "" && !numCabecasValido && (
          <div style={{ fontSize: 11.5, color: "#B8763E", padding: "0 0 8px" }}>
            Só restam {cabecasRestantes} cabeça(s) nesse lote.
          </div>
        )}
        <InputField label="Peso de saída vivo (kg/cab.)" type="number" value={pesoSaidaVivo} onChange={setPesoSaidaVivo} placeholder="Ex: 540" />
        <InputField
          label="Rendimento de carcaça (%)"
          type="number"
          value={rendimentoCarcaca}
          onChange={setRendimentoCarcaca}
          placeholder="Ex: 54.5"
        />
        <InputField
          label="Preço de venda da arroba (R$/@)"
          type="number"
          value={precoVendaArroba}
          onChange={setPrecoVendaArroba}
          placeholder="Ex: 310"
        />
        <InputField
          label="Custo operacional (R$)"
          type="number"
          value={custoOperacional}
          onChange={setCustoOperacional}
          placeholder="Frete, comissão, sanidade..."
        />
      </div>
      <div style={styles.card}>
        <TextAreaField label="Observações" value={observacoes} onChange={setObservacoes} placeholder="Ex: venda parcial, frigorífico X" />
      </div>
      <PrimaryButton disabled={!valido || salvando} onClick={handleSave}>
        {salvando ? "Salvando..." : "Salvar saída"}
      </PrimaryButton>
    </div>
  );
}

function FormConsumo({ lote, cliente, consumo, saidas = [], onCancel, onSave }) {
  const editando = Boolean(consumo);
  const [data, setData] = useState(consumo?.data || new Date().toISOString().slice(0, 10));
  const [consumoTotalLote, setConsumoTotalLote] = useState(consumo?.consumo_total_lote != null ? String(consumo.consumo_total_lote) : "");
  const [msDieta, setMsDieta] = useState(consumo?.ms_dieta != null ? String(consumo.ms_dieta) : "");
  const [dietaFase, setDietaFase] = useState(consumo?.dieta_fase || null);
  const [salvando, setSalvando] = useState(false);
  const valido = data && consumoTotalLote !== "";
  // Se já houve saída parcial antes dessa data, divide pelo que sobrou no
  // lote naquele dia — não pelo total que entrou.
  const cabecasNaData = calcularCabecasNaData(lote, saidas, data);
  const consumoMSPreview =
    consumoTotalLote !== "" && msDieta !== "" && cabecasNaData > 0
      ? (Number(consumoTotalLote) * (Number(msDieta) / 100)) / cabecasNaData
      : null;
  const custoKgMnAtual = dietaFase ? custoKgMnDaFase(lote, dietaFase) : null;
  const custoDiarioPreview =
    consumoTotalLote !== "" && custoKgMnAtual != null && cabecasNaData > 0
      ? (Number(consumoTotalLote) / cabecasNaData) * Number(custoKgMnAtual)
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
function FormConsumoEmMassa({ lotesAtivos, saidasPorLote = {}, cliente, onCancel, onSalvarLote, onConcluido }) {
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [valores, setValores] = useState({}); // { [loteId]: { consumo: "", ms: "", fase: "" } }
  const [faseGlobal, setFaseGlobal] = useState(null);
  const [msGlobal, setMsGlobal] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [ordenacao, setOrdenacao] = usarOrdenacaoPersistida(cliente?.id);

  const lotesOrdenados = lotesAtivos
    .map((lote) => ({ lote }))
    .sort(compararLotes(ordenacao))
    .map((item) => item.lote);

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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "4px 4px 8px" }}>
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
      {lotesAtivos.length === 0 && <EmptyHint text="Nenhum lote ativo para lançar consumo." />}
      {lotesOrdenados.map((lote) => {
        const valorLote = valores[lote.id] || {};
        const cabecasNaData = calcularCabecasNaData(lote, saidasPorLote[lote.id] || [], data);
        const preview =
          valorLote.consumo && valorLote.ms && cabecasNaData > 0
            ? (Number(valorLote.consumo) * (Number(valorLote.ms) / 100)) / cabecasNaData
            : null;
        const custoAtual = valorLote.fase ? custoKgMnDaFase(lote, valorLote.fase) : null;
        const previewCusto =
          valorLote.consumo && custoAtual != null && cabecasNaData > 0
            ? (Number(valorLote.consumo) / cabecasNaData) * Number(custoAtual)
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

// Casa o valor de uma célula (ex: "3", "Lote 3", "Curral 5") com o lote
// correspondente — compara pelo número quando os dois têm um (cobre o caso
// comum da planilha trazer só o número do lote/curral), senão cai para
// comparação exata de texto (sem acento/maiúscula/espaço nas pontas).
function normalizarTexto(valor) {
  return String(valor ?? "").trim().toLowerCase();
}
function extrairNumero(valor) {
  const m = String(valor ?? "").match(/\d+/);
  return m ? m[0] : null;
}
function encontrarLotePorNomeOuNumero(valor, lotes) {
  const numeroAlvo = extrairNumero(valor);
  const textoAlvo = normalizarTexto(valor);
  if (!textoAlvo) return null;
  return (
    lotes.find((l) => {
      const numeroLote = extrairNumero(l.nome);
      return numeroAlvo != null && numeroLote != null
        ? numeroAlvo === numeroLote
        : normalizarTexto(l.nome) === textoAlvo;
    }) || null
  );
}

// Cabeçalho/texto sem acento, minúsculo, só letras/números separados por
// espaço — pra achar coluna pelo nome ("MS (%)", "Ms Dieta", "ms" tudo vira
// "ms") e reconhecer a fase da dieta ("Terminação"/"Terminacao" → mesma coisa).
function normalizarCabecalho(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function indiceColuna(cabecalhos, palavras) {
  return cabecalhos.findIndex((h) => {
    const norm = normalizarCabecalho(h);
    if (!norm) return false;
    const tokens = norm.split(" ");
    return palavras.some((p) => tokens.includes(p) || norm.startsWith(p));
  });
}
function normalizarFasePlanilha(valor) {
  const norm = normalizarCabecalho(valor).replace(/\s+/g, "");
  if (!norm) return null;
  if (norm.startsWith("adapt")) return "adaptacao";
  if (norm.startsWith("recri")) return "recria";
  if (norm.startsWith("cresc")) return "crescimento";
  if (norm.startsWith("termin")) return "terminacao";
  return null;
}

// Datas podem vir como objeto Date (quando a célula do Excel está formatada
// como data), texto dd/mm/aaaa, aaaa-mm-dd, ou o serial numérico do Excel
// (dias desde 30/12/1899) quando a planilha guarda a data como texto puro.
function normalizarDataPlanilha(valor) {
  if (valor instanceof Date && !isNaN(valor)) {
    return valor.toISOString().slice(0, 10);
  }
  const texto = String(valor ?? "").trim();
  if (!texto) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  const dm = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (dm) {
    const [, d, mo, yBruto] = dm;
    const y = yBruto.length === 2 ? `20${yBruto}` : yBruto;
    return `${y.padStart(4, "0")}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const serial = Number(texto);
  if (Number.isFinite(serial) && serial > 20000 && serial < 90000) {
    const base = new Date(Date.UTC(1899, 11, 30));
    base.setUTCDate(base.getUTCDate() + serial);
    return base.toISOString().slice(0, 10);
  }
  return null;
}

// Célula em branco = "não lançou nesse dia" (não é zero) — só vira número
// quando de fato tem um valor preenchido.
function normalizarNumeroPlanilha(valor) {
  if (valor == null || valor === "") return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const n = Number(String(valor).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Importa consumo diário de vários lotes de uma vez a partir de uma planilha
// Excel no mesmo formato de pivot table que já vem do sistema do cliente:
// uma coluna de data e uma coluna por lote (cabeçalho = nome/número do lote).
function ImportarConsumoPlanilha({ lotes, cliente, consumos, onCancel, onImportar, onConcluido }) {
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [importando, setImportando] = useState(false);
  const [concluido, setConcluido] = useState(null);

  const existentes = new Set(consumos.map((c) => `${c.lote_id}|${c.data}`));

  async function processarArquivo(file) {
    if (!file) return;
    setProcessando(true);
    setErro(null);
    setResultado(null);
    setConcluido(null);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const aba = workbook.Sheets[workbook.SheetNames[0]];
      const linhas = XLSX.utils.sheet_to_json(aba, { header: 1, defval: null });
      if (linhas.length < 2) throw new Error("Planilha vazia ou sem linhas de dados.");

      const cabecalho = linhas[0];
      const idxData = indiceColuna(cabecalho, ["data"]);
      const idxLote = indiceColuna(cabecalho, ["lote", "curral"]);
      const idxQuant = indiceColuna(cabecalho, ["quanti", "quantidade", "consumo"]);
      const idxDieta = indiceColuna(cabecalho, ["dieta", "fase"]);
      const idxMs = indiceColuna(cabecalho, ["ms"]);
      const faltando = [];
      if (idxData === -1) faltando.push("Data");
      if (idxLote === -1) faltando.push("Lote");
      if (idxQuant === -1) faltando.push("Quantidade");
      if (faltando.length > 0) {
        throw new Error(`Não encontrei a coluna de ${faltando.join(" / ")} na planilha — confira os cabeçalhos.`);
      }

      // Junta linhas do mesmo lote+data (ex: dois tratos no mesmo dia) somando
      // a quantidade — a fase/MS ficam com o primeiro valor preenchido do grupo.
      const grupos = new Map();
      const naoReconhecidos = new Set();
      let linhasIgnoradas = 0;
      let totalLinhasSomadas = 0;

      for (const linha of linhas.slice(1)) {
        if (!linha || linha.every((v) => v == null || v === "")) continue;
        const data = normalizarDataPlanilha(linha[idxData]);
        const lote = encontrarLotePorNomeOuNumero(linha[idxLote], lotes);
        const valor = normalizarNumeroPlanilha(linha[idxQuant]);
        if (!data || !lote || valor == null) {
          if (!lote && linha[idxLote] != null && linha[idxLote] !== "") naoReconhecidos.add(String(linha[idxLote]));
          linhasIgnoradas++;
          continue;
        }
        const chave = `${lote.id}|${data}`;
        const fase = idxDieta !== -1 ? normalizarFasePlanilha(linha[idxDieta]) : null;
        const ms = idxMs !== -1 ? normalizarNumeroPlanilha(linha[idxMs]) : null;
        if (grupos.has(chave)) {
          const grupo = grupos.get(chave);
          grupo.consumoTotalLote += valor;
          grupo.linhas += 1;
          if (grupo.fase == null) grupo.fase = fase;
          if (grupo.ms == null) grupo.ms = ms;
          totalLinhasSomadas++;
        } else {
          grupos.set(chave, { loteId: lote.id, loteNome: lote.nome, data, consumoTotalLote: valor, fase, ms, linhas: 1 });
        }
      }

      const novos = [];
      let jaExistentes = 0;
      for (const [chave, grupo] of grupos) {
        if (existentes.has(chave)) {
          jaExistentes++;
          continue;
        }
        novos.push(grupo);
      }

      setResultado({
        novos,
        naoReconhecidos: [...naoReconhecidos],
        jaExistentes,
        linhasIgnoradas,
        totalLinhasSomadas,
      });
    } catch (e) {
      setErro(e.message || "Não foi possível ler essa planilha.");
    } finally {
      setProcessando(false);
    }
  }

  async function confirmar() {
    if (!resultado || resultado.novos.length === 0) return;
    setImportando(true);
    try {
      const linhas = resultado.novos.map((n) => {
        const lote = lotes.find((l) => l.id === n.loteId);
        // MS: usa o da própria planilha se veio preenchido; senão cai pro MS
        // cadastrado no cliente pra essa fase (mesma regra do lançamento manual).
        const msFinal = n.ms != null ? n.ms : n.fase ? msDaFase(cliente, n.fase) : null;
        return {
          lote_id: n.loteId,
          data: n.data,
          consumo_total_lote: n.consumoTotalLote,
          ms_dieta: msFinal,
          dieta_fase: n.fase || null,
          custo_kg_mn: n.fase ? custoKgMnDaFase(lote, n.fase) : null,
        };
      });
      await onImportar(linhas);
      setConcluido(linhas.length);
    } finally {
      setImportando(false);
    }
  }

  return (
    <div>
      <BackHeader title="Importar planilha de consumo" onBack={onCancel} />

      <div style={styles.card}>
        <div style={{ fontSize: 13, color: "#5C5C58", padding: "10px 0" }}>
          Planilha Excel (.xlsx) com uma linha por lote/data e colunas "Data",
          "Lote", "Quantidade" (ou "Consumo") — "Dieta" e "MS" são opcionais.
          O nome do lote na planilha precisa bater com o do app (ex: "3"
          reconhece "Lote 3"). Se o mesmo lote aparecer mais de uma vez no
          mesmo dia, as quantidades são somadas num único lançamento diário.
        </div>
        <input
          type="file"
          accept=".xlsx,.xls"
          disabled={processando || importando}
          onChange={(e) => processarArquivo(e.target.files?.[0])}
          style={{ fontSize: 13, padding: "10px 0" }}
        />
        {processando && <div style={{ fontSize: 13, color: "#9A9A94" }}>Lendo planilha...</div>}
        {erro && <div style={{ fontSize: 13, color: "#B8763E", padding: "6px 0" }}>{erro}</div>}
      </div>

      {resultado && concluido == null && (
        <>
          <div style={{ ...styles.card, marginTop: 10 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, padding: "10px 0 4px" }}>Resumo da planilha</div>
            <div style={{ fontSize: 13, color: "#5C5C58", lineHeight: 1.6 }}>
              {resultado.novos.length} lançamento{resultado.novos.length !== 1 ? "s" : ""} novo
              {resultado.novos.length !== 1 ? "s" : ""} pronto{resultado.novos.length !== 1 ? "s" : ""} pra importar
              {resultado.totalLinhasSomadas > 0 && (
                <div>{resultado.totalLinhasSomadas} linha(s) somadas por serem do mesmo lote/data</div>
              )}
              {resultado.jaExistentes > 0 && (
                <div>{resultado.jaExistentes} já existiam no app (não serão duplicados)</div>
              )}
              {resultado.linhasIgnoradas > 0 && (
                <div>{resultado.linhasIgnoradas} linha(s) sem data/lote/quantidade válidos, ignorada(s)</div>
              )}
              {resultado.naoReconhecidos.length > 0 && (
                <div style={{ color: "#B8763E", marginTop: 4 }}>
                  Lotes não reconhecidos (verifique o nome): {resultado.naoReconhecidos.join(", ")}
                </div>
              )}
            </div>
          </div>

          <PrimaryButton disabled={resultado.novos.length === 0 || importando} onClick={confirmar}>
            {importando
              ? "Importando..."
              : resultado.novos.length > 0
              ? `Importar ${resultado.novos.length} lançamento${resultado.novos.length > 1 ? "s" : ""}`
              : "Nenhum lançamento novo para importar"}
          </PrimaryButton>
        </>
      )}

      {concluido != null && (
        <div style={{ ...styles.card, marginTop: 10, textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1F4D45", padding: "14px 0" }}>
            {concluido} lançamento{concluido !== 1 ? "s" : ""} importado{concluido !== 1 ? "s" : ""} com sucesso.
          </div>
          <PrimaryButton onClick={onConcluido}>Voltar</PrimaryButton>
        </div>
      )}
    </div>
  );
}

// Importa a leitura de cocho (nota de -4 a 4 por lote/dia) de uma planilha —
// mesmo modelo de colunas "Data"/"Lote" do importador de consumo, mais uma
// coluna de nota/escore. O consumo de referência e a quantidade esperada de
// cada linha são recalculados a partir do consumo já lançado no app antes
// daquela data (mesma regra usada no lançamento manual, dia a dia).
function ImportarLeituraCochoPlanilha({ lotes, leiturasCocho, consumosPorLote, onCancel, onImportar, onConcluido }) {
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [importando, setImportando] = useState(false);
  const [concluido, setConcluido] = useState(null);

  const existentes = new Set(leiturasCocho.map((l) => `${l.lote_id}|${l.data}`));

  async function processarArquivo(file) {
    if (!file) return;
    setProcessando(true);
    setErro(null);
    setResultado(null);
    setConcluido(null);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const aba = workbook.Sheets[workbook.SheetNames[0]];
      const linhas = XLSX.utils.sheet_to_json(aba, { header: 1, defval: null });
      if (linhas.length < 2) throw new Error("Planilha vazia ou sem linhas de dados.");

      const cabecalho = linhas[0];
      const idxData = indiceColuna(cabecalho, ["data"]);
      const idxLote = indiceColuna(cabecalho, ["lote", "curral"]);
      const idxNota = indiceColuna(cabecalho, ["nota", "escore", "pontuacao", "score", "avaliacao"]);
      const faltando = [];
      if (idxData === -1) faltando.push("Data");
      if (idxLote === -1) faltando.push("Lote");
      if (idxNota === -1) faltando.push("Nota");
      if (faltando.length > 0) {
        throw new Error(`Não encontrei a coluna de ${faltando.join(" / ")} na planilha — confira os cabeçalhos.`);
      }

      // Se o mesmo lote/data aparecer mais de uma vez, fica valendo a
      // última linha (não faz sentido somar notas de leitura de cocho).
      const candidatos = new Map();
      const naoReconhecidos = new Set();
      const notasInvalidas = new Set();
      let linhasIgnoradas = 0;

      for (const linha of linhas.slice(1)) {
        if (!linha || linha.every((v) => v == null || v === "")) continue;
        const data = normalizarDataPlanilha(linha[idxData]);
        const lote = encontrarLotePorNomeOuNumero(linha[idxLote], lotes);
        const notaBruta = normalizarNumeroPlanilha(linha[idxNota]);
        const nota = notaBruta != null ? Math.round(notaBruta) : null;
        const notaValida = nota != null && NOTAS_LEITURA_COCHO.some((n) => n.nota === nota);
        if (!data || !lote || !notaValida) {
          if (!lote && linha[idxLote] != null && linha[idxLote] !== "") naoReconhecidos.add(String(linha[idxLote]));
          if (lote && data && !notaValida && notaBruta != null) notasInvalidas.add(String(linha[idxNota]));
          linhasIgnoradas++;
          continue;
        }
        candidatos.set(`${lote.id}|${data}`, { loteId: lote.id, loteNome: lote.nome, data, nota });
      }

      const novos = [];
      const semReferencia = [];
      let jaExistentes = 0;
      for (const [chave, candidato] of candidatos) {
        if (existentes.has(chave)) {
          jaExistentes++;
          continue;
        }
        const referencia = obterConsumoReferenciaAntesDe(consumosPorLote[candidato.loteId] || [], candidato.data);
        if (!referencia) {
          semReferencia.push(candidato);
          continue;
        }
        novos.push({
          loteId: candidato.loteId,
          data: candidato.data,
          consumoReferencia: Number(referencia.consumo_total_lote),
          nota: candidato.nota,
        });
      }

      setResultado({ novos, semReferencia, naoReconhecidos: [...naoReconhecidos], notasInvalidas: [...notasInvalidas], jaExistentes, linhasIgnoradas });
    } catch (e) {
      setErro(e.message || "Não foi possível ler essa planilha.");
    } finally {
      setProcessando(false);
    }
  }

  async function confirmar() {
    if (!resultado || resultado.novos.length === 0) return;
    setImportando(true);
    try {
      const linhas = resultado.novos.map((n) => ({
        lote_id: n.loteId,
        data: n.data,
        consumo_referencia: n.consumoReferencia,
        nota: n.nota,
        ajuste_percentual: ajustePercentualDaNota(n.nota),
        quantidade_esperada: calcularQuantidadeEsperada(n.consumoReferencia, n.nota),
      }));
      await onImportar(linhas);
      setConcluido(linhas.length);
    } finally {
      setImportando(false);
    }
  }

  return (
    <div>
      <BackHeader title="Importar planilha de leitura de cocho" onBack={onCancel} />

      <div style={styles.card}>
        <div style={{ fontSize: 13, color: "#5C5C58", padding: "10px 0" }}>
          Planilha Excel (.xlsx) com uma linha por lote/data e colunas "Data",
          "Lote" e "Nota" (escore de -4 a 4, igual aos botões da leitura
          manual). O nome do lote na planilha precisa bater com o do app (ex:
          "3" reconhece "Lote 3"). Cada linha usa como referência o consumo já
          lançado no app antes daquela data — sem consumo lançado antes, a
          linha é ignorada.
        </div>
        <input
          type="file"
          accept=".xlsx,.xls"
          disabled={processando || importando}
          onChange={(e) => processarArquivo(e.target.files?.[0])}
          style={{ fontSize: 13, padding: "10px 0" }}
        />
        {processando && <div style={{ fontSize: 13, color: "#9A9A94" }}>Lendo planilha...</div>}
        {erro && <div style={{ fontSize: 13, color: "#B8763E", padding: "6px 0" }}>{erro}</div>}
      </div>

      {resultado && concluido == null && (
        <>
          <div style={{ ...styles.card, marginTop: 10 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, padding: "10px 0 4px" }}>Resumo da planilha</div>
            <div style={{ fontSize: 13, color: "#5C5C58", lineHeight: 1.6 }}>
              {resultado.novos.length} leitura{resultado.novos.length !== 1 ? "s" : ""} nova
              {resultado.novos.length !== 1 ? "s" : ""} pronta{resultado.novos.length !== 1 ? "s" : ""} pra importar
              {resultado.jaExistentes > 0 && (
                <div>{resultado.jaExistentes} já existiam no app (não serão duplicadas)</div>
              )}
              {resultado.semReferencia.length > 0 && (
                <div>
                  {resultado.semReferencia.length} linha(s) ignorada(s) por não ter consumo lançado antes da data
                </div>
              )}
              {resultado.linhasIgnoradas > 0 && (
                <div>{resultado.linhasIgnoradas} linha(s) sem data/lote/nota válidos, ignorada(s)</div>
              )}
              {resultado.naoReconhecidos.length > 0 && (
                <div style={{ color: "#B8763E", marginTop: 4 }}>
                  Lotes não reconhecidos (verifique o nome): {resultado.naoReconhecidos.join(", ")}
                </div>
              )}
              {resultado.notasInvalidas.length > 0 && (
                <div style={{ color: "#B8763E", marginTop: 4 }}>
                  Nota fora do intervalo -4 a 4: {resultado.notasInvalidas.join(", ")}
                </div>
              )}
            </div>
          </div>

          <PrimaryButton disabled={resultado.novos.length === 0 || importando} onClick={confirmar}>
            {importando
              ? "Importando..."
              : resultado.novos.length > 0
              ? `Importar ${resultado.novos.length} leitura${resultado.novos.length > 1 ? "s" : ""}`
              : "Nenhuma leitura nova para importar"}
          </PrimaryButton>
        </>
      )}

      {concluido != null && (
        <div style={{ ...styles.card, marginTop: 10, textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1F4D45", padding: "14px 0" }}>
            {concluido} leitura{concluido !== 1 ? "s" : ""} importada{concluido !== 1 ? "s" : ""} com sucesso.
          </div>
          <PrimaryButton onClick={onConcluido}>Voltar</PrimaryButton>
        </div>
      )}
    </div>
  );
}

// Gráfico de consumo por lote: consumo de MS em relação ao peso vivo (%).
// Só entra na lista quem já tem pelo menos 2 lançamentos de consumo com o
// dado necessário (MS da dieta preenchida).
function AbaGraficos({ lotes, pesagensPorLote, consumosPorLote, saidasPorLote = {}, clienteId }) {
  const [exportando, setExportando] = useState(false);
  const [ordenacao, setOrdenacao] = usarOrdenacaoPersistida(clienteId);
  const comDados = lotes
    .map((lote) => ({
      lote,
      svgId: `grafico-pv-lote-${lote.id}`,
      pontosPV: calcularEvolucaoConsumo(
        lote,
        pesagensPorLote[lote.id] || [],
        consumosPorLote[lote.id] || [],
        saidasPorLote[lote.id] || []
      ).filter((p) => p.percentualPV != null),
    }))
    .filter((x) => x.pontosPV.length > 0)
    .sort(compararLotes(ordenacao));

  if (comDados.length === 0) {
    return (
      <EmptyHint text="Ainda não há consumo lançado com MS da dieta preenchida. Lance o consumo com a MS para ver os gráficos aqui." />
    );
  }

  async function exportar() {
    setExportando(true);
    try {
      await exportarGraficosPDF(
        comDados.filter((x) => x.pontosPV.length > 1),
        "Consumo de MS em relação ao peso vivo (%)"
      );
    } finally {
      setExportando(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 4px 14px", gap: 8 }}>
        <select
          value={ordenacao}
          onChange={(e) => setOrdenacao(e.target.value)}
          style={{ fontSize: 12, color: "#5C5C58", background: "#F1EFE8", border: "none", borderRadius: 8, padding: "5px 8px", fontFamily: "inherit" }}
        >
          {OPCOES_ORDENACAO.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          onClick={exportar}
          disabled={exportando}
          style={{ ...styles.editLinkBtn, display: "flex", alignItems: "center", gap: 6 }}
        >
          <Download size={14} /> {exportando ? "Gerando PDF..." : "Exportar PDF"}
        </button>
      </div>
      {comDados.map(({ lote, pontosPV, svgId }) => (
        <div key={lote.id} style={{ marginBottom: 26 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, margin: "0 4px 10px" }}>{lote.nome}</div>
          <div style={{ ...styles.sectionTitle, margin: "0 4px 6px" }}>Consumo de MS em relação ao peso vivo (%)</div>
          {pontosPV.length > 1 ? (
            <GraficoLinha pontos={pontosPV} valueKey="percentualPV" unidade="%" cor="#1F4D45" tendencia id={svgId} />
          ) : (
            <EmptyHint text="Falta a % de MS em pelo menos 2 lançamentos para montar este gráfico." />
          )}
        </div>
      ))}
    </div>
  );
}

// Rasteriza um <svg> (auto-contido, sem CSS externo) num PNG via canvas —
// funciona porque os gráficos são desenhados só com elementos SVG básicos
// (linha, polyline, texto), sem depender de folha de estilo externa.
function svgParaPngDataUrl(svgEl, escala = 2) {
  return new Promise((resolve, reject) => {
    const viewBox = svgEl.viewBox.baseVal;
    const largura = viewBox && viewBox.width ? viewBox.width : svgEl.clientWidth;
    const altura = viewBox && viewBox.height ? viewBox.height : svgEl.clientHeight;

    const xml = new XMLSerializer().serializeToString(svgEl);
    const xmlComNamespace = xml.includes("xmlns=") ? xml : xml.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    const svg64 = btoa(unescape(encodeURIComponent(xmlComNamespace)));

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = largura * escala;
      canvas.height = altura * escala;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve({ dataUrl: canvas.toDataURL("image/png"), largura, altura });
    };
    img.onerror = reject;
    img.src = `data:image/svg+xml;base64,${svg64}`;
  });
}

// Monta um PDF com um gráfico por lote, empilhando quantos couberem em cada
// página, para o consultor mandar direto pro gestor sem precisar printar tela.
async function exportarGraficosPDF(itens, tituloGrafico) {
  if (itens.length === 0) return;
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margem = 40;
  const larguraPagina = doc.internal.pageSize.getWidth();
  const alturaPagina = doc.internal.pageSize.getHeight();
  const larguraImg = larguraPagina - margem * 2;
  let y = margem;

  doc.setFontSize(16);
  doc.text("Relatório de gráficos - Confinamento", margem, y);
  y += 18;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`, margem, y);
  doc.setTextColor(0);
  y += 22;

  for (const { lote, svgId } of itens) {
    const svgEl = document.getElementById(svgId);
    if (!svgEl) continue;
    const { dataUrl, largura, altura } = await svgParaPngDataUrl(svgEl);
    const alturaImg = (altura / largura) * larguraImg;
    const alturaBloco = 34 + alturaImg;

    if (y + alturaBloco > alturaPagina - margem) {
      doc.addPage();
      y = margem;
    }

    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text(lote.nome, margem, y);
    doc.setFont(undefined, "normal");
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(tituloGrafico, margem, y + 13);
    doc.setTextColor(0);
    y += 22;
    doc.addImage(dataUrl, "PNG", margem, y, larguraImg, alturaImg);
    y += alturaImg + 24;
  }

  doc.save(`graficos-confinamento-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// Leitura de cocho: pra cada lote ativo, mostra o consumo de referência
// (último lançamento até ontem) e 9 botões de nota (-4 a 4) que decidem o
// ajuste do trato de hoje. Uma leitura por lote/dia — clicar em outra nota
// no mesmo dia substitui a anterior (upsert), corrigindo clique errado sem
// precisar excluir nada.
function AbaLeituraCocho({ lotes, consumosPorLote, leiturasCochoPorLote, onRegistrar, onAbrirImportar }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const ativos = lotes.filter((l) => !l.data_saida);
  const [salvandoId, setSalvandoId] = useState(null);

  return (
    <div>
      {onAbrirImportar && (
        <div style={{ display: "flex", justifyContent: "flex-end", margin: "0 4px 12px" }}>
          <button onClick={onAbrirImportar} style={styles.editLinkBtn}>
            Importar planilha
          </button>
        </div>
      )}
      {ativos.length === 0 ? <EmptyHint text="Nenhum lote ativo." /> : <ListaLeituraCocho ativos={ativos} consumosPorLote={consumosPorLote} leiturasCochoPorLote={leiturasCochoPorLote} onRegistrar={onRegistrar} salvandoId={salvandoId} setSalvandoId={setSalvandoId} hoje={hoje} />}
    </div>
  );
}

function ListaLeituraCocho({ ativos, consumosPorLote, leiturasCochoPorLote, onRegistrar, salvandoId, setSalvandoId, hoje }) {

  async function registrar(lote, referencia, nota) {
    setSalvandoId(lote.id);
    try {
      await onRegistrar(lote.id, {
        data: hoje,
        consumo_referencia: Number(referencia.consumo_total_lote),
        nota,
        ajuste_percentual: NOTAS_LEITURA_COCHO.find((n) => n.nota === nota).ajuste,
        quantidade_esperada: calcularQuantidadeEsperada(referencia.consumo_total_lote, nota),
      });
    } finally {
      setSalvandoId(null);
    }
  }

  return (
    <div>
      {ativos.map((lote) => {
        const referencia = obterConsumoReferenciaCocho(consumosPorLote[lote.id] || []);
        const historico = [...(leiturasCochoPorLote[lote.id] || [])].sort((a, b) => a.data.localeCompare(b.data));
        const leituraHoje = historico.find((l) => l.data === hoje);
        return (
          <div key={lote.id} style={{ ...styles.card, marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5, padding: "10px 0 4px" }}>{lote.nome}</div>
            {referencia ? (
              <div style={{ fontSize: 12.5, color: "#9A9A94", paddingBottom: 8 }}>
                Consumo de referência ({formatDataBR(referencia.data)}): {referencia.consumo_total_lote} kg/dia
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: "#9A9A94", paddingBottom: 8 }}>
                Nenhum consumo lançado ainda — lance o consumo do lote antes de fazer a leitura de cocho.
              </div>
            )}
            <div style={{ display: "flex", gap: 6, paddingBottom: 8 }}>
              {NOTAS_LEITURA_COCHO.map(({ nota, ajuste }) => {
                const ativa = leituraHoje && Number(leituraHoje.nota) === nota;
                return (
                  <button
                    key={nota}
                    disabled={!referencia || salvandoId === lote.id}
                    onClick={() => registrar(lote, referencia, nota)}
                    title={`${ajuste > 0 ? "+" : ""}${ajuste}% no trato`}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      borderRadius: 10,
                      fontWeight: 700,
                      fontSize: 14,
                      border: ativa ? "none" : "1px solid #ECEAE3",
                      background: ativa ? "#1F4D45" : "#fff",
                      color: ativa ? "#fff" : !referencia ? "#D8D6CD" : "#22231F",
                      cursor: !referencia || salvandoId === lote.id ? "default" : "pointer",
                    }}
                  >
                    {nota > 0 ? `+${nota}` : nota}
                  </button>
                );
              })}
            </div>
            {leituraHoje && (
              <div style={{ fontSize: 12.5, color: "#A85A2A", fontWeight: 600, paddingBottom: historico.length > 1 ? 10 : 0 }}>
                Quantidade esperada hoje: {Number(leituraHoje.quantidade_esperada).toFixed(2)} kg (
                {Number(leituraHoje.ajuste_percentual) > 0 ? "+" : ""}
                {Number(leituraHoje.ajuste_percentual)}%)
              </div>
            )}
            {historico.length > 1 && <GraficoLinha pontos={historico} valueKey="nota" unidade="pontos" cor="#7A4B26" />}
          </div>
        );
      })}
    </div>
  );
}

// Baixa a tabela (lote + quantidade a fornecer) em CSV — abre certinho no
// Excel/Sheets em pt-BR (separador ";", vírgula decimal, BOM de UTF-8 pros
// acentos não bagunçarem).
function exportarConsumoEsperadoCSV(linhas, dataISO) {
  const cabecalho = "Lote;Quantidade esperada (kg)";
  const corpo = linhas
    .map((l) => `${l.lote};${l.quantidade != null ? l.quantidade.toFixed(2).replace(".", ",") : ""}`)
    .join("\n");
  const csv = `${cabecalho}\n${corpo}`;

  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `consumo-esperado-${dataISO}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Consumo esperado: quantidade que deveria ser fornecida hoje (decidida na
// leitura de cocho) e, assim que o consumo real do dia for lançado (na aba
// Nutrição do lote), compara esperado x realizado num gráfico.
function AbaConsumoEsperado({ lotes, consumosPorLote, leiturasCochoPorLote }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const ativos = lotes.filter((l) => !l.data_saida);

  if (ativos.length === 0) return <EmptyHint text="Nenhum lote ativo." />;

  const tabela = montarTabelaConsumoEsperado(ativos, leiturasCochoPorLote, consumosPorLote, hoje);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", margin: "0 4px 14px" }}>
        <button
          onClick={() => exportarConsumoEsperadoCSV(tabela, hoje)}
          style={{ ...styles.editLinkBtn, display: "flex", alignItems: "center", gap: 6 }}
        >
          <Download size={14} /> Exportar tabela
        </button>
      </div>
      {ativos.map((lote) => {
        const leituras = leiturasCochoPorLote[lote.id] || [];
        const leituraHoje = leituras.find((l) => l.data === hoje);
        const historico = calcularHistoricoEsperadoRealizado(leituras, consumosPorLote[lote.id] || []);
        return (
          <div key={lote.id} style={{ marginBottom: 26 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5, margin: "0 4px 6px" }}>{lote.nome}</div>
            {leituraHoje ? (
              <div style={{ fontSize: 13, color: "#A85A2A", fontWeight: 700, margin: "0 4px 10px" }}>
                Esperado hoje: {Number(leituraHoje.quantidade_esperada).toFixed(2)} kg (nota{" "}
                {Number(leituraHoje.nota) > 0 ? "+" : ""}
                {Number(leituraHoje.nota)})
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: "#9A9A94", margin: "0 4px 10px" }}>
                Sem leitura de cocho hoje — registre na aba "Leitura de cocho".
              </div>
            )}
            {historico.length > 1 ? (
              <GraficoDuasLinhas
                pontos={historico}
                chave1="quantidadeEsperada"
                chave2="realizado"
                label1="Esperado"
                label2="Realizado"
                unidade="kg"
                cor1="#1F4D45"
                cor2="#A85A2A"
              />
            ) : (
              <EmptyHint text='Ainda não há histórico suficiente — depende de pelo menos 2 leituras de cocho para montar o gráfico.' />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Gráfico de duas séries (esperado x realizado), mesmo estilo do
// GraficoLinha — linha cheia para a primeira série, tracejada para a
// segunda, com legenda embaixo. Pontos sem valor numa das séries (dia sem
// consumo lançado ainda) simplesmente não entram na respectiva linha.
function GraficoDuasLinhas({ pontos, chave1, chave2, label1, label2, unidade = "", cor1 = "#1F4D45", cor2 = "#A85A2A" }) {
  const largura = 320;
  const altura = 130;
  const paddingEsquerda = 34;
  const paddingDireita = 10;
  const paddingY = 16;

  const todosValores = pontos.flatMap((p) => [p[chave1], p[chave2]]).filter((v) => v != null);
  const min = Math.min(...todosValores);
  const max = Math.max(...todosValores);
  const meio = (min + max) / 2;
  const span = max - min || 1;

  const xDe = (i) =>
    pontos.length > 1
      ? paddingEsquerda + (i / (pontos.length - 1)) * (largura - paddingEsquerda - paddingDireita)
      : (paddingEsquerda + largura - paddingDireita) / 2;
  const yDe = (v) => altura - paddingY - ((v - min) / span) * (altura - paddingY * 2);

  function construirLinha(chave) {
    return pontos
      .map((p, i) => (p[chave] != null ? { x: xDe(i), y: yDe(p[chave]), v: p[chave], data: p.data } : null))
      .filter(Boolean);
  }

  const coords1 = construirLinha(chave1);
  const coords2 = construirLinha(chave2);
  const formatEixo = (v) => `${Number.isInteger(v) ? v : v.toFixed(1)} ${unidade}`;

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #ECEAE3", padding: "14px 10px 10px" }}>
      <svg viewBox={`0 0 ${largura} ${altura}`} style={{ width: "100%", height: altura, display: "block" }}>
        <line x1={paddingEsquerda} y1={paddingY} x2={largura - paddingDireita} y2={paddingY} stroke="#F1EFE8" strokeWidth="1" />
        <line x1={paddingEsquerda} y1={altura / 2} x2={largura - paddingDireita} y2={altura / 2} stroke="#F1EFE8" strokeWidth="1" />
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
        <polyline
          points={coords1.map((c) => `${c.x},${c.y}`).join(" ")}
          fill="none" stroke={cor1} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        />
        <polyline
          points={coords2.map((c) => `${c.x},${c.y}`).join(" ")}
          fill="none" stroke={cor2} strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" strokeLinejoin="round"
        />
        {coords1.map((c, i) => (
          <circle key={`a${i}`} cx={c.x} cy={c.y} r="3.5" fill={cor1}>
            <title>{`${formatDataBR(c.data)} · ${label1}: ${c.v} ${unidade}`}</title>
          </circle>
        ))}
        {coords2.map((c, i) => (
          <circle key={`b${i}`} cx={c.x} cy={c.y} r="3.5" fill={cor2}>
            <title>{`${formatDataBR(c.data)} · ${label2}: ${c.v} ${unidade}`}</title>
          </circle>
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "#9A9A94", padding: "2px 6px 0 34px" }}>
        <span>{formatDataBR(pontos[0].data)}</span>
        <span>{formatDataBR(pontos[pontos.length - 1].data)}</span>
      </div>
      <div style={{ display: "flex", gap: 14, fontSize: 10.5, color: "#5C5C58", padding: "6px 6px 0 34px" }}>
        <span><span style={{ color: cor1 }}>●</span> {label1}</span>
        <span><span style={{ color: cor2 }}>●</span> {label2}</span>
      </div>
    </div>
  );
}
