"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  Trash2, Pencil, ChevronUp, ChevronDown, Download, Upload,
  LayoutDashboard, Beef, ClipboardList, BarChart3, Map as MapIcon, Settings2, Truck,
} from "lucide-react";
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

// O pacote ESM do SheetJS é transformado pelo bundler do Next e essa
// transformação quebra construtores internos no Safari/PWA ("Object is not
// a constructor"). Servimos a distribuição oficial de navegador sem
// transformação e a carregamos somente quando o usuário escolhe um arquivo.
let leitorExcelCarregado = null;
let promessaLeitorExcel = null;
let leitorPdfCarregado = null;
function carregarLeitorExcel() {
  if (leitorExcelCarregado) return Promise.resolve(leitorExcelCarregado);
  if (typeof window === "undefined") return Promise.reject(new Error("O leitor Excel só pode ser usado no navegador."));
  if (window.XLSX) {
    leitorExcelCarregado = window.XLSX;
    return Promise.resolve(leitorExcelCarregado);
  }
  if (!promessaLeitorExcel) {
    promessaLeitorExcel = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/xlsx.full.min.js?v=0.20.3";
      script.async = true;
      script.onload = () => {
        if (!window.XLSX) {
          promessaLeitorExcel = null;
          reject(new Error("O leitor Excel não iniciou corretamente. Feche e abra o aplicativo e tente novamente."));
          return;
        }
        leitorExcelCarregado = window.XLSX;
        resolve(leitorExcelCarregado);
      };
      script.onerror = () => {
        promessaLeitorExcel = null;
        reject(new Error("Não foi possível carregar o leitor Excel. Confira a conexão e tente novamente."));
      };
      document.head.appendChild(script);
    });
  }
  return promessaLeitorExcel;
}

async function carregarLeitorPdf() {
  if (leitorPdfCarregado) return leitorPdfCarregado;
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  leitorPdfCarregado = pdfjs;
  return pdfjs;
}

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

