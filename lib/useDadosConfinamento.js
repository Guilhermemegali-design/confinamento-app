"use client";

// ============================================================
// useDadosConfinamento: hook central de dados deste app —
// clientes, lotes de confinamento, pesagens e consumos.
// Sempre lê/grava direto no Supabase (sem modo offline: nenhum
// desses dados precisa ser criado em campo sem sinal).
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";
import { calcularResumoSaidas } from "./confinamento";

// PostgREST corta em 1000 linhas por padrão qualquer select sem .range() —
// com consumo lançado todo dia por lote, essa tabela passa disso rápido e
// linhas somem silenciosamente (não necessariamente as mais antigas).
async function buscarTodasLinhas(tabela, consultorId) {
  const TAMANHO_PAGINA = 1000;
  let todasLinhas = [];
  let inicio = 0;
  while (true) {
    const { data, error } = await supabase
      .from(tabela)
      .select("*")
      .eq("consultor_id", consultorId)
      .range(inicio, inicio + TAMANHO_PAGINA - 1);
    if (error) throw error;
    todasLinhas = todasLinhas.concat(data || []);
    if (!data || data.length < TAMANHO_PAGINA) break;
    inicio += TAMANHO_PAGINA;
  }
  return todasLinhas;
}

export function useDadosConfinamento(consultorId) {
  const [clientes, setClientes] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [pesagens, setPesagens] = useState([]);
  const [consumos, setConsumos] = useState([]);
  const [saidas, setSaidas] = useState([]);
  const [leiturasCocho, setLeiturasCocho] = useState([]);
  const [clientesUsuarios, setClientesUsuarios] = useState([]);
  const [currais, setCurrais] = useState([]);
  const [curralOcupacoes, setCurralOcupacoes] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const carregarTudo = useCallback(async () => {
    if (!consultorId) return;
    setCarregando(true);

    setClientes(await buscarTodasLinhas("clientes", consultorId));
    setLotes(await buscarTodasLinhas("lotes_confinamento", consultorId));
    setPesagens(await buscarTodasLinhas("pesagens_lote", consultorId));
    setConsumos(await buscarTodasLinhas("consumos_lote", consultorId));
    setSaidas(await buscarTodasLinhas("saidas_lote", consultorId));
    setLeiturasCocho(await buscarTodasLinhas("leituras_cocho", consultorId));
    setClientesUsuarios(await buscarTodasLinhas("clientes_usuarios", consultorId));
    setCurrais(await buscarTodasLinhas("currais", consultorId));
    setCurralOcupacoes(await buscarTodasLinhas("curral_ocupacoes", consultorId));

    setCarregando(false);
  }, [consultorId]);

  useEffect(() => {
    carregarTudo();
  }, [carregarTudo]);

  // ---------- Clientes ----------
  async function adicionarCliente(dados) {
    const { data, error } = await supabase
      .from("clientes")
      .insert({ ...dados, consultor_id: consultorId })
      .select()
      .single();
    if (error) throw error;
    setClientes((cs) => [...cs, data]);
    return data;
  }

  async function atualizarCliente(clienteId, dados) {
    const { data, error } = await supabase
      .from("clientes")
      .update(dados)
      .eq("id", clienteId)
      .select()
      .single();
    if (error) throw error;
    setClientes((cs) => cs.map((c) => (c.id === clienteId ? data : c)));
    return data;
  }

  // Exclui o cliente e, por causa do "on delete cascade" no banco, apaga
  // junto os lotes, pesagens e consumos dele automaticamente.
  async function excluirCliente(clienteId) {
    const loteIdsDoCliente = new Set(lotes.filter((l) => l.cliente_id === clienteId).map((l) => l.id));
    const { error } = await supabase.from("clientes").delete().eq("id", clienteId);
    if (error) throw error;
    setClientes((cs) => cs.filter((c) => c.id !== clienteId));
    setLotes((ls) => ls.filter((l) => l.cliente_id !== clienteId));
    setPesagens((ps) => ps.filter((p) => !loteIdsDoCliente.has(p.lote_id)));
    setConsumos((cs) => cs.filter((c) => !loteIdsDoCliente.has(c.lote_id)));
    setSaidas((ss) => ss.filter((s) => !loteIdsDoCliente.has(s.lote_id)));
    setLeiturasCocho((ls) => ls.filter((l) => !loteIdsDoCliente.has(l.lote_id)));
    const curralIdsDoCliente = new Set(currais.filter((c) => c.cliente_id === clienteId).map((c) => c.id));
    setCurrais((cs) => cs.filter((c) => c.cliente_id !== clienteId));
    setCurralOcupacoes((os) => os.filter((o) => !curralIdsDoCliente.has(o.curral_id)));
  }

  // ---------- Lotes de confinamento ----------
  async function adicionarLote(clienteId, dados) {
    const { data, error } = await supabase
      .from("lotes_confinamento")
      .insert({ ...dados, cliente_id: clienteId, consultor_id: consultorId })
      .select()
      .single();
    if (error) throw error;
    setLotes((ls) => [...ls, data]);
    return data;
  }

  async function atualizarLote(loteId, dados) {
    const { data, error } = await supabase
      .from("lotes_confinamento")
      .update(dados)
      .eq("id", loteId)
      .select()
      .single();
    if (error) throw error;
    setLotes((ls) => ls.map((l) => (l.id === loteId ? data : l)));
    return data;
  }

  async function excluirLote(loteId) {
    const { error } = await supabase.from("lotes_confinamento").delete().eq("id", loteId);
    if (error) throw error;
    setLotes((ls) => ls.filter((l) => l.id !== loteId));
    setPesagens((ps) => ps.filter((p) => p.lote_id !== loteId));
    setConsumos((cs) => cs.filter((c) => c.lote_id !== loteId));
    setSaidas((ss) => ss.filter((s) => s.lote_id !== loteId));
    setLeiturasCocho((ls) => ls.filter((l) => l.lote_id !== loteId));
    setCurralOcupacoes((os) => os.filter((o) => o.lote_id !== loteId));
  }

  // ---------- Pesagens ----------
  async function adicionarPesagem(loteId, dados) {
    const { data, error } = await supabase
      .from("pesagens_lote")
      .insert({ ...dados, lote_id: loteId, consultor_id: consultorId })
      .select()
      .single();
    if (error) throw error;
    setPesagens((ps) => [...ps, data]);
    return data;
  }

  async function excluirPesagem(pesagemId) {
    const { error } = await supabase.from("pesagens_lote").delete().eq("id", pesagemId);
    if (error) throw error;
    setPesagens((ps) => ps.filter((p) => p.id !== pesagemId));
  }

  // ---------- Saídas parciais (lote que vai esvaziando aos poucos) ----------
  // Depois de gravar a saída, confere se aquilo já esvaziou o lote inteiro —
  // se sim, preenche data_saida/peso_saida_vivo do lote automaticamente (data
  // da última saída, peso médio ponderado pelas cabeças de cada saída), pra
  // ele passar a aparecer em "Lotes finalizados" sem precisar editar o lote
  // à mão. Se uma saída for excluída e isso reabrir o lote (ainda restam
  // cabeças), desfaz esse preenchimento.
  async function sincronizarFinalizacaoLote(loteId, saidasDoLote) {
    const lote = lotes.find((l) => l.id === loteId);
    if (!lote) return;
    const { finalizadoPorSaidas, dataSaidaCalculada, pesoSaidaVivoCalculado } = calcularResumoSaidas(lote, saidasDoLote);
    const dataSaidaAlvo = finalizadoPorSaidas ? dataSaidaCalculada : null;
    const pesoSaidaAlvo = finalizadoPorSaidas ? pesoSaidaVivoCalculado : null;
    const dataMudou = (lote.data_saida || null) !== dataSaidaAlvo;
    const pesoMudou = Number(lote.peso_saida_vivo || 0) !== Number(pesoSaidaAlvo || 0);
    if (dataMudou || pesoMudou) {
      await atualizarLote(loteId, { data_saida: dataSaidaAlvo, peso_saida_vivo: pesoSaidaAlvo });
    }
  }

  async function adicionarSaida(loteId, dados) {
    const { data, error } = await supabase
      .from("saidas_lote")
      .insert({ ...dados, lote_id: loteId, consultor_id: consultorId })
      .select()
      .single();
    if (error) throw error;
    const novasSaidas = [...saidas, data];
    setSaidas(novasSaidas);
    await sincronizarFinalizacaoLote(loteId, novasSaidas.filter((s) => s.lote_id === loteId));
    return data;
  }

  async function excluirSaida(saidaId) {
    const saida = saidas.find((s) => s.id === saidaId);
    const { error } = await supabase.from("saidas_lote").delete().eq("id", saidaId);
    if (error) throw error;
    const restantes = saidas.filter((s) => s.id !== saidaId);
    setSaidas(restantes);
    if (saida) await sincronizarFinalizacaoLote(saida.lote_id, restantes.filter((s) => s.lote_id === saida.lote_id));
  }

  // ---------- Consumos ----------
  async function adicionarConsumo(loteId, dados) {
    const { data, error } = await supabase
      .from("consumos_lote")
      .insert({ ...dados, lote_id: loteId, consultor_id: consultorId })
      .select()
      .single();
    if (error) throw error;
    setConsumos((cs) => [...cs, data]);
    return data;
  }

  async function atualizarConsumo(consumoId, dados) {
    const { data, error } = await supabase
      .from("consumos_lote")
      .update(dados)
      .eq("id", consumoId)
      .select()
      .single();
    if (error) throw error;
    setConsumos((cs) => cs.map((c) => (c.id === consumoId ? data : c)));
    return data;
  }

  async function excluirConsumo(consumoId) {
    const { error } = await supabase.from("consumos_lote").delete().eq("id", consumoId);
    if (error) throw error;
    setConsumos((cs) => cs.filter((c) => c.id !== consumoId));
  }

  // Importação de planilha: insere tudo numa única chamada em vez de uma
  // requisição por linha (uma importação real tem centenas de lançamentos).
  async function importarConsumosEmLote(linhas) {
    if (linhas.length === 0) return [];
    const paraInserir = linhas.map((l) => ({ ...l, consultor_id: consultorId }));
    const { data, error } = await supabase.from("consumos_lote").insert(paraInserir).select();
    if (error) throw error;
    setConsumos((cs) => [...cs, ...(data || [])]);
    return data;
  }

  // ---------- Leitura de cocho ----------
  // Upsert: uma leitura por lote/dia — clicar em outra nota no mesmo dia
  // substitui a anterior (corrige clique errado sem precisar excluir).
  async function registrarLeituraCocho(loteId, dados) {
    const { data, error } = await supabase
      .from("leituras_cocho")
      .upsert({ ...dados, lote_id: loteId, consultor_id: consultorId }, { onConflict: "lote_id,data" })
      .select()
      .single();
    if (error) throw error;
    setLeiturasCocho((ls) => {
      const existe = ls.some((l) => l.lote_id === loteId && l.data === data.data);
      return existe ? ls.map((l) => (l.lote_id === loteId && l.data === data.data ? data : l)) : [...ls, data];
    });
    return data;
  }

  // Importação de planilha: insere tudo numa única chamada (mesmo padrão de
  // importarConsumosEmLote) — as linhas já vêm sem duplicar leituras
  // existentes (filtradas antes, na tela de importação).
  async function importarLeiturasCochoEmLote(linhas) {
    if (linhas.length === 0) return [];
    const paraInserir = linhas.map((l) => ({ ...l, consultor_id: consultorId }));
    const { data, error } = await supabase.from("leituras_cocho").insert(paraInserir).select();
    if (error) throw error;
    setLeiturasCocho((ls) => [...ls, ...(data || [])]);
    return data;
  }

  // ---------- Currais (mapa do confinamento) ----------
  async function adicionarCurral(clienteId, dados) {
    const { data, error } = await supabase
      .from("currais")
      .insert({ ...dados, cliente_id: clienteId, consultor_id: consultorId })
      .select()
      .single();
    if (error) throw error;
    setCurrais((cs) => [...cs, data]);
    return data;
  }

  async function atualizarCurral(curralId, dados) {
    const { data, error } = await supabase
      .from("currais")
      .update(dados)
      .eq("id", curralId)
      .select()
      .single();
    if (error) throw error;
    setCurrais((cs) => cs.map((c) => (c.id === curralId ? data : c)));
    return data;
  }

  // Excluir um curral não exclui o lote que estava nele — o lote só fica
  // sem curral (curral_id vira null via "on delete set null" no banco). O
  // histórico de ocupação desse curral é excluído junto (cascade no banco).
  async function excluirCurral(curralId) {
    const { error } = await supabase.from("currais").delete().eq("id", curralId);
    if (error) throw error;
    setCurrais((cs) => cs.filter((c) => c.id !== curralId));
    setLotes((ls) => ls.map((l) => (l.curral_id === curralId ? { ...l, curral_id: null } : l)));
    setCurralOcupacoes((os) => os.filter((o) => o.curral_id !== curralId));
  }

  // Move um lote pra outro curral (ou pra "sem curral", se novoCurralId for
  // null): fecha a ocupação anterior (data_fim = hoje) se tinha, abre uma
  // nova ocupação se for pra algum curral, e só então atualiza o
  // curral_id do lote — dá pra ver depois quem já passou por cada curral,
  // não só quem está lá agora.
  async function moverLoteParaCurral(loteId, novoCurralId, curralAnteriorId) {
    const hoje = new Date().toISOString().slice(0, 10);
    if (curralAnteriorId) {
      const { data: fechadas, error: erroFechar } = await supabase
        .from("curral_ocupacoes")
        .update({ data_fim: hoje })
        .eq("curral_id", curralAnteriorId)
        .eq("lote_id", loteId)
        .is("data_fim", null)
        .select();
      if (erroFechar) throw erroFechar;
      if (fechadas?.length) {
        setCurralOcupacoes((os) => os.map((o) => fechadas.find((f) => f.id === o.id) || o));
      }
    }
    if (novoCurralId) {
      const { data: nova, error: erroAbrir } = await supabase
        .from("curral_ocupacoes")
        .insert({ curral_id: novoCurralId, lote_id: loteId, consultor_id: consultorId, data_inicio: hoje })
        .select()
        .single();
      if (erroAbrir) throw erroAbrir;
      setCurralOcupacoes((os) => [...os, nova]);
    }
    return atualizarLote(loteId, { curral_id: novoCurralId });
  }

  // Importação de KML: cria vários currais de uma vez (um único INSERT em
  // array em vez de um por curral — um KML real pode trazer dezenas deles).
  async function importarCurraisEmLote(clienteId, linhas) {
    if (linhas.length === 0) return [];
    const paraInserir = linhas.map((l) => ({ ...l, cliente_id: clienteId, consultor_id: consultorId }));
    const { data, error } = await supabase.from("currais").insert(paraInserir).select();
    if (error) throw error;
    setCurrais((cs) => [...cs, ...(data || [])]);
    return data;
  }

  // ---------- Acesso de clientes (várias pessoas por fazenda) ----------
  async function excluirAcessoCliente(clienteUsuarioId) {
    const { error } = await supabase.from("clientes_usuarios").delete().eq("id", clienteUsuarioId);
    if (error) throw error;
    setClientesUsuarios((cus) => cus.filter((cu) => cu.id !== clienteUsuarioId));
  }

  return {
    clientes, lotes, pesagens, consumos, saidas, leiturasCocho, clientesUsuarios, currais, curralOcupacoes, carregando,
    adicionarCliente, atualizarCliente, excluirCliente,
    adicionarLote, atualizarLote, excluirLote,
    adicionarPesagem, excluirPesagem,
    adicionarSaida, excluirSaida,
    adicionarConsumo, atualizarConsumo, excluirConsumo, importarConsumosEmLote,
    registrarLeituraCocho, importarLeiturasCochoEmLote,
    excluirAcessoCliente,
    adicionarCurral, atualizarCurral, excluirCurral, importarCurraisEmLote, moverLoteParaCurral,
    recarregar: carregarTudo,
  };
}