function usarAbaPersistida(clienteId) {
  const chave = `confinamento_aba_${clienteId || "geral"}`;
  const abasValidas = ["painel", "lotes-ativos", "lotes-finalizados", "cocho", "esperado", "graficos", "cargas", "mapa"];
  const [aba, setAbaState] = useState(() => {
    if (typeof window === "undefined") return "painel";
    const salva = window.localStorage.getItem(chave);
    return abasValidas.includes(salva) ? salva : "painel";
  });
  function setAba(valor) {
    setAbaState(valor);
    if (typeof window !== "undefined") window.localStorage.setItem(chave, valor);
  }
  return [aba, setAba];
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

function faixaConsumoMS(percentual) {
  if (percentual == null) return null;
  if (percentual >= 2.4) return { label: "Adequado", cor: "#247A52", fundo: "#E4F2EA" };
  if (percentual >= 2) return { label: "Atenção", cor: "#8A6500", fundo: "#FFF3CC" };
  return { label: "Baixo", cor: "#B43B32", fundo: "#FBE4E1" };
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
  cliente, lotes, pesagens = [], consumos = [], saidas = [], leiturasCocho = [], cargasVagao = [], ingredientesMs = [], currais = [], curralOcupacoes = [],
  onAdicionar, onAtualizar, onExcluir,
  onAdicionarPesagem, onExcluirPesagem,
  onAdicionarSaida, onExcluirSaida,
  onAdicionarConsumo, onAtualizarConsumo, onExcluirConsumo, onImportarConsumos,
  onRegistrarLeituraCocho, onImportarLeiturasCocho,
  onImportarCargas, onExcluirCarga, onSalvarMsIngrediente, onSincronizarCustosMs,
  onAdicionarCurral, onAtualizarCurral, onExcluirCurral, onImportarCurrais, onMoverLoteParaCurral, onAtualizarCliente,
  onBack, onGerenciarCliente,
}) {
  const [tela, setTela] = useState({ modo: "lista" });
  const [aba, setAba] = usarAbaPersistida(cliente?.id);
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
        consumos={consumos}
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

  if (tela.modo === "importar-cargas") {
    return (
      <ImportarCargasPlanilha
        cargasExistentes={cargasVagao}
        lotes={lotes}
        consumos={consumos}
        ingredientesMs={ingredientesMs}
        onCancel={() => setTela({ modo: "lista" })}
        onImportar={onImportarCargas}
        onImportarConsumos={onImportarConsumos}
        onSincronizar={onSincronizarCustosMs}
        onConcluido={() => {
          setTela({ modo: "lista" });
          setAba("cargas");
        }}
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
        cliente={cliente}
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
    <div className="confinamento-screen">
      <div style={{ marginBottom: 14 }}>
        <div style={styles.backHeaderRow}>
          {onBack ? <BackHeader title={cliente.nome} onBack={onBack} semMargem /> : <h1 style={styles.h1}>{cliente.nome}</h1>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {onGerenciarCliente && (
              <button onClick={onGerenciarCliente} style={styles.iconActionBtn} title="Cadastro e acessos do cliente" aria-label="Cadastro e acessos do cliente">
                <Settings2 size={17} />
              </button>
            )}
            {(aba === "cocho" || aba === "esperado") && onAdicionarConsumo && (
              <button onClick={() => setTela({ modo: "lancar-consumo" })} style={styles.editLinkBtn}>
                + Consumo
              </button>
            )}
            {(aba === "cocho" || aba === "esperado") && onImportarConsumos && (
              <button onClick={() => setTela({ modo: "importar-consumo" })} style={styles.secondaryActionBtn}>
                Importar
              </button>
            )}
            {aba === "cargas" && onImportarCargas && (
              <button onClick={() => setTela({ modo: "importar-cargas" })} style={styles.secondaryActionBtn}>
                Importar cargas
              </button>
            )}
            {(aba === "lotes-ativos" || aba === "lotes-finalizados") && onAdicionar && (
              <button onClick={() => setTela({ modo: "novo" })} style={styles.editLinkBtn}>
                + Novo lote
              </button>
            )}
          </div>
        </div>
        <div style={styles.contextLabel}>
          {aba === "painel" && "Resumo da operação"}
          {(aba === "lotes-ativos" || aba === "lotes-finalizados") && "Gestão dos lotes"}
          {(aba === "cocho" || aba === "esperado") && "Consumo e leitura diária"}
          {aba === "graficos" && "Indicadores e evolução"}
          {aba === "mapa" && "Localização dos currais"}
          {aba === "cargas" && "Precisão do abastecimento e matéria seca"}
        </div>
      </div>

      <div className="desktop-workspace">
        <nav style={styles.mainNav} className="main-navigation" aria-label="Áreas do confinamento">
          <NavArea icon={LayoutDashboard} label="Resumo" active={aba === "painel"} onClick={() => setAba("painel")} />
          <NavArea icon={Beef} label="Lotes" active={aba === "lotes-ativos" || aba === "lotes-finalizados"} onClick={() => setAba("lotes-ativos")} />
          <NavArea icon={ClipboardList} label="Rotina" active={aba === "cocho" || aba === "esperado"} onClick={() => setAba(onRegistrarLeituraCocho ? "cocho" : "esperado")} />
          <NavArea icon={BarChart3} label="Análises" active={aba === "graficos"} onClick={() => setAba("graficos")} />
          <NavArea icon={Truck} label="Cargas" active={aba === "cargas"} onClick={() => setAba("cargas")} />
          <NavArea icon={MapIcon} label="Mapa" active={aba === "mapa"} onClick={() => setAba("mapa")} />
        </nav>

        <main className="desktop-main-content">
          {(aba === "lotes-ativos" || aba === "lotes-finalizados") && (
            <SubNav
              options={[
                { value: "lotes-ativos", label: `Ativos (${ativos.length})` },
                { value: "lotes-finalizados", label: `Finalizados (${finalizados.length})` },
              ]}
              value={aba}
              onChange={setAba}
            />
          )}

          {(aba === "cocho" || aba === "esperado") && (
            <SubNav
              options={[
                ...(onRegistrarLeituraCocho ? [{ value: "cocho", label: "Leitura de cocho" }] : []),
                { value: "esperado", label: "Consumo esperado" },
              ]}
              value={aba}
              onChange={setAba}
            />
          )}

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
      ) : aba === "cargas" ? (
        <AbaCargas
          cargas={cargasVagao}
          ingredientesMs={ingredientesMs}
          lotes={lotes}
          consumos={consumos}
          onSalvarMs={onSalvarMsIngrediente}
          onSincronizar={onSincronizarCustosMs}
          onImportar={onImportarCargas && (() => setTela({ modo: "importar-cargas" }))}
          onExcluirCarga={onExcluirCarga}
        />
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
          <div className="desktop-lotes-grid">
          {ativos.map((item, index) => {
            const {
              lote, diasConfinamento, gmdAcumulado, pesoEsperadoHoje,
              consumoMS, consumoMSPercentualPV, consumoMSPercentualPVMedio,
              custoAcumuladoAnimal, custoMedioDiarioAnimal, cabecasRestantes, cabecasSaidas, dataProvavelAbate,
            } = item;
            const faixaMSUltimo = faixaConsumoMS(consumoMSPercentualPV);
            const faixaMSMedio = faixaConsumoMS(consumoMSPercentualPVMedio);
            return (
              <div key={lote.id} style={styles.listItem} className="desktop-lote-card">
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
                    {consumoMS != null && (
                      <div style={{ fontSize: 11.5, color: "#1F4D45", fontWeight: 600, marginTop: 3 }}>
                        MS {consumoMS.toFixed(2)} kg/cab/dia
                      </div>
                    )}
                    {(faixaMSUltimo || faixaMSMedio) && (
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, flexWrap: "wrap" }}>
                        {faixaMSUltimo && (
                          <span style={{ ...styles.msStatusPill, color: faixaMSUltimo.cor, background: faixaMSUltimo.fundo }}>
                            <span style={{ ...styles.msStatusDot, background: faixaMSUltimo.cor }} />
                            Último {consumoMSPercentualPV.toFixed(2)}%
                          </span>
                        )}
                        {faixaMSMedio && (
                          <span style={{ ...styles.msStatusPill, color: faixaMSMedio.cor, background: faixaMSMedio.fundo }}>
                            <span style={{ ...styles.msStatusDot, background: faixaMSMedio.cor }} />
                            Média {consumoMSPercentualPVMedio.toFixed(2)}%
                          </span>
                        )}
                      </div>
                    )}
                    {custoAcumuladoAnimal != null && (
                      <div style={{ fontSize: 11.5, color: "#A85A2A", marginTop: 2 }}>
                        Custo acum. {formatBRL(custoAcumuladoAnimal)}/animal
                      </div>
                    )}
                    {custoMedioDiarioAnimal != null && (
                      <div style={{ fontSize: 11.5, color: "#A85A2A", marginTop: 2 }}>
                        Diária média {formatBRL(custoMedioDiarioAnimal)}/animal
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
          </div>
        </>
      ) : aba === "lotes-finalizados" ? (
        <>
          <SectionTitle>Lotes finalizados</SectionTitle>
          {finalizados.length === 0 && <EmptyHint text="Nenhum lote finalizado ainda." />}
          <div className="desktop-lotes-grid">
          {finalizados.map((item) => {
            const { lote, diasConfinamento, gmdVivoEntradaSaida, consumoMS, consumoMSPercentualPVMedio } = item;
            const fechamento = calcularFechamentoCusto(lote, item, saidasPorLote[lote.id] || []);
            return (
            <button key={lote.id} style={styles.listItem} className="desktop-lote-card" onClick={() => setTela({ modo: "lote", id: lote.id })}>
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
                {consumoMS != null && (
                  <div style={{ fontSize: 11.5, color: "#1F4D45", marginTop: 2 }}>
                    MS {consumoMS.toFixed(2)} kg/cab/dia
                  </div>
                )}
                {consumoMSPercentualPVMedio != null && (
                  <div style={{ fontSize: 11.5, color: faixaConsumoMS(consumoMSPercentualPVMedio)?.cor || "#5C5C58", marginTop: 2 }}>
                    MS média {consumoMSPercentualPVMedio.toFixed(2)}% do PV
                  </div>
                )}
                {fechamento.custoDiarioMedioTotal != null && (
                  <div style={{ fontSize: 11.5, color: "#A85A2A", marginTop: 2 }}>
                    Custo diário médio {formatBRL(fechamento.custoDiarioMedioTotal)}/cab
                  </div>
                )}
                {fechamento.gmc != null && <div style={{ fontSize: 11.5, color: "#5C5C58", marginTop: 2 }}>GMC {fechamento.gmc.toFixed(3)} kg/dia</div>}
                {fechamento.resultadoPorCabeca != null && <div style={{ fontSize: 11.5, color: fechamento.resultadoPorCabeca >= 0 ? "#247A52" : "#B34F42", marginTop: 2 }}>Lucro {formatBRL(fechamento.resultadoPorCabeca)}/animal</div>}
              </div>
            </button>
          );})}
          </div>
        </>
      ) : (
        <>
          <SectionTitle>Painel</SectionTitle>
          <div style={styles.gestaoGrid} className="desktop-summary-grid">
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
              label="Consumo médio de MS (ativos)"
              valor={painel.consumoMSMedioAtivos != null ? `${painel.consumoMSMedioAtivos.toFixed(2)} kg/cab/dia` : "—"}
            />
            <PainelCard
              label="MS sobre PV — último lançamento"
              valor={painel.consumoMSPercentualPVMedioAtivos != null ? `${painel.consumoMSPercentualPVMedioAtivos.toFixed(2)}% do PV` : "—"}
              faixa={faixaConsumoMS(painel.consumoMSPercentualPVMedioAtivos)}
            />
            <PainelCard
              label="MS média histórica sobre PV"
              valor={painel.consumoMSPercentualPVHistoricoAtivos != null ? `${painel.consumoMSPercentualPVHistoricoAtivos.toFixed(2)}% do PV` : "—"}
              faixa={faixaConsumoMS(painel.consumoMSPercentualPVHistoricoAtivos)}
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
        </main>
      </div>
    </div>
  );
}

function NavArea({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick} className="main-navigation-button" style={{ ...styles.mainNavBtn, ...(active ? styles.mainNavBtnActive : {}) }}>
      <Icon size={18} strokeWidth={active ? 2.4 : 1.9} />
      <span>{label}</span>
    </button>
  );
}

function SubNav({ options, value, onChange }) {
  return (
    <div style={styles.subNav}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          style={{ ...styles.subNavBtn, ...(value === option.value ? styles.subNavBtnActive : {}) }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function PainelCard({ label, valor, faixa }) {
  return (
    <div style={{ ...styles.gestaoCard, ...(faixa ? { borderColor: faixa.cor } : {}) }}>
      <div style={styles.gestaoCardHeader}>
        <span>{label}</span>
      </div>
      <div style={styles.gestaoCardValor}>{valor}</div>
      {faixa && (
        <div style={{ ...styles.msStatusPill, color: faixa.cor, background: faixa.fundo, marginTop: 7 }}>
          <span style={{ ...styles.msStatusDot, background: faixa.cor }} />
          {faixa.label}
        </div>
      )}
    </div>
  );
}

function LoteDetalhe({
  cliente, lote, indicadores, saidas = [], evolucao, evolucaoConsumo,
  onBack, onEditar,
  onNovaPesagem, onExcluirPesagem,
  onNovaSaida, onExcluirSaida,
  onNovoConsumo, onEditarConsumo, onExcluirConsumo,
}) {
  const saidasOrdenadas = [...saidas].sort((a, b) => b.data.localeCompare(a.data));
  const fechamento = indicadores.status === "Finalizado" ? calcularFechamentoCusto(lote, indicadores, saidas) : null;
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
            {indicadores.consumoMSPercentualPVMedio != null && (
              <Field
                label="Consumo médio de MS em relação ao peso vivo"
                value={`${indicadores.consumoMSPercentualPVMedio.toFixed(2)}% do PV`}
              />
            )}
            {lote.rendimento_carcaca != null && (
              <Field label="Rendimento de carcaça" value={`${lote.rendimento_carcaca}%`} />
            )}
            {fechamento?.gmc != null && <Field label="GMC (ganho médio de carcaça)" value={`${fechamento.gmc.toFixed(3)} kg/cab/dia`} />}
            {lote.preco_venda_arroba != null && <Field label="Preço de venda da arroba" value={formatBRL(lote.preco_venda_arroba)} />}
            {lote.custo_operacional != null && (
              <Field label="Custo operacional" value={`${formatBRL(lote.custo_operacional)}/cab/dia`} />
            )}
            {fechamento?.custoDiarioMedioTotal != null && <Field label="Custo diário médio total" value={`${formatBRL(fechamento.custoDiarioMedioTotal)}/cab/dia`} />}
          </>
        )}
        {lote.observacoes && <Field label="Observações" value={lote.observacoes} multiline />}
      </div>

      {indicadores.status === "Finalizado" && (
        <FechamentoCustoCard cliente={cliente} lote={lote} indicadores={indicadores} saidas={saidas} />
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

function GraficoLinha({
  pontos, valueKey, unidade = "", cor = "#1F4D45", tendencia = false, id,
  gradeDetalhada = false, consultaPorDia = false,
}) {
  const largura = 320;
  const altura = gradeDetalhada ? 170 : 120;
  const paddingEsquerda = 34;
  const paddingDireita = 10;
  const paddingY = 16;
  const [dataConsultada, setDataConsultada] = useState(pontos[pontos.length - 1]?.data || "");

  const valores = pontos.map((p) => p[valueKey]);
  const menorValor = Math.min(...valores);
  const maiorValor = Math.max(...valores);
  let min = menorValor;
  let max = maiorValor;
  let marcasEixo = [];
  if (gradeDetalhada) {
    const amplitude = maiorValor - menorValor;
    const passo = amplitude <= 0.8 ? 0.1 : amplitude <= 1.6 ? 0.2 : amplitude <= 3 ? 0.5 : 1;
    min = Math.floor(menorValor / passo) * passo;
    max = Math.ceil(maiorValor / passo) * passo;
    if (max === min) max = min + passo;
    for (let valor = max; valor >= min - passo / 10; valor -= passo) {
      marcasEixo.push(Number(valor.toFixed(3)));
    }
  } else {
    marcasEixo = [max, (min + max) / 2, min];
  }
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
  const formatEixo = (v) => `${Number.isInteger(v) ? v : v.toFixed(gradeDetalhada ? 2 : 1)} ${unidade}`;
  const yDe = (valor) => altura - paddingY - ((valor - min) / span) * (altura - paddingY * 2);
  const pontoConsultado = pontos.find((p) => p.data === dataConsultada) || pontos[pontos.length - 1];

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
        {marcasEixo.map((marca) => {
          const y = yDe(marca);
          return (
            <g key={marca}>
              <line x1={paddingEsquerda} y1={y} x2={largura - paddingDireita} y2={y} stroke="#E8E6DF" strokeWidth="1" />
              <text x={0} y={y + 3} fontSize="8.5" fill="#8F8D84">{formatEixo(marca)}</text>
            </g>
          );
        })}
        {gradeDetalhada && [2, 2.4].map((limite) => (
          limite >= min && limite <= max ? (
            <line
              key={`limite-${limite}`}
              x1={paddingEsquerda}
              y1={yDe(limite)}
              x2={largura - paddingDireita}
              y2={yDe(limite)}
              stroke={limite === 2.4 ? "#247A52" : "#B43B32"}
              strokeWidth="1.2"
              strokeDasharray="3 3"
              opacity="0.8"
            />
          ) : null
        ))}
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
      {consultaPorDia && pontoConsultado && (
        <label style={styles.chartDayPicker}>
          <span style={{ fontSize: 11.5, color: "#7A7A75" }}>Consultar dia</span>
          <select
            value={pontoConsultado.data}
            onChange={(e) => setDataConsultada(e.target.value)}
            style={styles.chartDaySelect}
          >
            {[...pontos].reverse().map((ponto) => (
              <option key={ponto.data} value={ponto.data}>
                {formatDataBR(ponto.data)} — {Number(ponto[valueKey]).toFixed(2)}{unidade}
              </option>
            ))}
          </select>
          <strong style={{ color: faixaConsumoMS(pontoConsultado[valueKey])?.cor || cor }}>
            {Number(pontoConsultado[valueKey]).toFixed(2)}{unidade}
          </strong>
        </label>
      )}
    </div>
  );
}

function FechamentoCustoCard({ cliente, lote, indicadores, saidas }) {
  const f = calcularFechamentoCusto(lote, indicadores, saidas);
  const [exportando, setExportando] = useState(false);
  const semDados =
    f.valorCompraTotal == null && f.custoAlimentarTotal == null && f.receitaTotal == null && f.custoOperacionalTotal == null;
  if (semDados) return null;

  const resultadoPositivo = f.resultadoPorCabeca == null || f.resultadoPorCabeca >= 0;

  return (
    <section className="resultado-lote">
      <div className="resultado-lote-header">
        <div><span>RELATÓRIO FINAL DO LOTE</span><h2>Resultado zootécnico e econômico</h2><p>Indicadores consolidados do período de confinamento.</p></div>
        <button
          onClick={async () => {
            setExportando(true);
            try { await exportarResultadoLotePDF(cliente, lote, indicadores, saidas); }
            finally { setExportando(false); }
          }}
          disabled={exportando}
          className="resultado-pdf-btn"
        ><Download size={15} /> {exportando ? "Gerando..." : "Exportar resultado em PDF"}</button>
      </div>
      <div className="resultado-destaques">
        <ResultadoDestaque label="Lucro por animal" value={f.resultadoPorCabeca != null ? formatBRL(f.resultadoPorCabeca) : "—"} tom={resultadoPositivo ? "verde" : "vermelho"} detalhe={f.resultadoTotal != null ? `${formatBRL(f.resultadoTotal)} no lote` : "Resultado total indisponível"} />
        <ResultadoDestaque label="Margem mensal" value={f.margemMensalPercentual != null ? `${f.margemMensalPercentual.toFixed(2)}%` : "—"} tom={resultadoPositivo ? "verde" : "vermelho"} detalhe="Retorno sobre o custo a cada 30 dias" />
        <ResultadoDestaque label="GMC" value={f.gmc != null ? `${f.gmc.toFixed(3)} kg` : "—"} tom="azul" detalhe="Ganho de carcaça por cabeça/dia" />
        <ResultadoDestaque label="MS média / peso vivo" value={indicadores.consumoMSPercentualPVMedio != null ? `${indicadores.consumoMSPercentualPVMedio.toFixed(2)}%` : "—"} tom="laranja" detalhe="Média do período" />
      </div>
      <div className="resultado-blocos">
        <ResultadoBloco titulo="Desempenho do lote" cor="#3B7C70">
          <ResultadoLinha label="Período confinado" value={`${indicadores.diasConfinamento || 0} dias`} />
          <ResultadoLinha label="GMD vivo" value={indicadores.gmdVivoEntradaSaida != null ? `${indicadores.gmdVivoEntradaSaida.toFixed(3)} kg/cab/dia` : "—"} />
          <ResultadoLinha label="GMC de carcaça" value={f.gmc != null ? `${f.gmc.toFixed(3)} kg/cab/dia` : "—"} />
          <ResultadoLinha label="Arrobas produzidas com rendimento" value={f.arrobasProduzidas != null ? `${f.arrobasProduzidas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} @` : "—"} />
        </ResultadoBloco>
        <ResultadoBloco titulo="Custo de produção" cor="#C47A3D">
          <ResultadoLinha label="Alimentação" value={f.custoAlimentarTotal != null ? formatBRL(f.custoAlimentarTotal) : "—"} />
          <ResultadoLinha label="Operacional" value={f.custoOperacionalTotal != null ? formatBRL(f.custoOperacionalTotal) : "—"} />
          <ResultadoLinha label="Custo diário médio" value={f.custoDiarioMedioTotal != null ? `${formatBRL(f.custoDiarioMedioTotal)}/cab` : "—"} />
          <ResultadoLinha label="Custo da @ produzida - vivo" value={f.custoArrobaProduzidaVivo != null ? formatBRL(f.custoArrobaProduzidaVivo) : "—"} />
          <ResultadoLinha label="Custo da @ produzida - rendimento" value={f.custoArrobaProduzidaRendimento != null ? formatBRL(f.custoArrobaProduzidaRendimento) : "—"} />
        </ResultadoBloco>
        <ResultadoBloco titulo="Resultado financeiro" cor={resultadoPositivo ? "#2E8060" : "#B34F42"}>
          <ResultadoLinha label="Valor de compra" value={f.valorCompraTotal != null ? formatBRL(f.valorCompraTotal) : "—"} />
          <ResultadoLinha label="Custo total" value={f.custoTotalGeral != null ? formatBRL(f.custoTotalGeral) : "—"} />
          <ResultadoLinha label="Receita de venda" value={f.receitaTotal != null ? formatBRL(f.receitaTotal) : "—"} />
          <ResultadoLinha label="Lucro total" value={f.resultadoTotal != null ? formatBRL(f.resultadoTotal) : "—"} forte cor={resultadoPositivo ? "#247A52" : "#B34F42"} />
          <ResultadoLinha label="Lucro por animal" value={f.resultadoPorCabeca != null ? formatBRL(f.resultadoPorCabeca) : "—"} forte cor={resultadoPositivo ? "#247A52" : "#B34F42"} />
        </ResultadoBloco>
      </div>
      <div className="resultado-nota">A margem mensal representa o retorno sobre o custo total, proporcionalizado para períodos de 30 dias.</div>
    </section>
  );
}

function ResultadoDestaque({ label, value, detalhe, tom }) {
  return <div className={`resultado-destaque ${tom}`}><span>{label}</span><strong>{value}</strong><small>{detalhe}</small></div>;
}

function ResultadoBloco({ titulo, cor, children }) {
  return <div className="resultado-bloco" style={{ "--resultado-cor": cor }}><h3>{titulo}</h3>{children}</div>;
}

function ResultadoLinha({ label, value, forte = false, cor }) {
  return <div className="resultado-linha"><span>{label}</span><strong style={{ color: cor || undefined, fontSize: forte ? 13.5 : undefined }}>{value}</strong></div>;
}

export async function exportarResultadoLotePDF(cliente, lote, indicadores, saidas) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const f = calcularFechamentoCusto(lote, indicadores, saidas);
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const margem = 40;
  const verde = [31, 77, 69];
  const verdeClaro = [231, 242, 238];
  const laranja = [196, 122, 61];
  const cinza = [92, 92, 88];
  const cinzaClaro = [246, 245, 241];
  const resultadoPositivo = f.resultadoPorCabeca == null || f.resultadoPorCabeca >= 0;

  doc.setFillColor(...verde);
  doc.roundedRect(0, 0, largura, 116, 0, 0, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("RASTRO CONFINAMENTO", margem, 31);
  doc.setFontSize(22);
  doc.text("Resultado final do lote", margem, 62);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(205, 226, 220);
  doc.text(`${cliente?.nome || "Cliente"}  |  ${lote.nome}`, margem, 82);
  doc.text(`Período: ${formatDataBR(lote.data_entrada)} a ${formatDataBR(lote.data_saida)}  |  ${lote.num_cabecas} cabeças`, margem, 99);

  let y = 140;
  const cardGap = 8;
  const cardLargura = (largura - margem * 2 - cardGap * 3) / 4;
  const destaques = [
    ["Lucro por animal", f.resultadoPorCabeca != null ? formatBRL(f.resultadoPorCabeca) : "-", resultadoPositivo ? verdeClaro : [250, 232, 229], resultadoPositivo ? verde : [179, 79, 66]],
    ["Margem mensal", f.margemMensalPercentual != null ? `${f.margemMensalPercentual.toFixed(2)}%` : "-", verdeClaro, verde],
    ["GMC", f.gmc != null ? `${f.gmc.toFixed(3)} kg/d` : "-", [232, 240, 247], [54, 103, 139]],
    ["MS média / PV", indicadores.consumoMSPercentualPVMedio != null ? `${indicadores.consumoMSPercentualPVMedio.toFixed(2)}%` : "-", [252, 239, 227], laranja],
  ];
  destaques.forEach(([label, valor, fundo, cor], i) => {
    const x = margem + i * (cardLargura + cardGap);
    doc.setFillColor(...fundo);
    doc.roundedRect(x, y, cardLargura, 67, 7, 7, "F");
    doc.setTextColor(...cinza);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(label, x + 10, y + 17);
    doc.setTextColor(...cor);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(String(valor), x + 10, y + 40, { maxWidth: cardLargura - 18 });
  });
  y += 88;

  function secao(titulo, linhas, cor) {
    doc.setFillColor(...cinzaClaro);
    doc.roundedRect(margem, y, largura - margem * 2, 27 + linhas.length * 24, 8, 8, "F");
    doc.setFillColor(...cor);
    doc.roundedRect(margem, y, 5, 27 + linhas.length * 24, 3, 3, "F");
    doc.setTextColor(...cor);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(titulo, margem + 16, y + 19);
    let linhaY = y + 39;
    linhas.forEach(([label, valor, destaque]) => {
      doc.setDrawColor(226, 225, 219);
      doc.line(margem + 16, linhaY + 7, largura - margem - 14, linhaY + 7);
      doc.setTextColor(...cinza);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(label, margem + 16, linhaY);
      doc.setTextColor(...(destaque || [45, 62, 57]));
      doc.setFont("helvetica", "bold");
      doc.text(String(valor), largura - margem - 16, linhaY, { align: "right" });
      linhaY += 24;
    });
    y += 39 + linhas.length * 24;
  }

  secao("Desempenho zootécnico", [
    ["Dias de confinamento", `${indicadores.diasConfinamento || 0} dias`],
    ["GMD vivo", indicadores.gmdVivoEntradaSaida != null ? `${indicadores.gmdVivoEntradaSaida.toFixed(3)} kg/cab/dia` : "-"],
    ["GMC de carcaça", f.gmc != null ? `${f.gmc.toFixed(3)} kg/cab/dia` : "-"],
    ["Consumo médio de MS / peso vivo", indicadores.consumoMSPercentualPVMedio != null ? `${indicadores.consumoMSPercentualPVMedio.toFixed(2)}% do PV` : "-"],
    ["Arrobas produzidas com rendimento", f.arrobasProduzidas != null ? `${f.arrobasProduzidas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} @` : "-"],
  ], verde);

  secao("Custos de produção", [
    ["Custo de alimentação", f.custoAlimentarTotal != null ? formatBRL(f.custoAlimentarTotal) : "-"],
    ["Custo operacional", f.custoOperacionalTotal != null ? formatBRL(f.custoOperacionalTotal) : "-"],
    ["Custo diário médio total", f.custoDiarioMedioTotal != null ? `${formatBRL(f.custoDiarioMedioTotal)}/cab/dia` : "-"],
    ["Custo da @ produzida - peso vivo", f.custoArrobaProduzidaVivo != null ? formatBRL(f.custoArrobaProduzidaVivo) : "-"],
    ["Custo da @ produzida - com rendimento", f.custoArrobaProduzidaRendimento != null ? formatBRL(f.custoArrobaProduzidaRendimento) : "-"],
  ], laranja);

  const corResultado = resultadoPositivo ? verde : [179, 79, 66];
  secao("Resultado econômico", [
    ["Valor de compra", f.valorCompraTotal != null ? formatBRL(f.valorCompraTotal) : "-"],
    ["Custo total", f.custoTotalGeral != null ? formatBRL(f.custoTotalGeral) : "-"],
    ["Receita de venda", f.receitaTotal != null ? formatBRL(f.receitaTotal) : "-"],
    ["Lucro total", f.resultadoTotal != null ? formatBRL(f.resultadoTotal) : "-", corResultado],
    ["Lucro por animal", f.resultadoPorCabeca != null ? formatBRL(f.resultadoPorCabeca) : "-", corResultado],
    ["Margem mensal sobre o custo", f.margemMensalPercentual != null ? `${f.margemMensalPercentual.toFixed(2)}% ao mês` : "-", corResultado],
  ], corResultado);

  doc.setDrawColor(220, 219, 213);
  doc.line(margem, altura - 46, largura - margem, altura - 46);
  doc.setTextColor(130, 130, 125);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("Margem mensal: retorno sobre o custo total proporcionalizado para 30 dias.", margem, altura - 29);
  doc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR")} - Rastro Confinamento`, largura - margem, altura - 29, { align: "right" });

  const nomeSeguro = String(lote.nome || "lote").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  doc.save(`resultado-${nomeSeguro || "lote"}.pdf`);
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
          label="Custo operacional (R$/cab/dia)"
          type="number"
          value={custoOperacional}
          onChange={setCustoOperacional}
          placeholder="Ex: 0.50"
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
          label="Custo operacional (R$/cab/dia)"
          type="number"
          value={custoOperacional}
          onChange={setCustoOperacional}
          placeholder="Ex: 0.50"
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
  const [custoKgMn, setCustoKgMn] = useState(
    consumo?.custo_kg_mn != null ? String(consumo.custo_kg_mn)
      : consumo?.dieta_fase ? (custoKgMnDaFase(lote, consumo.dieta_fase) != null ? String(custoKgMnDaFase(lote, consumo.dieta_fase)) : "")
      : ""
  );
  const [tipoCusto, setTipoCusto] = useState("mn");
  const [salvando, setSalvando] = useState(false);
  const valido = data && consumoTotalLote !== "";
  const cabecasNaData = calcularCabecasNaData(lote, saidas, data);
  const consumoMSPreview =
    consumoTotalLote !== "" && msDieta !== "" && cabecasNaData > 0
      ? (Number(consumoTotalLote) * (Number(msDieta) / 100)) / cabecasNaData
      : null;
  const custoDigitado = custoKgMn !== "" ? Number(custoKgMn) : null;
  let custoMnEfetivo = custoDigitado;
  if (tipoCusto === "ms" && custoDigitado != null && msDieta !== "") {
    custoMnEfetivo = custoDigitado * (Number(msDieta) / 100);
  }
  const custoDiarioPreview =
    consumoTotalLote !== "" && custoMnEfetivo != null && cabecasNaData > 0
      ? (Number(consumoTotalLote) / cabecasNaData) * custoMnEfetivo
      : null;

  function selecionarFase(fase) {
    setDietaFase(fase);
    const ms = msDaFase(cliente, fase);
    if (ms != null) setMsDieta(String(ms));
    const custo = custoKgMnDaFase(lote, fase);
    if (custo != null) setCustoKgMn(String(custo));
  }

  async function handleSave() {
    setSalvando(true);
    try {
      await onSave({
        data,
        consumo_total_lote: Number(consumoTotalLote),
        ms_dieta: msDieta !== "" ? Number(msDieta) : null,
        dieta_fase: dietaFase,
        custo_kg_mn: custoMnEfetivo,
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
        <div style={{ padding: "10px 0 4px" }}>
          <div style={styles.fieldLabel}>Custo informado em</div>
          <div style={{ ...styles.viewToggle, marginTop: 6, maxWidth: 220 }}>
            <button
              onClick={() => setTipoCusto("mn")}
              style={{ ...styles.viewToggleBtn, ...(tipoCusto === "mn" ? styles.viewToggleBtnActive : {}), flex: 1, justifyContent: "center", fontSize: 12.5 }}
            >
              R$/kg MN
            </button>
            <button
              onClick={() => setTipoCusto("ms")}
              style={{ ...styles.viewToggleBtn, ...(tipoCusto === "ms" ? styles.viewToggleBtnActive : {}), flex: 1, justifyContent: "center", fontSize: 12.5 }}
            >
              R$/kg MS
            </button>
          </div>
        </div>
        <InputField label={`Custo do kg de ${tipoCusto === "mn" ? "MN" : "MS"} (R$)`} type="number" value={custoKgMn} onChange={setCustoKgMn} placeholder="Ex: 0.35" />
        <Field
          label="Consumo de MS por cabeça (calculado)"
          value={consumoMSPreview != null ? `${consumoMSPreview.toFixed(2)} kg/dia` : "Preencha consumo e MS"}
          highlight={consumoMSPreview != null}
        />
        <Field
          label="Custo diário por animal (calculado)"
          value={
            custoMnEfetivo == null
              ? "Preencha o custo do kg"
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

function preencherComUltimoConsumo(lotesAtivos, consumos, dataRef) {
  const resultado = {};
  for (const lote of lotesAtivos) {
    const consumosLote = consumos
      .filter((c) => c.lote_id === lote.id && c.data < dataRef)
      .sort((a, b) => b.data.localeCompare(a.data));
    const ultimo = consumosLote[0];
    const custoPorFase = {};
    for (const fase of ["adaptacao", "recria", "crescimento", "terminacao"]) {
      const custoLote = custoKgMnDaFase(lote, fase);
      const ultimoDaFase = consumosLote.find((c) => c.dieta_fase === fase);
      custoPorFase[fase] = ultimoDaFase?.custo_kg_mn != null ? String(ultimoDaFase.custo_kg_mn)
        : custoLote != null ? String(custoLote) : "";
    }
    resultado[lote.id] = {
      consumo: "",
      ms: ultimo?.ms_dieta != null ? String(ultimo.ms_dieta) : "",
      fase: ultimo?.dieta_fase || "",
      custos: custoPorFase,
    };
  }
  return resultado;
}

// Lançamento do consumo do dia para todos os lotes ativos de uma vez —
// uma data só, um cartão por lote (só quem tiver o consumo preenchido é
// salvo).
function FormConsumoEmMassa({ lotesAtivos, saidasPorLote = {}, cliente, onCancel, onSalvarLote, onConcluido, consumos = [] }) {
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [valores, setValores] = useState(() => preencherComUltimoConsumo(lotesAtivos, consumos, new Date().toISOString().slice(0, 10)));
  const [faseGlobal, setFaseGlobal] = useState(null);
  const [msGlobal, setMsGlobal] = useState("");
  const [custosGlobais, setCustosGlobais] = useState({ adaptacao: "", recria: "", crescimento: "", terminacao: "" });
  const [tipoCusto, setTipoCusto] = useState("mn");
  const [salvando, setSalvando] = useState(false);
  const [ordenacao, setOrdenacao] = usarOrdenacaoPersistida(cliente?.id);

  function handleDataChange(novaData) {
    setData(novaData);
    setValores((prev) => {
      const preenchido = preencherComUltimoConsumo(lotesAtivos, consumos, novaData);
      const novo = {};
      for (const lote of lotesAtivos) {
        const anterior = prev[lote.id] || {};
        const auto = preenchido[lote.id] || {};
        novo[lote.id] = {
          consumo: anterior.consumo || "",
          ms: anterior.ms || auto.ms || "",
          fase: anterior.fase || auto.fase || "",
          custos: anterior.custos || auto.custos || {},
        };
      }
      return novo;
    });
  }

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

  function aplicarCustoGlobalDaFase(fase, valor) {
    setCustosGlobais((cg) => ({ ...cg, [fase]: valor }));
    setValores((v) => {
      const novo = { ...v };
      for (const lote of lotesAtivos) {
        const custos = { ...(novo[lote.id]?.custos || {}) };
        custos[fase] = valor;
        novo[lote.id] = { ...novo[lote.id], custos };
      }
      return novo;
    });
  }

  function selecionarFase(loteId, fase) {
    const ms = msDaFase(cliente, fase);
    setValores((v) => ({
      ...v,
      [loteId]: {
        ...v[loteId],
        fase,
        ms: ms != null ? String(ms) : v[loteId]?.ms,
      },
    }));
  }

  function aplicarFaseATodos(fase) {
    setFaseGlobal(fase);
    const ms = msDaFase(cliente, fase);
    if (ms != null) setMsGlobal(String(ms));
    setValores((v) => {
      const novo = { ...v };
      for (const lote of lotesAtivos) {
        novo[lote.id] = {
          ...novo[lote.id],
          fase,
          ms: ms != null ? String(ms) : novo[lote.id]?.ms,
        };
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
        const { consumo, ms, fase, custos = {} } = valores[lote.id];
        const custoDigitado = fase && custos[fase] ? Number(custos[fase]) : null;
        let custoMn = custoDigitado;
        if (tipoCusto === "ms" && custoMn != null && ms) {
          custoMn = custoMn * (Number(ms) / 100);
        }
        await onSalvarLote(lote.id, {
          data,
          consumo_total_lote: Number(consumo),
          ms_dieta: ms ? Number(ms) : null,
          dieta_fase: fase || null,
          custo_kg_mn: custoMn,
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
        <InputField label="Data *" type="date" value={data} onChange={handleDataChange} />
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
        <div style={{ padding: "10px 0 4px" }}>
          <div style={styles.fieldLabel}>Custo informado em</div>
          <div style={{ ...styles.viewToggle, marginTop: 6, maxWidth: 220 }}>
            <button
              onClick={() => setTipoCusto("mn")}
              style={{ ...styles.viewToggleBtn, ...(tipoCusto === "mn" ? styles.viewToggleBtnActive : {}), flex: 1, justifyContent: "center", fontSize: 12.5 }}
            >
              R$/kg MN
            </button>
            <button
              onClick={() => setTipoCusto("ms")}
              style={{ ...styles.viewToggleBtn, ...(tipoCusto === "ms" ? styles.viewToggleBtnActive : {}), flex: 1, justifyContent: "center", fontSize: 12.5 }}
            >
              R$/kg MS
            </button>
          </div>
        </div>
        <div style={styles.fieldLabel}>Custo por dieta (R$/kg {tipoCusto === "mn" ? "MN" : "MS"}) — aplica a todos</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
          {FASES_DIETA.map((f) => (
            <InputField
              key={f.value}
              label={f.label}
              type="number"
              value={custosGlobais[f.value] || ""}
              onChange={(v) => aplicarCustoGlobalDaFase(f.value, v)}
              placeholder="0.00"
            />
          ))}
        </div>
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
        const custoFaseAtual = (valorLote.custos || {})[valorLote.fase] || "";
        let custoMnLote = custoFaseAtual ? Number(custoFaseAtual) : null;
        if (tipoCusto === "ms" && custoMnLote != null && valorLote.ms) {
          custoMnLote = custoMnLote * (Number(valorLote.ms) / 100);
        }
        const previewCusto =
          valorLote.consumo && custoMnLote != null && cabecasNaData > 0
            ? (Number(valorLote.consumo) / cabecasNaData) * custoMnLote
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
            <div style={{ padding: "4px 0 0" }}>
              <div style={styles.fieldLabel}>Custo por dieta (R$/kg {tipoCusto === "mn" ? "MN" : "MS"})</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                {FASES_DIETA.map((f) => (
                  <InputField
                    key={f.value}
                    label={f.label}
                    type="number"
                    value={(valorLote.custos || {})[f.value] || ""}
                    onChange={(v) => {
                      const novos = { ...(valorLote.custos || {}) };
                      novos[f.value] = v;
                      setCampo(lote.id, "custos", novos);
                    }}
                    placeholder="0.00"
                  />
                ))}
              </div>
            </div>
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
  const textoAlvo = normalizarTexto(valor);
  if (!textoAlvo) return null;
  // Nome exato bate primeiro ("Boi 1" só reconhece o lote "Boi 1") — o
  // número só entra como último recurso (ex: planilha só tem "3", lote se
  // chama "Lote 3"), e apenas se for o único lote com aquele número, senão
  // "1" poderia casar tanto com "Boi 1" quanto com "C1" e misturar os dois.
  const porTexto = lotes.find((l) => normalizarTexto(l.nome) === textoAlvo);
  if (porTexto) return porTexto;
  const numeroAlvo = extrairNumero(valor);
  if (numeroAlvo == null) return null;
  const porNumero = lotes.filter((l) => extrairNumero(l.nome) === numeroAlvo);
  return porNumero.length === 1 ? porNumero[0] : null;
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

// Identificadores de receita/autônomo podem mudar de representação ao passar
// pelo Excel: 4, "04", "'4", "4.0" e "4,0" devem apontar para o mesmo ID.
function normalizarCodigoPlanilha(valor) {
  let texto = String(valor ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .replace(/^['"`´’]+/, "")
    .trim();
  if (!texto) return "";
  const numero = texto.replace(",", ".");
  if (/^[+-]?\d+(?:\.0+)?$/.test(numero)) return String(Number(numero));
  return texto;
}

function encontrarLinhaCabecalho(linhas, camposObrigatorios) {
  return linhas.findIndex((linha) => {
    const campos = (linha || []).map((valor) => normalizarCabecalho(valor).replace(/\s+/g, ""));
    return camposObrigatorios.every((campo) => campos.includes(campo));
  });
}

function encontrarLoteDescarga(valor, lotes) {
  const textoAlvo = normalizarTexto(valor);
  if (!textoAlvo) return null;
  const porTexto = lotes.find((l) => normalizarTexto(l.nome) === textoAlvo);
  if (porTexto) return porTexto;

  // No arquivo bruto, códigos como "3B" podem representar outro curral e
  // não devem cair acidentalmente no "Lote 3". Já zeros à esquerda ("08")
  // são apenas outra escrita para o mesmo número.
  if (!/^\d+$/.test(textoAlvo)) return null;
  const numeroAlvo = String(Number(textoAlvo));
  const porNumero = lotes.filter((l) => {
    const numero = extrairNumero(l.nome);
    return numero != null && String(Number(numero)) === numeroAlvo;
  });
  return porNumero.length === 1 ? porNumero[0] : null;
}

function adicionarAoGrupo(grupos, lote, data, valor, fase, ms) {
  const chave = `${lote.id}|${data}`;
  if (grupos.has(chave)) {
    const grupo = grupos.get(chave);
    grupo.consumoTotalLote += valor;
    grupo.linhas += 1;
    if (grupo.fase == null) grupo.fase = fase;
    if (grupo.ms == null) grupo.ms = ms;
    return true;
  }
  grupos.set(chave, {
    loteId: lote.id,
    loteNome: lote.nome,
    data,
    consumoTotalLote: valor,
    fase,
    ms,
    linhas: 1,
  });
  return false;
}

function montarResultadoImportacao(grupos, existentes, detalhes = {}) {
  const novos = [];
  let jaExistentes = 0;
  for (const [chave, grupo] of grupos) {
    if (existentes.has(chave)) jaExistentes++;
    else novos.push(grupo);
  }
  novos.sort((a, b) => a.data.localeCompare(b.data) || a.loteNome.localeCompare(b.loteNome, "pt-BR", { numeric: true }));
  return { novos, jaExistentes, ...detalhes };
}

function processarPlanilhaSimples(workbook, lotes, existentes) {
  const aba = workbook.Sheets[workbook.SheetNames[0]];
  const linhas = leitorExcelCarregado.utils.sheet_to_json(aba, { header: 1, defval: null });
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
    const fase = idxDieta !== -1 ? normalizarFasePlanilha(linha[idxDieta]) : null;
    const ms = idxMs !== -1 ? normalizarNumeroPlanilha(linha[idxMs]) : null;
    if (adicionarAoGrupo(grupos, lote, data, valor, fase, ms)) totalLinhasSomadas++;
  }

  return montarResultadoImportacao(grupos, existentes, {
    formato: "Planilha de consumo",
    naoReconhecidos: [...naoReconhecidos],
    linhasIgnoradas,
    totalLinhasSomadas,
  });
}

function linhasDaAba(workbook, nome) {
  const nomeReal = workbook.SheetNames.find((n) => normalizarCabecalho(n).replace(/\s+/g, "") === nome);
  if (!nomeReal) return null;
  return leitorExcelCarregado.utils.sheet_to_json(workbook.Sheets[nomeReal], { header: 1, defval: null });
}

// Algumas exportações do vagão chamam a mesma aba em espanhol (RECETAS) e
// outras em português (RECEITAS) - aceita qualquer uma das duas.
function linhasDaAbaComAlias(workbook, nomes) {
  for (const nome of nomes) {
    const linhas = linhasDaAba(workbook, nome);
    if (linhas) return linhas;
  }
  return null;
}

function montarFasesPorCarga(workbook) {
  const linhasCargas = linhasDaAba(workbook, "cargas");
  const linhasAutonomos = linhasDaAba(workbook, "autonomos");
  if (!linhasCargas || !linhasAutonomos) return new Map();

  const cabAut = encontrarLinhaCabecalho(linhasAutonomos, ["id", "receta"]);
  const cabCarga = encontrarLinhaCabecalho(linhasCargas, ["id", "idautonomo"]);
  if (cabAut === -1 || cabCarga === -1) return new Map();

  const hAut = linhasAutonomos[cabAut].map((v) => normalizarCabecalho(v).replace(/\s+/g, ""));
  const idxAutId = hAut.indexOf("id");
  const idxReceita = hAut.indexOf("receta");
  const fasePorAutonomo = new Map();
  for (const linha of linhasAutonomos.slice(cabAut + 1)) {
    const id = String(linha?.[idxAutId] ?? "").trim();
    const fase = normalizarFasePlanilha(linha?.[idxReceita]);
    if (id && fase) fasePorAutonomo.set(id, fase);
  }

  const hCarga = linhasCargas[cabCarga].map((v) => normalizarCabecalho(v).replace(/\s+/g, ""));
  const idxCargaId = hCarga.indexOf("id");
  const idxAutonomo = hCarga.indexOf("idautonomo");
  const fasePorCarga = new Map();
  for (const linha of linhasCargas.slice(cabCarga + 1)) {
    const cargaId = String(linha?.[idxCargaId] ?? "").trim();
    const autonomoId = String(linha?.[idxAutonomo] ?? "").trim();
    const fase = fasePorAutonomo.get(autonomoId);
    if (cargaId && fase) fasePorCarga.set(cargaId, fase);
  }
  return fasePorCarga;
}

function processarPlanilhaVagao(workbook, lotes, existentes) {
  const linhas = linhasDaAba(workbook, "descargas");
  if (!linhas) throw new Error('Não encontrei a aba "DESCARGAS" no arquivo do vagão.');

  const idxCabecalho = encontrarLinhaCabecalho(linhas, ["data", "idcarga"]);
  if (idxCabecalho === -1) throw new Error('Não encontrei as colunas "Data" e "id_carga" na aba DESCARGAS.');
  const cabecalho = linhas[idxCabecalho].map((v) => normalizarCabecalho(v).replace(/\s+/g, ""));
  const idxData = cabecalho.indexOf("data");
  const idxCarga = cabecalho.indexOf("idcarga");
  const pares = [];
  for (let numero = 1; numero <= 15; numero++) {
    const idxLote = cabecalho.indexOf(`ing${numero}`);
    const idxPeso = cabecalho.indexOf(`peso${numero}`);
    if (idxLote !== -1 && idxPeso !== -1) pares.push({ idxLote, idxPeso });
  }
  if (pares.length === 0) throw new Error("Não encontrei os pares de lote e peso na aba DESCARGAS.");

  const fasePorCarga = montarFasesPorCarga(workbook);
  const grupos = new Map();
  const naoReconhecidos = new Set();
  let linhasIgnoradas = 0;
  let totalLinhasSomadas = 0;
  let descargasLidas = 0;

  for (const linha of linhas.slice(idxCabecalho + 1)) {
    if (!linha || linha.every((v) => v == null || v === "")) continue;
    const data = normalizarDataPlanilha(linha[idxData]);
    if (!data) {
      linhasIgnoradas++;
      continue;
    }
    const fase = fasePorCarga.get(String(linha[idxCarga] ?? "").trim()) || null;
    let descargaValida = false;
    for (const { idxLote, idxPeso } of pares) {
      const codigoLote = linha[idxLote];
      const valor = normalizarNumeroPlanilha(linha[idxPeso]);
      if (codigoLote == null || codigoLote === "" || valor == null || valor <= 0) continue;
      const lote = encontrarLoteDescarga(codigoLote, lotes);
      if (!lote) {
        naoReconhecidos.add(String(codigoLote).trim());
        linhasIgnoradas++;
        continue;
      }
      descargaValida = true;
      if (adicionarAoGrupo(grupos, lote, data, valor, fase, null)) totalLinhasSomadas++;
    }
    if (descargaValida) descargasLidas++;
  }

  return montarResultadoImportacao(grupos, existentes, {
    formato: "Arquivo bruto do vagão",
    naoReconhecidos: [...naoReconhecidos].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })),
    linhasIgnoradas,
    totalLinhasSomadas,
    descargasLidas,
  });
}

// Importa consumo diário de vários lotes de uma vez a partir de uma planilha
// Excel simples ou diretamente do arquivo bruto gerado pelo vagão.
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
      const XLSX = await carregarLeitorExcel();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const temDescargas = workbook.SheetNames.some((nome) => normalizarCabecalho(nome).replace(/\s+/g, "") === "descargas");
      setResultado(
        temDescargas
          ? processarPlanilhaVagao(workbook, lotes, existentes)
          : processarPlanilhaSimples(workbook, lotes, existentes)
      );
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
      const importados = await onImportar(linhas);
      setConcluido(Array.isArray(importados) ? importados.length : linhas.length);
    } finally {
      setImportando(false);
    }
  }

  return (
    <div>
      <BackHeader title="Importar planilha de consumo" onBack={onCancel} />

      <div style={styles.card}>
        <div style={{ fontSize: 13, color: "#5C5C58", padding: "10px 0" }}>
          Aceita a planilha simples de consumo ou o arquivo bruto exportado
          pelo vagão, com as abas CARGAS e DESCARGAS. As descargas do mesmo
          lote são somadas automaticamente num único consumo diário.
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
              <div>{resultado.formato}</div>
              {resultado.descargasLidas != null && <div>{resultado.descargasLidas} descarga(s) válida(s) lida(s)</div>}
              {resultado.novos.length} lançamento{resultado.novos.length !== 1 ? "s" : ""} novo
              {resultado.novos.length !== 1 ? "s" : ""} pronto{resultado.novos.length !== 1 ? "s" : ""} pra importar
              {resultado.totalLinhasSomadas > 0 && (
                <div>{resultado.totalLinhasSomadas} linha(s) somadas por serem do mesmo lote/data</div>
              )}
              {resultado.jaExistentes > 0 && (
                <div>{resultado.jaExistentes} já existiam no app (não serão duplicados)</div>
              )}
              {resultado.linhasIgnoradas > 0 && (
                <div>{resultado.linhasIgnoradas} registro(s) sem data/lote/quantidade válidos, ignorado(s)</div>
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

function chaveIngrediente(nome) {
  return normalizarTexto(nome).replace(/\s+/g, " ");
}

function montarReceitasPlanilha(workbook) {
  const linhas = linhasDaAba(workbook, "recetas");
  if (!linhas) throw new Error('Não encontrei a aba "RECETAS" no arquivo do vagão.');
  const idxCabecalho = encontrarLinhaCabecalho(linhas, ["id", "nombre"]);
  if (idxCabecalho === -1) throw new Error('Não encontrei as colunas "Id" e "Nombre" na aba RECETAS.');
  const cabecalho = linhas[idxCabecalho].map((v) => normalizarCabecalho(v).replace(/\s+/g, ""));
  const idxId = cabecalho.indexOf("id");
  const idxNome = cabecalho.indexOf("nombre");
  const pares = [];
  for (let numero = 1; numero <= 15; numero++) {
    const idxIngrediente = cabecalho.indexOf(`ing${numero}`);
    const idxPeso = cabecalho.indexOf(`peso${numero}`);
    if (idxIngrediente !== -1 && idxPeso !== -1) pares.push({ idxIngrediente, idxPeso });
  }
  const receitas = new Map();
  const receitasPorNome = new Map();
  for (const linha of linhas.slice(idxCabecalho + 1)) {
    const id = normalizarCodigoPlanilha(linha?.[idxId]);
    if (!id) continue;
    const itens = [];
    for (const par of pares) {
      const nome = String(linha?.[par.idxIngrediente] ?? "").trim();
      const peso = normalizarNumeroPlanilha(linha?.[par.idxPeso]);
      if (!nome || nome === "0" || peso == null || peso <= 0) continue;
      itens.push({ nome, chave: chaveIngrediente(nome), peso });
    }
    if (itens.length) {
      const receita = { nome: String(linha?.[idxNome] ?? id).trim(), itens };
      receitas.set(id, receita);
      receitasPorNome.set(normalizarTexto(receita.nome), receita);
    }
  }
  return { receitas, receitasPorNome };
}

function montarReceitasPorAutonomo(workbook) {
  const linhas = linhasDaAba(workbook, "autonomos");
  if (!linhas) return new Map();
  const idxCabecalho = encontrarLinhaCabecalho(linhas, ["id", "receta"]);
  if (idxCabecalho === -1) return new Map();
  const cabecalho = linhas[idxCabecalho].map((v) => normalizarCabecalho(v).replace(/\s+/g, ""));
  const idxId = cabecalho.indexOf("id");
  const idxReceita = cabecalho.indexOf("receta");
  const resultado = new Map();
  for (const linha of linhas.slice(idxCabecalho + 1)) {
    const id = normalizarCodigoPlanilha(linha?.[idxId]);
    const receita = normalizarTexto(linha?.[idxReceita]);
    if (id && receita) resultado.set(id, receita);
  }
  return resultado;
}

function montarDescargasPorCarga(workbook) {
  const linhas = linhasDaAba(workbook, "descargas");
  if (!linhas) return new Map();
  const idxCabecalho = encontrarLinhaCabecalho(linhas, ["data", "idcarga"]);
  if (idxCabecalho === -1) return new Map();
  const cabecalho = linhas[idxCabecalho].map((v) => normalizarCabecalho(v).replace(/\s+/g, ""));
  const idxData = cabecalho.indexOf("data");
  const idxCarga = cabecalho.indexOf("idcarga");
  const pares = [];
  for (let numero = 1; numero <= 15; numero++) {
    const idxLote = cabecalho.indexOf(`ing${numero}`);
    const idxPeso = cabecalho.indexOf(`peso${numero}`);
    if (idxLote !== -1 && idxPeso !== -1) pares.push({ idxLote, idxPeso });
  }
  const descargas = new Map();
  for (const linha of linhas.slice(idxCabecalho + 1)) {
    const cargaCodigo = normalizarCodigoPlanilha(linha?.[idxCarga]);
    const data = normalizarDataPlanilha(linha?.[idxData]);
    if (!cargaCodigo || !data) continue;
    const itens = descargas.get(cargaCodigo) || [];
    for (const { idxLote, idxPeso } of pares) {
      const loteCodigo = String(linha?.[idxLote] ?? "").trim();
      const peso = normalizarNumeroPlanilha(linha?.[idxPeso]);
      if (!loteCodigo || loteCodigo === "0" || peso == null || peso <= 0) continue;
      itens.push({ data, lote_codigo: loteCodigo, peso });
    }
    if (itens.length) descargas.set(cargaCodigo, itens);
  }
  return descargas;
}

// --- Formato "longo" do arquivo do vagão --------------------------------
// Algumas exportações da Hook trazem uma linha por ingrediente na aba
// CARGAS (em vez de colunas Ing1/Peso1..15 lado a lado) e uma linha por
// lote na aba DESCARGAS (coluna "Lot" direto, sem pares Ing/Peso). As
// abas também podem vir em português (RECEITAS/AUTONOMO) em vez de
// espanhol (RECETAS/AUTONOMOS). As funções abaixo tratam esse layout;
// processarCargasPlanilha/processarPlanilhaVagao continuam cuidando do
// formato largo de sempre.
function ehFormatoVagaoLongo(workbook) {
  const linhas = linhasDaAba(workbook, "cargas");
  if (!linhas) return false;
  return encontrarLinhaCabecalho(linhas, ["idcarga", "ingrediente", "quanti"]) !== -1;
}

function montarReceitasPorIdLonga(workbook) {
  const linhas = linhasDaAbaComAlias(workbook, ["recetas", "receitas"]);
  if (!linhas) throw new Error('Não encontrei a aba "RECEITAS" no arquivo do vagão.');
  const idxCabecalho = encontrarLinhaCabecalho(linhas, ["idreceita", "nome"]);
  if (idxCabecalho === -1) throw new Error('Não encontrei as colunas "Id Receita" e "Nome" na aba RECEITAS.');
  const cabecalho = linhas[idxCabecalho].map((v) => normalizarCabecalho(v).replace(/\s+/g, ""));
  const idxId = cabecalho.indexOf("idreceita");
  const idxNome = cabecalho.indexOf("nome");
  const pares = [];
  for (let numero = 1; numero <= 15; numero++) {
    const idxIngrediente = cabecalho.indexOf(`ingrediente${numero}`);
    const idxPeso = cabecalho.indexOf(`quanti${numero}`);
    if (idxIngrediente !== -1 && idxPeso !== -1) pares.push({ idxIngrediente, idxPeso });
  }
  const receitas = new Map();
  for (const linha of linhas.slice(idxCabecalho + 1)) {
    const id = normalizarCodigoPlanilha(linha?.[idxId]);
    if (!id) continue;
    const itens = [];
    for (const par of pares) {
      const nome = String(linha?.[par.idxIngrediente] ?? "").trim();
      const peso = normalizarNumeroPlanilha(linha?.[par.idxPeso]);
      if (!nome || nome === "0" || peso == null || peso <= 0) continue;
      itens.push({ nome, chave: chaveIngrediente(nome), peso });
    }
    const nomeReceita = String(linha?.[idxNome] ?? id).trim();
    receitas.set(id, { nome: nomeReceita, itens, fase: normalizarFasePlanilha(nomeReceita) });
  }
  return receitas;
}

function montarDescargasPorCargaLonga(workbook) {
  const linhas = linhasDaAba(workbook, "descargas");
  if (!linhas) return new Map();
  const idxCabecalho = encontrarLinhaCabecalho(linhas, ["idcarga", "data", "lot", "quanti"]);
  if (idxCabecalho === -1) return new Map();
  const cabecalho = linhas[idxCabecalho].map((v) => normalizarCabecalho(v).replace(/\s+/g, ""));
  const idxData = cabecalho.indexOf("data");
  const idxCarga = cabecalho.indexOf("idcarga");
  const idxLote = cabecalho.indexOf("lot");
  const idxQuanti = cabecalho.indexOf("quanti");
  const descargas = new Map();
  for (const linha of linhas.slice(idxCabecalho + 1)) {
    const cargaCodigo = normalizarCodigoPlanilha(linha?.[idxCarga]);
    const data = normalizarDataPlanilha(linha?.[idxData]);
    const loteCodigo = String(linha?.[idxLote] ?? "").trim();
    const peso = normalizarNumeroPlanilha(linha?.[idxQuanti]);
    if (!cargaCodigo || !data || !loteCodigo || loteCodigo === "0" || peso == null || peso <= 0) continue;
    const itens = descargas.get(cargaCodigo) || [];
    itens.push({ data, lote_codigo: loteCodigo, peso });
    descargas.set(cargaCodigo, itens);
  }
  return descargas;
}

function montarFasesPorCargaLonga(workbook, receitas) {
  const linhas = linhasDaAba(workbook, "cargas");
  if (!linhas) return new Map();
  const idxCabecalho = encontrarLinhaCabecalho(linhas, ["idcarga", "idreceita"]);
  if (idxCabecalho === -1) return new Map();
  const cabecalho = linhas[idxCabecalho].map((v) => normalizarCabecalho(v).replace(/\s+/g, ""));
  const idxId = cabecalho.indexOf("idcarga");
  const idxReceita = cabecalho.indexOf("idreceita");
  const fasePorCarga = new Map();
  for (const linha of linhas.slice(idxCabecalho + 1)) {
    const cargaCodigo = normalizarCodigoPlanilha(linha?.[idxId]);
    const receitaId = normalizarCodigoPlanilha(linha?.[idxReceita]);
    const fase = receitas.get(receitaId)?.fase;
    if (cargaCodigo && fase && !fasePorCarga.has(cargaCodigo)) fasePorCarga.set(cargaCodigo, fase);
  }
  return fasePorCarga;
}

function processarCargasPlanilhaLonga(workbook, cargasExistentes) {
  const linhas = linhasDaAba(workbook, "cargas");
  if (!linhas) throw new Error('Não encontrei a aba "CARGAS" no arquivo do vagão.');
  const idxCabecalho = encontrarLinhaCabecalho(linhas, ["idcarga", "data", "ingrediente", "quanti"]);
  if (idxCabecalho === -1) {
    throw new Error('Não encontrei as colunas "Id Carga", "Data", "Ingrediente" e "Quanti." na aba CARGAS.');
  }
  const cabecalho = linhas[idxCabecalho].map((v) => normalizarCabecalho(v).replace(/\s+/g, ""));
  const idxId = cabecalho.indexOf("idcarga");
  const idxData = cabecalho.indexOf("data");
  const idxHora = cabecalho.indexOf("hora");
  const idxReceita = cabecalho.indexOf("idreceita");
  const idxIngrediente = cabecalho.indexOf("ingrediente");
  const idxQuanti = cabecalho.indexOf("quanti");

  const receitas = montarReceitasPorIdLonga(workbook);
  const descargasPorCarga = montarDescargasPorCargaLonga(workbook);
  const existentes = new Map(cargasExistentes.map((c) => [String(c.carga_codigo), c]));

  // Uma carga vem espalhada em várias linhas (uma por ingrediente) - agrupa
  // por Id Carga antes de calcular o total pesado.
  const brutas = new Map();
  for (const linha of linhas.slice(idxCabecalho + 1)) {
    if (!linha || linha.every((v) => v == null || v === "")) continue;
    const cargaCodigo = normalizarCodigoPlanilha(linha[idxId]);
    const data = normalizarDataPlanilha(linha[idxData]);
    if (!cargaCodigo || !data) continue;
    const grupo = brutas.get(cargaCodigo) || {
      data,
      hora: idxHora !== -1 ? String(linha[idxHora] ?? "").trim() || null : null,
      receitaId: normalizarCodigoPlanilha(linha[idxReceita]),
      itens: new Map(),
    };
    const nome = String(linha[idxIngrediente] ?? "").trim();
    const peso = normalizarNumeroPlanilha(linha[idxQuanti]);
    if (nome && nome !== "0" && peso != null && peso >= 0) {
      const chave = chaveIngrediente(nome);
      const atual = grupo.itens.get(chave) || { nome, peso: 0 };
      atual.peso += peso;
      grupo.itens.set(chave, atual);
    }
    brutas.set(cargaCodigo, grupo);
  }

  const novos = [];
  const receitasAusentes = new Set();
  let ignoradas = 0;
  let jaExistentes = 0;

  for (const [cargaCodigo, grupo] of brutas) {
    const receita = receitas.get(grupo.receitaId);
    if (!receita) {
      if (grupo.receitaId && grupo.receitaId !== "0") receitasAusentes.add(grupo.receitaId);
      ignoradas++;
      continue;
    }
    const cargaExistente = existentes.get(cargaCodigo);
    if (cargaExistente && Array.isArray(cargaExistente.descargas) && cargaExistente.descargas.length > 0) {
      jaExistentes++;
      continue;
    }
    const totalReal = [...grupo.itens.values()].reduce((soma, item) => soma + item.peso, 0);
    const totalProgramado = receita.itens.reduce((soma, item) => soma + item.peso, 0);
    if (totalReal <= 0 || totalProgramado <= 0) {
      ignoradas++;
      continue;
    }
    const fator = totalReal / totalProgramado;
    const todasChaves = new Set([...grupo.itens.keys(), ...receita.itens.map((i) => i.chave)]);
    const itens = [...todasChaves].map((chave) => {
      const real = grupo.itens.get(chave);
      const programado = receita.itens.find((i) => i.chave === chave);
      return {
        ingrediente: real?.nome || programado?.nome || chave,
        ingrediente_chave: chave,
        peso_real: real?.peso || 0,
        peso_previsto: (programado?.peso || 0) * fator,
      };
    });
    novos.push({
      carga_codigo: cargaCodigo,
      data: grupo.data,
      hora: grupo.hora,
      receita: receita.nome,
      peso_real: totalReal,
      peso_previsto: totalProgramado * fator,
      itens,
      descargas: descargasPorCarga.get(cargaCodigo) || [],
    });
  }

  novos.sort((a, b) => a.data.localeCompare(b.data) || String(a.hora || "").localeCompare(String(b.hora || "")));
  return {
    novos,
    ignoradas,
    jaExistentes,
    receitasAusentes: [...receitasAusentes],
    receitasDisponiveis: [...receitas.keys()],
  };
}

function processarPlanilhaVagaoLonga(workbook, lotes, existentes) {
  const linhas = linhasDaAba(workbook, "descargas");
  if (!linhas) throw new Error('Não encontrei a aba "DESCARGAS" no arquivo do vagão.');
  const idxCabecalho = encontrarLinhaCabecalho(linhas, ["idcarga", "data", "lot", "quanti"]);
  if (idxCabecalho === -1) {
    throw new Error('Não encontrei as colunas "Data", "Id Carga", "Lot" e "Quanti." na aba DESCARGAS.');
  }
  const cabecalho = linhas[idxCabecalho].map((v) => normalizarCabecalho(v).replace(/\s+/g, ""));
  const idxData = cabecalho.indexOf("data");
  const idxCarga = cabecalho.indexOf("idcarga");
  const idxLote = cabecalho.indexOf("lot");
  const idxQuanti = cabecalho.indexOf("quanti");

  const receitas = montarReceitasPorIdLonga(workbook);
  const fasePorCarga = montarFasesPorCargaLonga(workbook, receitas);
  const grupos = new Map();
  const naoReconhecidos = new Set();
  let linhasIgnoradas = 0;
  let totalLinhasSomadas = 0;
  let descargasLidas = 0;

  for (const linha of linhas.slice(idxCabecalho + 1)) {
    if (!linha || linha.every((v) => v == null || v === "")) continue;
    const data = normalizarDataPlanilha(linha[idxData]);
    const codigoLote = linha[idxLote];
    const valor = normalizarNumeroPlanilha(linha[idxQuanti]);
    if (!data || codigoLote == null || codigoLote === "" || valor == null || valor <= 0) {
      linhasIgnoradas++;
      continue;
    }
    const lote = encontrarLoteDescarga(codigoLote, lotes);
    if (!lote) {
      naoReconhecidos.add(String(codigoLote).trim());
      linhasIgnoradas++;
      continue;
    }
    const fase = fasePorCarga.get(normalizarCodigoPlanilha(linha[idxCarga])) || null;
    if (adicionarAoGrupo(grupos, lote, data, valor, fase, null)) totalLinhasSomadas++;
    descargasLidas++;
  }

  return montarResultadoImportacao(grupos, existentes, {
    formato: "Arquivo bruto do vagão",
    naoReconhecidos: [...naoReconhecidos].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })),
    linhasIgnoradas,
    totalLinhasSomadas,
    descargasLidas,
  });
}

function processarCargasPlanilha(workbook, cargasExistentes) {
  const linhas = linhasDaAba(workbook, "cargas");
  if (!linhas) throw new Error('Não encontrei a aba "CARGAS" no arquivo do vagão.');
  const idxCabecalho = encontrarLinhaCabecalho(linhas, ["id", "data", "numero"]);
  if (idxCabecalho === -1) throw new Error('Não encontrei as colunas "Id", "Data" e "Numero" na aba CARGAS.');
  const cabecalho = linhas[idxCabecalho].map((v) => normalizarCabecalho(v).replace(/\s+/g, ""));
  const idxId = cabecalho.indexOf("id");
  const idxData = cabecalho.indexOf("data");
  const idxHora = cabecalho.indexOf("hora");
  const idxReceita = cabecalho.indexOf("numero");
  const idxAutonomo = cabecalho.indexOf("idautonomo");
  const pares = [];
  for (let numero = 1; numero <= 15; numero++) {
    const idxIngrediente = cabecalho.indexOf(`ing${numero}`);
    const idxPeso = cabecalho.indexOf(`peso${numero}`);
    if (idxIngrediente !== -1 && idxPeso !== -1) pares.push({ idxIngrediente, idxPeso });
  }

  const { receitas, receitasPorNome } = montarReceitasPlanilha(workbook);
  const receitaPorAutonomo = montarReceitasPorAutonomo(workbook);
  const descargasPorCarga = montarDescargasPorCarga(workbook);
  const existentes = new Map(cargasExistentes.map((c) => [String(c.carga_codigo), c]));
  const novos = [];
  const receitasAusentes = new Set();
  let ignoradas = 0;
  let jaExistentes = 0;

  for (const linha of linhas.slice(idxCabecalho + 1)) {
    if (!linha || linha.every((v) => v == null || v === "")) continue;
    const cargaCodigo = normalizarCodigoPlanilha(linha[idxId]);
    const data = normalizarDataPlanilha(linha[idxData]);
    const receitaId = normalizarCodigoPlanilha(linha[idxReceita]);
    const autonomoId = idxAutonomo !== -1 ? normalizarCodigoPlanilha(linha[idxAutonomo]) : "";
    // Alguns modelos filtrados/reexportados mudam os códigos da coluna
    // "Numero". Quando o ID direto não bate, usa IdAutonomo -> AUTONOMOS.Receta
    // -> RECETAS.Nombre, que representa a mesma formulação.
    const nomeReceitaAutonomo = receitaPorAutonomo.get(autonomoId);
    const receita =
      receitas.get(receitaId) ||
      // Alguns arquivos trocam o identificador da receita pelo autônomo.
      receitas.get(autonomoId) ||
      (nomeReceitaAutonomo ? receitasPorNome.get(nomeReceitaAutonomo) : null);
    if (!cargaCodigo || !data || !receita || receitaId === "0") {
      if (receitaId && receitaId !== "0" && !receita) receitasAusentes.add(receitaId);
      ignoradas++;
      continue;
    }
    const cargaExistente = existentes.get(cargaCodigo);
    if (cargaExistente && Array.isArray(cargaExistente.descargas) && cargaExistente.descargas.length > 0) {
      jaExistentes++;
      continue;
    }

    const reais = new Map();
    for (const par of pares) {
      const nome = String(linha[par.idxIngrediente] ?? "").trim();
      const peso = normalizarNumeroPlanilha(linha[par.idxPeso]);
      if (!nome || nome === "0" || peso == null || peso < 0) continue;
      const chave = chaveIngrediente(nome);
      const atual = reais.get(chave) || { nome, peso: 0 };
      atual.peso += peso;
      reais.set(chave, atual);
    }
    const totalReal = [...reais.values()].reduce((soma, item) => soma + item.peso, 0);
    const totalProgramado = receita.itens.reduce((soma, item) => soma + item.peso, 0);
    if (totalReal <= 0 || totalProgramado <= 0) {
      ignoradas++;
      continue;
    }
    const fator = totalReal / totalProgramado;
    const todasChaves = new Set([...reais.keys(), ...receita.itens.map((i) => i.chave)]);
    const itens = [...todasChaves].map((chave) => {
      const real = reais.get(chave);
      const programado = receita.itens.find((i) => i.chave === chave);
      return {
        ingrediente: real?.nome || programado?.nome || chave,
        ingrediente_chave: chave,
        peso_real: real?.peso || 0,
        peso_previsto: (programado?.peso || 0) * fator,
      };
    });
    novos.push({
      carga_codigo: cargaCodigo,
      data,
      hora: idxHora !== -1 ? String(linha[idxHora] ?? "").trim() || null : null,
      receita: receita.nome,
      peso_real: totalReal,
      peso_previsto: totalProgramado * fator,
      itens,
      descargas: descargasPorCarga.get(cargaCodigo) || [],
    });
  }

  novos.sort((a, b) => a.data.localeCompare(b.data) || String(a.hora || "").localeCompare(String(b.hora || "")));
  return {
    novos,
    ignoradas,
    jaExistentes,
    receitasAusentes: [...receitasAusentes],
    receitasDisponiveis: [...receitas.keys()],
  };
}

function calcularComposicaoCarga(carga, configuracoes) {
  const itens = (Array.isArray(carga.itens) ? carga.itens : []).filter((item) => Number(item.peso_real || 0) > 0);
  const pesoTotal = itens.reduce((soma, item) => soma + Number(item.peso_real || 0), 0);
  if (!pesoTotal) return {};
  const todosComMs = itens.every((item) => Number.isFinite(configuracoes.get(item.ingrediente_chave || chaveIngrediente(item.ingrediente))?.ms));
  const todosComCusto = itens.every((item) => Number.isFinite(configuracoes.get(item.ingrediente_chave || chaveIngrediente(item.ingrediente))?.custo));
  return {
    ms: todosComMs
      ? itens.reduce((soma, item) => soma + Number(item.peso_real) * configuracoes.get(item.ingrediente_chave || chaveIngrediente(item.ingrediente)).ms, 0) / pesoTotal
      : null,
    custo: todosComCusto
      ? itens.reduce((soma, item) => soma + Number(item.peso_real) * configuracoes.get(item.ingrediente_chave || chaveIngrediente(item.ingrediente)).custo, 0) / pesoTotal
      : null,
  };
}

function montarSincronizacoesConsumoCargas(cargas, lotes, consumos, ingredientesMs) {
  const configuracoes = new Map(ingredientesMs.map((item) => [
    item.ingrediente_chave,
    {
      ms: item.ms_percentual == null ? null : Number(item.ms_percentual),
      custo: item.custo_kg_mn == null ? null : Number(item.custo_kg_mn),
    },
  ]));
  const grupos = new Map();
  for (const carga of cargas) {
    const composicao = calcularComposicaoCarga(carga, configuracoes);
    for (const descarga of Array.isArray(carga.descargas) ? carga.descargas : []) {
      const lote = encontrarLoteDescarga(descarga.lote_codigo, lotes);
      const peso = Number(descarga.peso || 0);
      if (!lote || !descarga.data || peso <= 0) continue;
      const chave = `${lote.id}|${descarga.data}`;
      const grupo = grupos.get(chave) || { loteId: lote.id, data: descarga.data, peso: 0, pesoMs: 0, somaMs: 0, pesoCusto: 0, somaCusto: 0 };
      grupo.peso += peso;
      if (Number.isFinite(composicao.ms)) {
        grupo.pesoMs += peso;
        grupo.somaMs += peso * composicao.ms;
      }
      if (Number.isFinite(composicao.custo)) {
        grupo.pesoCusto += peso;
        grupo.somaCusto += peso * composicao.custo;
      }
      grupos.set(chave, grupo);
    }
  }
  const consumoPorChave = new Map(consumos.map((consumo) => [`${consumo.lote_id}|${consumo.data}`, consumo]));
  const atualizacoes = [];
  for (const [chave, grupo] of grupos) {
    const consumo = consumoPorChave.get(chave);
    if (!consumo) continue;
    const dados = {};
    if (grupo.pesoMs === grupo.peso && grupo.peso > 0) dados.ms_dieta = grupo.somaMs / grupo.peso;
    if (grupo.pesoCusto === grupo.peso && grupo.peso > 0) dados.custo_kg_mn = grupo.somaCusto / grupo.peso;
    if (Object.keys(dados).length) atualizacoes.push({ id: consumo.id, ...dados });
  }
  return atualizacoes;
}

function removerDuplicacaoSaicon(texto) {
  if (!texto || texto.length < 4) return texto;
  let iguais = 0;
  for (let i = 0; i + 1 < texto.length; i += 2) {
    if (texto[i] === texto[i + 1]) iguais++;
  }
  if (iguais / Math.floor(texto.length / 2) < 0.72) return texto;
  let resultado = "";
  for (let i = 0; i < texto.length; i += 2) resultado += texto[i];
  return resultado;
}

function minutosDoHorario(valor) {
  const partes = String(valor || "").split(":").map(Number);
  return partes.length >= 2 && partes.every(Number.isFinite) ? partes[0] * 60 + partes[1] : null;
}

function dataIsoSaicon(texto) {
  const match = removerDuplicacaoSaicon(texto).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

function numeroSaicon(valor) {
  const texto = String(valor || "").trim();
  const normalizado = /^-?\d{1,3}(?:\.\d{3})+,\d+$/.test(texto)
    ? texto.replace(/\./g, "").replace(",", ".")
    : texto.replace(",", ".");
  return normalizarNumeroPlanilha(normalizado);
}

async function extrairPaginasPdfSaicon(file) {
  const pdfjs = await carregarLeitorPdf();
  const documento = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const paginas = [];
  for (let numero = 1; numero <= documento.numPages; numero++) {
    const pagina = await documento.getPage(numero);
    const conteudo = await pagina.getTextContent();
    const linhasPorY = new Map();
    for (const item of conteudo.items) {
      if (!item.str?.trim()) continue;
      const y = Math.round(Number(item.transform?.[5] || 0));
      const itens = linhasPorY.get(y) || [];
      itens.push({ x: Number(item.transform?.[4] || 0), texto: item.str });
      linhasPorY.set(y, itens);
    }
    const linhas = [...linhasPorY.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, itens]) => removerDuplicacaoSaicon(
        itens.sort((a, b) => a.x - b.x).map((item) => item.texto).join(" ").replace(/\s+/g, " ").trim()
      ))
      .filter(Boolean);
    paginas.push(linhas);
  }
  return paginas;
}

function interpretarPdfSaicon(paginas) {
  const registros = [];
  let tipo = null;
  for (let indice = 0; indice < paginas.length; indice++) {
    const linhas = paginas[indice];
    const titulo = linhas.find((linha) => /Relat[oó]rio de (Carregamento|Descarga)/i.test(linha));
    const tipoPagina = /Carregamento/i.test(titulo || "") ? "carga" : /Descarga/i.test(titulo || "") ? "descarga" : null;
    if (!tipoPagina) continue;
    if (tipo && tipo !== tipoPagina) throw new Error("O PDF mistura relatórios de carga e descarga.");
    tipo = tipoPagina;
    const data = dataIsoSaicon(titulo);
    // Sem "i": o cabeçalho vem como "TRATO"; a linha de dados começa
    // exatamente com "Trato".
    const resumo = linhas.find((linha) => /^Trato\s/.test(linha));
    const horarios = resumo?.match(/(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+\d{2}:\d{2}:\d{2}\s*$/);
    if (!data || !resumo || !horarios) continue;
    const itens = [];
    for (const linha of linhas) {
      const match = linha.match(/^(.+?)\s+(-?[\d.,]+)\s*KG\s+(-?[\d.,]+)\s*KG\s+(-?[\d.,]+)\s*KG\s+(-?[\d.,]+)\s*%/i);
      if (!match || /^TOTAIS/i.test(match[1])) continue;
      const nome = match[1].trim();
      if (tipoPagina === "carga" || /^Lote\s+/i.test(nome)) {
        itens.push({
          nome,
          previsto: numeroSaicon(match[2]) || 0,
          realizado: numeroSaicon(match[3]) || 0,
        });
      }
    }
    if (!itens.length) continue;
    registros.push({
      pagina: indice + 1,
      data,
      inicio: horarios[1],
      fim: horarios[2],
      inicioMinutos: minutosDoHorario(horarios[1]),
      fimMinutos: minutosDoHorario(horarios[2]),
      itens,
    });
  }
  if (!tipo || !registros.length) throw new Error("Não reconheci o relatório de carga ou descarga da Saicon.");
  return { tipo, registros, paginasLidas: paginas.length };
}

function processarPdfsSaicon(cargaPdf, descargaPdf, lotes, consumos, cargasExistentes) {
  const cargasPorData = new Map();
  const descargasPorData = new Map();
  for (const carga of cargaPdf.registros) {
    const lista = cargasPorData.get(carga.data) || [];
    lista.push(carga);
    cargasPorData.set(carga.data, lista);
  }
  for (const descarga of descargaPdf.registros) {
    const lista = descargasPorData.get(descarga.data) || [];
    lista.push(descarga);
    descargasPorData.set(descarga.data, lista);
  }
  const codigosExistentes = new Set(cargasExistentes.map((carga) => String(carga.carga_codigo)));
  const novasCargas = [];
  const gruposConsumo = new Map();
  const lotesNaoReconhecidos = new Set();
  let cargasSemDescarga = 0;
  let descargasSemCarga = 0;
  let cargasJaExistentes = 0;

  const todasDatas = new Set([...cargasPorData.keys(), ...descargasPorData.keys()]);
  for (const data of todasDatas) {
    const cargasDia = (cargasPorData.get(data) || []).sort((a, b) => a.inicioMinutos - b.inicioMinutos);
    const descargasDia = (descargasPorData.get(data) || []).sort((a, b) => a.inicioMinutos - b.inicioMinutos);
    const usadas = new Set();
    for (let indice = 0; indice < cargasDia.length; indice++) {
      const carga = cargasDia[indice];
      let melhorIndice = -1;
      let melhorIntervalo = Infinity;
      for (let i = 0; i < descargasDia.length; i++) {
        if (usadas.has(i)) continue;
        const intervalo = descargasDia[i].inicioMinutos - carga.fimMinutos;
        if (intervalo >= -2 && intervalo <= 180 && intervalo < melhorIntervalo) {
          melhorIndice = i;
          melhorIntervalo = intervalo;
        }
      }
      if (melhorIndice === -1) {
        cargasSemDescarga++;
        continue;
      }
      usadas.add(melhorIndice);
      const descarga = descargasDia[melhorIndice];
      const codigo = `saicon-${data}-${carga.inicio.replace(":", "")}`;
      const itens = carga.itens.map((item) => ({
        ingrediente: item.nome,
        ingrediente_chave: chaveIngrediente(item.nome),
        peso_real: item.realizado,
        peso_previsto: item.previsto,
      }));
      const descargas = [];
      for (const item of descarga.itens) {
        const lote = encontrarLoteDescarga(item.nome, lotes);
        if (!lote) {
          lotesNaoReconhecidos.add(item.nome);
          continue;
        }
        descargas.push({ data, lote_codigo: item.nome, peso: item.realizado });
        adicionarAoGrupo(gruposConsumo, lote, data, item.realizado, null, null);
      }
      if (codigosExistentes.has(codigo)) cargasJaExistentes++;
      else {
        novasCargas.push({
          carga_codigo: codigo,
          data,
          hora: carga.inicio,
          receita: "Saicon",
          peso_real: itens.reduce((soma, item) => soma + item.peso_real, 0),
          peso_previsto: itens.reduce((soma, item) => soma + item.peso_previsto, 0),
          itens,
          descargas,
        });
      }
    }
    descargasSemCarga += descargasDia.length - usadas.size;
  }

  const existentes = new Set(consumos.map((consumo) => `${consumo.lote_id}|${consumo.data}`));
  return {
    novos: novasCargas,
    jaExistentes: cargasJaExistentes,
    ignoradas: cargasSemDescarga,
    receitasAusentes: [],
    receitasDisponiveis: [],
    descargas: montarResultadoImportacao(gruposConsumo, existentes, {
      naoReconhecidos: [...lotesNaoReconhecidos],
      linhasIgnoradas: 0,
    }),
    saicon: {
      cargasLidas: cargaPdf.registros.length,
      descargasLidas: descargaPdf.registros.length,
      cargasSemDescarga,
      descargasSemCarga,
    },
  };
}

function ImportarCargasPlanilha({ cargasExistentes, lotes, consumos, ingredientesMs, onCancel, onImportar, onImportarConsumos, onSincronizar, onConcluido }) {
  const [processando, setProcessando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [concluido, setConcluido] = useState(null);
  const [arquivoPrincipal, setArquivoPrincipal] = useState(null);
  const [arquivoDescarga, setArquivoDescarga] = useState(null);

  async function processarArquivo(files) {
    const selecionados = [...(files || [])];
    if (!selecionados.length) return;
    setProcessando(true);
    setErro(null);
    setResultado(null);
    setConcluido(null);
    try {
      const pdfs = selecionados.filter((file) => /\.pdf$/i.test(file.name));
      if (pdfs.length) {
        if (pdfs.length !== 2 || selecionados.length !== 2) {
          throw new Error("Para a Saicon, selecione juntos os dois PDFs: Carga e Descarga.");
        }
        const interpretados = [];
        for (const file of pdfs) interpretados.push(interpretarPdfSaicon(await extrairPaginasPdfSaicon(file)));
        const cargaPdf = interpretados.find((pdf) => pdf.tipo === "carga");
        const descargaPdf = interpretados.find((pdf) => pdf.tipo === "descarga");
        if (!cargaPdf || !descargaPdf) throw new Error("Selecione um PDF de Carga e um PDF de Descarga da Saicon.");
        setResultado(processarPdfsSaicon(cargaPdf, descargaPdf, lotes, consumos, cargasExistentes));
      } else {
        if (selecionados.length !== 1) throw new Error("Selecione apenas uma planilha do vagão.");
        const XLSX = await carregarLeitorExcel();
        const workbook = XLSX.read(await selecionados[0].arrayBuffer(), { type: "array", cellDates: true });
        const existentes = new Set(consumos.map((consumo) => `${consumo.lote_id}|${consumo.data}`));
        // Formato largo (Ing1/Peso1..15 lado a lado) ou longo (uma linha por
        // ingrediente/lote) - detecta pelo cabeçalho da aba CARGAS.
        const cargas = ehFormatoVagaoLongo(workbook)
          ? processarCargasPlanilhaLonga(workbook, cargasExistentes)
          : processarCargasPlanilha(workbook, cargasExistentes);
        const descargas = ehFormatoVagaoLongo(workbook)
          ? processarPlanilhaVagaoLonga(workbook, lotes, existentes)
          : processarPlanilhaVagao(workbook, lotes, existentes);
        setResultado({ ...cargas, descargas });
      }
    } catch (e) {
      setErro(e.message || "Não foi possível ler as cargas dessa planilha.");
    } finally {
      setProcessando(false);
    }
  }

  async function confirmar() {
    if (!resultado || (!resultado.novos.length && !resultado.descargas.novos.length)) return;
    setImportando(true);
    try {
      const importadas = resultado.novos.length ? await onImportar(resultado.novos) : [];
      const cargasImportadas = Array.isArray(importadas) ? importadas : resultado.novos;
      const linhasConsumo = resultado.descargas.novos.map((descarga) => ({
        lote_id: descarga.loteId,
        data: descarga.data,
        consumo_total_lote: descarga.consumoTotalLote,
        ms_dieta: null,
        dieta_fase: descarga.fase || null,
        custo_kg_mn: null,
      }));
      const consumosImportados = linhasConsumo.length && onImportarConsumos
        ? await onImportarConsumos(linhasConsumo)
        : [];
      const todosConsumos = [...consumos, ...(Array.isArray(consumosImportados) ? consumosImportados : [])];
      const atualizacoes = onSincronizar
        ? montarSincronizacoesConsumoCargas([...cargasExistentes, ...cargasImportadas], lotes, todosConsumos, ingredientesMs)
        : [];
      if (atualizacoes.length) await onSincronizar(atualizacoes);
      setConcluido({
        cargas: cargasImportadas.length,
        descargas: Array.isArray(consumosImportados) ? consumosImportados.length : linhasConsumo.length,
        sincronizados: atualizacoes.length,
      });
    } finally {
      setImportando(false);
    }
  }

  return (
    <div>
      <BackHeader title="Importar cargas do vagão" onBack={onCancel} />
      <div style={styles.card}>
        <div style={{ fontSize: 13, color: "#5C5C58", lineHeight: 1.5, padding: "10px 0" }}>
          Hook: selecione a planilha bruta. Saicon: selecione juntos os PDFs
          de Carga e Descarga. O aplicativo relaciona os vagões, soma o consumo
          por lote/dia e calcula composição, erro, custo e matéria seca.
        </div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5C5C58", marginTop: 8 }}>
          Planilha Hook ou PDF de Carga Saicon
          <input type="file" accept=".xlsx,.xls,.pdf" disabled={processando || importando}
            onChange={(e) => {
              setArquivoPrincipal(e.target.files?.[0] || null);
              setArquivoDescarga(null);
              setResultado(null);
              setErro(null);
            }}
            style={{ display: "block", fontSize: 13, padding: "8px 0" }} />
        </label>
        {arquivoPrincipal && /\.pdf$/i.test(arquivoPrincipal.name) && (
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5C5C58", marginTop: 4 }}>
            PDF de Descarga Saicon
            <input type="file" accept=".pdf" disabled={processando || importando}
              onChange={(e) => setArquivoDescarga(e.target.files?.[0] || null)}
              style={{ display: "block", fontSize: 13, padding: "8px 0" }} />
          </label>
        )}
        <button type="button"
          disabled={!arquivoPrincipal || (/\.pdf$/i.test(arquivoPrincipal.name) && !arquivoDescarga) || processando || importando}
          onClick={() => processarArquivo([arquivoPrincipal, ...(arquivoDescarga ? [arquivoDescarga] : [])])}
          style={{ ...styles.secondaryActionBtn, marginTop: 6 }}>
          {processando ? "Analisando..." : "Analisar arquivos"}
        </button>
        {processando && <div style={{ fontSize: 13, color: "#9A9A94" }}>Lendo e relacionando cargas e descargas...</div>}
        {erro && <div style={{ fontSize: 13, color: "#B8763E", padding: "6px 0" }}>{erro}</div>}
      </div>

      {resultado && concluido == null && (
        <>
          <div style={{ ...styles.card, marginTop: 10, fontSize: 13, color: "#5C5C58", lineHeight: 1.7 }}>
            <strong style={{ color: "#252522" }}>{resultado.novos.length} carga(s) nova(s)</strong>
            {resultado.jaExistentes > 0 && <div>{resultado.jaExistentes} já existiam e não serão duplicadas</div>}
            <div><strong style={{ color: "#252522" }}>{resultado.descargas.novos.length} consumo(s) diário(s) novo(s)</strong> calculado(s) pelas descargas</div>
            {resultado.descargas.jaExistentes > 0 && <div>{resultado.descargas.jaExistentes} consumo(s) já existiam e não serão duplicados</div>}
            {resultado.descargas.naoReconhecidos.length > 0 && (
              <div style={{ color: "#B8763E" }}>Lotes não encontrados: {resultado.descargas.naoReconhecidos.join(", ")}</div>
            )}
            {resultado.saicon && (
              <div style={{ marginTop: 4 }}>
                Saicon: {resultado.saicon.cargasLidas} cargas e {resultado.saicon.descargasLidas} descargas lidas.
                {(resultado.saicon.cargasSemDescarga > 0 || resultado.saicon.descargasSemCarga > 0) && (
                  <span style={{ color: "#B8763E" }}> {resultado.saicon.cargasSemDescarga} carga(s) e {resultado.saicon.descargasSemCarga} descarga(s) sem correspondência foram ignoradas.</span>
                )}
              </div>
            )}
            {resultado.ignoradas > 0 && <div>{resultado.ignoradas} registro(s) sem carga/receita válida, ignorado(s)</div>}
            {resultado.receitasAusentes.length > 0 && (
              <>
                <div style={{ color: "#B8763E" }}>Receitas não encontradas: {resultado.receitasAusentes.join(", ")}</div>
                <div style={{ color: "#8A6A4A" }}>
                  Códigos encontrados na aba RECETAS: {resultado.receitasDisponiveis.length ? resultado.receitasDisponiveis.join(", ") : "nenhum"}
                </div>
              </>
            )}
          </div>
          <PrimaryButton disabled={(!resultado.novos.length && !resultado.descargas.novos.length) || importando} onClick={confirmar}>
            {importando ? "Importando cargas e descargas..." : "Importar cargas e descargas"}
          </PrimaryButton>
        </>
      )}

      {concluido != null && (
        <div style={{ ...styles.card, marginTop: 10, textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1F4D45", padding: "14px 0" }}>
            {concluido.cargas} carga(s) importada(s) com sucesso.
            <div style={{ marginTop: 4 }}>{concluido.descargas} consumo(s) diário(s) criado(s) pelas descargas.</div>
            {concluido.sincronizados > 0 && <div style={{ marginTop: 4 }}>{concluido.sincronizados} consumo(s) atualizado(s) com MS e custo.</div>}
          </div>
          <PrimaryButton onClick={onConcluido}>Ver análise das cargas</PrimaryButton>
        </div>
      )}
    </div>
  );
}

function corErroCarga(percentual) {
  const absoluto = Math.abs(percentual || 0);
  if (absoluto <= 2) return { cor: "#2F7D5B", fundo: "#E7F3EC" };
  if (absoluto <= 5) return { cor: "#9A6B16", fundo: "#FFF3D6" };
  return { cor: "#B4473D", fundo: "#FBE8E6" };
}

function AbaCargas({ cargas, ingredientesMs, lotes, consumos, onSalvarMs, onSincronizar, onImportar, onExcluirCarga }) {
  const datas = [...new Set(cargas.map((c) => c.data))].sort((a, b) => b.localeCompare(a));
  const primeiraData = datas[datas.length - 1];
  const ultimaData = datas[0];
  const [modo, setModo] = useState("dia");
  const [dataEscolhida, setDataEscolhida] = useState("");
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [salvando, setSalvando] = useState(null);
  const [cargaExpandida, setCargaExpandida] = useState(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [mensagemSincronizacao, setMensagemSincronizacao] = useState("");
  const data = datas.includes(dataEscolhida) ? dataEscolhida : datas[0];
  const inicio = periodoInicio || primeiraData;
  const fim = periodoFim || ultimaData;
  const cargasDia = modo === "periodo"
    ? cargas.filter((c) => c.data >= inicio && c.data <= fim)
    : cargas.filter((c) => c.data === data);
  const msPorIngrediente = new Map(
    ingredientesMs
      .filter((i) => i.ms_percentual != null)
      .map((i) => [i.ingrediente_chave, Number(i.ms_percentual)])
  );
  const custoPorIngrediente = new Map(
    ingredientesMs
      .filter((i) => i.custo_kg_mn != null)
      .map((i) => [i.ingrediente_chave, Number(i.custo_kg_mn)])
  );
  const resumo = new Map();

  for (const carga of cargasDia) {
    for (const item of Array.isArray(carga.itens) ? carga.itens : []) {
      const chave = item.ingrediente_chave || chaveIngrediente(item.ingrediente);
      const atual = resumo.get(chave) || {
        chave,
        nome: item.ingrediente,
        previsto: 0,
        real: 0,
      };
      atual.previsto += Number(item.peso_previsto || 0);
      atual.real += Number(item.peso_real || 0);
      resumo.set(chave, atual);
    }
  }

  const ingredientes = [...resumo.values()].sort((a, b) => b.real - a.real);
  const totalReal = ingredientes.reduce((s, i) => s + i.real, 0);
  const totalPrevisto = ingredientes.reduce((s, i) => s + i.previsto, 0);
  const erroAbsoluto = ingredientes.reduce((s, i) => s + Math.abs(i.real - i.previsto), 0);
  const erroMedio = totalPrevisto > 0 ? erroAbsoluto / totalPrevisto * 100 : 0;
  const totalMs = ingredientes.reduce((s, i) => {
    const ms = msPorIngrediente.get(i.chave);
    return s + (Number.isFinite(ms) ? i.real * ms / 100 : 0);
  }, 0);
  const faltamMs = ingredientes.filter((i) => !Number.isFinite(msPorIngrediente.get(i.chave))).length;
  const custoTotal = ingredientes.reduce((s, i) => {
    const custo = custoPorIngrediente.get(i.chave);
    return s + (Number.isFinite(custo) ? i.real * custo : 0);
  }, 0);
  const custoDietaKgMn = totalReal > 0 ? custoTotal / totalReal : null;
  const custoDietaKgMs = totalMs > 0 ? custoTotal / totalMs : null;
  const faltamCustos = ingredientes.filter((i) => !Number.isFinite(custoPorIngrediente.get(i.chave))).length;

  async function salvarConfiguracao(item, campo, valor) {
    if (!onSalvarMs) return;
    const numero = normalizarNumeroPlanilha(valor);
    if (numero == null || numero < 0 || (campo === "ms_percentual" && numero > 100)) return;
    const msAtual = msPorIngrediente.get(item.chave);
    const custoAtual = custoPorIngrediente.get(item.chave);
    setSalvando(item.chave);
    try {
      const configuracaoAtualizada = {
        ingrediente_chave: item.chave,
        ingrediente_nome: item.nome,
        ms_percentual: campo === "ms_percentual" ? numero : Number.isFinite(msAtual) ? msAtual : null,
        custo_kg_mn: campo === "custo_kg_mn" ? numero : Number.isFinite(custoAtual) ? custoAtual : null,
      };
      await onSalvarMs(configuracaoAtualizada);
      // Assim que a MS/custo de um ingrediente é preenchida, sincroniza na
      // hora — não deixa dependente do clique manual em "Sincronizar
      // descargas com consumo" (que fica só como reforço/recálculo).
      if (onSincronizar) {
        const ingredientesAtualizados = [
          ...ingredientesMs.filter((i) => i.ingrediente_chave !== item.chave),
          configuracaoAtualizada,
        ];
        const atualizacoes = montarSincronizacoesConsumoCargas(cargas, lotes, consumos, ingredientesAtualizados);
        if (atualizacoes.length) await onSincronizar(atualizacoes);
      }
    } finally {
      setSalvando(null);
    }
  }

  async function sincronizarConsumos() {
    if (!onSincronizar) return;
    setSincronizando(true);
    setMensagemSincronizacao("");
    try {
      const atualizacoes = montarSincronizacoesConsumoCargas(cargas, lotes, consumos, ingredientesMs);
      await onSincronizar(atualizacoes);
      setMensagemSincronizacao(
        atualizacoes.length
          ? `${atualizacoes.length} consumo(s) sincronizado(s) com as descargas.`
          : "Nenhum consumo pôde ser sincronizado. Confira se as descargas, os lotes, a MS e os preços estão completos."
      );
    } finally {
      setSincronizando(false);
    }
  }

  if (!cargas.length) {
    return (
      <div>
        <EmptyHint text="Nenhuma carga importada ainda. Use o mesmo arquivo bruto do vagão utilizado no consumo." />
        {onImportar && <PrimaryButton onClick={onImportar}>Importar cargas</PrimaryButton>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <SectionTitle>Cargas do vagão</SectionTitle>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid #D8D5CC" }}>
            <button type="button" onClick={() => setModo("dia")}
              style={{
                padding: "6px 10px", fontSize: 12, border: 0, cursor: "pointer",
                background: modo === "dia" ? "#1F4D45" : "transparent",
                color: modo === "dia" ? "#fff" : "#5C5C58",
              }}>
              Dia
            </button>
            <button type="button" onClick={() => setModo("periodo")}
              style={{
                padding: "6px 10px", fontSize: 12, border: 0, cursor: "pointer",
                background: modo === "periodo" ? "#1F4D45" : "transparent",
                color: modo === "periodo" ? "#fff" : "#5C5C58",
              }}>
              Período
            </button>
          </div>
          {modo === "dia" ? (
            <label style={{ fontSize: 12, color: "#5C5C58" }}>
              <select value={data || ""} onChange={(e) => setDataEscolhida(e.target.value)}
                style={{ ...styles.input, width: "auto", minWidth: 140, padding: "7px 9px" }}>
                {datas.map((d) => <option key={d} value={d}>{formatDataBR(d)}</option>)}
              </select>
            </label>
          ) : (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="date" value={inicio} min={primeiraData} max={fim}
                onChange={(e) => setPeriodoInicio(e.target.value)}
                style={{ ...styles.input, width: "auto", padding: "7px 9px", fontSize: 12 }} />
              <span style={{ fontSize: 12, color: "#9A9A94" }}>até</span>
              <input type="date" value={fim} min={inicio} max={ultimaData}
                onChange={(e) => setPeriodoFim(e.target.value)}
                style={{ ...styles.input, width: "auto", padding: "7px 9px", fontSize: 12 }} />
            </div>
          )}
        </div>
      </div>

      <div style={styles.gestaoGrid} className="desktop-summary-grid">
        <PainelCard label={modo === "periodo" ? "Cargas no período" : "Cargas no dia"} valor={cargasDia.length} />
        <PainelCard label="Matéria natural" valor={`${totalReal.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`} />
        <PainelCard label="Erro absoluto" valor={`${erroMedio.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`} />
        <PainelCard label="Matéria seca" valor={`${totalMs.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg MS`} />
        <PainelCard label="Custo total das cargas" valor={faltamCustos === 0 ? formatBRL(custoTotal) : "Preencha os custos"} />
        <PainelCard label="Custo da dieta (MN)" valor={faltamCustos === 0 && custoDietaKgMn != null ? `${formatBRL(custoDietaKgMn)}/kg` : "—"} />
        <PainelCard label="Custo da dieta (MS)" valor={faltamCustos === 0 && custoDietaKgMs != null ? `${formatBRL(custoDietaKgMs)}/kg MS` : "—"} />
      </div>

      {(faltamMs > 0 || faltamCustos > 0) && (
        <div style={{ ...styles.card, marginBottom: 10, padding: 12, fontSize: 12.5, color: "#8A6420", background: "#FFF8E8" }}>
          {faltamMs > 0 && <div>Informe a MS de {faltamMs} ingrediente(s) para completar o total diário de matéria seca.</div>}
          {faltamCustos > 0 && <div>Informe o custo de {faltamCustos} ingrediente(s) para calcular o custo real das cargas e da dieta.</div>}
        </div>
      )}

      {onSincronizar && (
        <div style={{ ...styles.card, marginBottom: 10, padding: 12 }}>
          <div style={{ fontSize: 12.5, color: "#5C5C58", lineHeight: 1.5, marginBottom: 8 }}>
            Envie para o consumo diário a MS e o custo ponderados pelo peso descarregado em cada lote. A quantidade consumida não é alterada.
          </div>
          <button type="button" onClick={sincronizarConsumos} disabled={sincronizando} style={styles.secondaryActionBtn}>
            {sincronizando ? "Sincronizando..." : "Sincronizar descargas com consumo"}
          </button>
          {mensagemSincronizacao && <div style={{ fontSize: 12, color: "#1F4D45", marginTop: 8 }}>{mensagemSincronizacao}</div>}
        </div>
      )}

      <div style={{ ...styles.card, overflowX: "auto", padding: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 930, fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: "#F4F2ED", color: "#5C5C58", textAlign: "right" }}>
              <th style={{ padding: 10, textAlign: "left" }}>Ingrediente</th>
              <th style={{ padding: 10 }}>Previsto</th>
              <th style={{ padding: 10 }}>Realizado</th>
              <th style={{ padding: 10 }}>Erro kg</th>
              <th style={{ padding: 10 }}>Erro %</th>
              <th style={{ padding: 10 }}>MS %</th>
              <th style={{ padding: 10 }}>Kg MS/dia</th>
              <th style={{ padding: 10 }}>Custo R$/kg</th>
              <th style={{ padding: 10 }}>Custo/dia</th>
            </tr>
          </thead>
          <tbody>
            {ingredientes.map((item) => {
              const diferenca = item.real - item.previsto;
              const percentual = item.previsto > 0 ? diferenca / item.previsto * 100 : 0;
              const sinal = corErroCarga(percentual);
              const ms = msPorIngrediente.get(item.chave);
              const custo = custoPorIngrediente.get(item.chave);
              return (
                <tr key={item.chave} style={{ borderTop: "1px solid #E8E5DE", textAlign: "right" }}>
                  <td style={{ padding: 10, textAlign: "left", fontWeight: 600 }}>{item.nome}</td>
                  <td style={{ padding: 10 }}>{item.previsto.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg</td>
                  <td style={{ padding: 10 }}>{item.real.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg</td>
                  <td style={{ padding: 10 }}>{diferenca > 0 ? "+" : ""}{diferenca.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg</td>
                  <td style={{ padding: 10 }}>
                    <span style={{ color: sinal.cor, background: sinal.fundo, padding: "4px 7px", borderRadius: 999, fontWeight: 700 }}>
                      {percentual > 0 ? "+" : ""}{percentual.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                    </span>
                  </td>
                  <td style={{ padding: 7 }}>
                    <input type="number" min="0" max="100" step="0.1" defaultValue={Number.isFinite(ms) ? ms : ""}
                      disabled={!onSalvarMs || salvando === item.chave}
                      onBlur={(e) => salvarConfiguracao(item, "ms_percentual", e.target.value)}
                      placeholder="MS"
                      style={{ ...styles.input, width: 72, padding: "6px 7px", textAlign: "right" }} />
                  </td>
                  <td style={{ padding: 10, fontWeight: 600 }}>
                    {Number.isFinite(ms) ? `${(item.real * ms / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg` : "—"}
                  </td>
                  <td style={{ padding: 7 }}>
                    <input type="number" min="0" step="0.001" defaultValue={Number.isFinite(custo) ? custo : ""}
                      disabled={!onSalvarMs || salvando === item.chave}
                      onBlur={(e) => salvarConfiguracao(item, "custo_kg_mn", e.target.value)}
                      placeholder="R$/kg"
                      style={{ ...styles.input, width: 88, padding: "6px 7px", textAlign: "right" }} />
                  </td>
                  <td style={{ padding: 10, fontWeight: 600 }}>
                    {Number.isFinite(custo) ? formatBRL(item.real * custo) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ ...styles.card, marginTop: 12 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>Resultado por carga</div>
        {[...cargasDia]
          .sort((a, b) => (a.data + (a.hora || "")).localeCompare(b.data + (b.hora || "")))
          .map((carga) => {
          const itens = Array.isArray(carga.itens) ? carga.itens : [];
          const previsto = itens.reduce((s, i) => s + Number(i.peso_previsto || 0), 0);
          const erro = previsto > 0
            ? itens.reduce((s, i) => s + Math.abs(Number(i.peso_real || 0) - Number(i.peso_previsto || 0)), 0) / previsto * 100
            : 0;
          const sinal = corErroCarga(erro);
          const custoCarga = itens.reduce((s, item) => {
            const custo = custoPorIngrediente.get(item.ingrediente_chave || chaveIngrediente(item.ingrediente));
            return s + (Number.isFinite(custo) ? Number(item.peso_real || 0) * custo : 0);
          }, 0);
          const cargaComCustoCompleto = itens.every((item) =>
            Number.isFinite(custoPorIngrediente.get(item.ingrediente_chave || chaveIngrediente(item.ingrediente)))
          );
          const custoKgCarga = Number(carga.peso_real || 0) > 0 ? custoCarga / Number(carga.peso_real) : null;
          const cargaComMsCompleta = itens.every((item) =>
            Number.isFinite(msPorIngrediente.get(item.ingrediente_chave || chaveIngrediente(item.ingrediente)))
          );
          const msCarga = cargaComMsCompleta && Number(carga.peso_real || 0) > 0
            ? itens.reduce((soma, item) => {
                const ms = msPorIngrediente.get(item.ingrediente_chave || chaveIngrediente(item.ingrediente));
                return soma + Number(item.peso_real || 0) * ms;
              }, 0) / Number(carga.peso_real)
            : null;
          const chaveCarga = carga.id || carga.carga_codigo;
          const expandida = cargaExpandida === chaveCarga;
          return (
            <div key={chaveCarga} style={{ borderTop: "1px solid #ECE9E2", display: "flex", alignItems: "center", gap: 4 }}>
              <button type="button" aria-expanded={expandida} onClick={() => setCargaExpandida(expandida ? null : chaveCarga)}
                style={{ flex: 1, minWidth: 0, border: 0, background: "transparent", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 0", cursor: "pointer", textAlign: "left", color: "inherit" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {expandida ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                  <div>
                    <div style={{ fontWeight: 600 }}>Carga {carga.carga_codigo} · {carga.receita}</div>
                    <div style={{ fontSize: 11.5, color: "#777770" }}>
                      {modo === "periodo" ? `${formatDataBR(carga.data)} · ` : ""}
                      {carga.hora || "Horário não informado"} · {Number(carga.peso_real || 0).toLocaleString("pt-BR")} kg
                      {msCarga != null ? ` · MS ${msCarga.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : " · MS incompleta"}
                      {cargaComCustoCompleto && custoKgCarga != null ? ` · ${formatBRL(custoCarga)} · ${formatBRL(custoKgCarga)}/kg dieta` : ""}
                    </div>
                  </div>
                </div>
                <span style={{ color: sinal.cor, background: sinal.fundo, padding: "5px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                  erro {erro.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                </span>
              </button>
              {onExcluirCarga && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Excluir a carga ${carga.carga_codigo}? Essa ação não pode ser desfeita.`)) onExcluirCarga(carga.id);
                  }}
                  style={{ background: "transparent", border: "none", color: "#B8763E", cursor: "pointer", padding: 4, display: "flex", flexShrink: 0 }}
                >
                  <Trash2 size={14} />
                </button>
              )}
              {expandida && (
                <div style={{ overflowX: "auto", padding: "0 0 10px 25px" }}>
                  <table style={{ width: "100%", minWidth: 540, borderCollapse: "collapse", fontSize: 11.5 }}>
                    <thead>
                      <tr style={{ color: "#777770", textAlign: "right" }}>
                        <th style={{ padding: "6px 8px", textAlign: "left" }}>Ingrediente</th>
                        <th style={{ padding: "6px 8px" }}>Previsto</th>
                        <th style={{ padding: "6px 8px" }}>Realizado</th>
                        <th style={{ padding: "6px 8px" }}>Erro kg</th>
                        <th style={{ padding: "6px 8px" }}>Erro %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map((item) => {
                        const diferenca = Number(item.peso_real || 0) - Number(item.peso_previsto || 0);
                        const percentual = Number(item.peso_previsto || 0) > 0 ? diferenca / Number(item.peso_previsto) * 100 : 0;
                        const cor = corErroCarga(percentual);
                        return (
                          <tr key={item.ingrediente_chave || item.ingrediente} style={{ borderTop: "1px solid #F0EEE9", textAlign: "right" }}>
                            <td style={{ padding: "7px 8px", textAlign: "left", fontWeight: 600 }}>{item.ingrediente}</td>
                            <td style={{ padding: "7px 8px" }}>{Number(item.peso_previsto || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg</td>
                            <td style={{ padding: "7px 8px" }}>{Number(item.peso_real || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg</td>
                            <td style={{ padding: "7px 8px" }}>{diferenca > 0 ? "+" : ""}{diferenca.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg</td>
                            <td style={{ padding: "7px 8px", color: cor.cor, fontWeight: 700 }}>{percentual > 0 ? "+" : ""}{percentual.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
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
      const XLSX = await carregarLeitorExcel();
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
      <div className="desktop-graphs-grid">
      {comDados.map(({ lote, pontosPV, svgId }) => (
        <div key={lote.id} style={{ marginBottom: 26 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, margin: "0 4px 10px" }}>{lote.nome}</div>
          <div style={{ ...styles.sectionTitle, margin: "0 4px 6px" }}>Consumo de MS em relação ao peso vivo (%)</div>
          {pontosPV.length > 1 ? (
            <GraficoLinha
              pontos={pontosPV}
              valueKey="percentualPV"
              unidade="%"
              cor="#1F4D45"
              tendencia
              gradeDetalhada
              consultaPorDia
              id={svgId}
            />
          ) : (
            <EmptyHint text="Falta a % de MS em pelo menos 2 lançamentos para montar este gráfico." />
          )}
        </div>
      ))}
      </div>
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
      <LegendaAjustesCocho />
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

function LegendaAjustesCocho() {
  return (
    <div className="cocho-legend">
      <div className="cocho-legend-title">Como a nota altera o próximo trato</div>
      <div className="cocho-legend-grid">
        {NOTAS_LEITURA_COCHO.map(({ nota, ajuste }) => {
          const tipo = ajuste > 0 ? "increase" : ajuste < 0 ? "decrease" : "keep";
          return (
            <div key={nota} className={`cocho-legend-item cocho-legend-${tipo}`}>
              <strong>Nota {nota > 0 ? `+${nota}` : nota}</strong>
              <span>
                {ajuste > 0 ? "↑" : ajuste < 0 ? "↓" : "＝"} {ajuste > 0 ? "+" : ""}
                {ajuste}% comida
              </span>
            </div>
          );
        })}
      </div>
      <div className="cocho-legend-help">
        Nota negativa aumenta · Nota positiva diminui · Nota 0 mantém
      </div>
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
