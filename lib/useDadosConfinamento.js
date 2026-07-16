"use client";

// ============================================================
// useDadosConfinamento: hook central de dados deste app —
// clientes, lotes de confinamento, pesagens e consumos.
// Sempre lê/grava direto no Supabase (sem modo offline: nenhum
// desses dados precisa ser criado em campo sem sinal).
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";

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
  const [leiturasCocho, setLeiturasCocho] = useState([]);
  const [clientesUsuarios, setClientesUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const carregarTudo = useCallback(async () => {
    if (!consultorId) return;
    setCarregando(true);

    setClientes(await buscarTodasLinhas("clientes", consultorId));
    setLotes(await buscarTodasLinhas("lotes_confinamento", consultorId));
    setPesagens(await buscarTodasLinhas("pesagens_lote", consultorId));
    setConsumos(await buscarTodasLinhas("consumos_lote", consultorId));
    setLeiturasCocho(await buscarTodasLinhas("leituras_cocho", consultorId));
    setClientesUsuarios(await buscarTodasLinhas("clientes_usuarios", consultorId));

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
    setLeiturasCocho((ls) => ls.filter((l) => !loteIdsDoCliente.has(l.lote_id)));
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
    setLeiturasCocho((ls) => ls.filter((l) => l.lote_id !== loteId));
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

  // ---------- Acesso de clientes (várias pessoas por fazenda) ----------
  async function excluirAcessoCliente(clienteUsuarioId) {
    const { error } = await supabase.from("clientes_usuarios").delete().eq("id", clienteUsuarioId);
    if (error) throw error;
    setClientesUsuarios((cus) => cus.filter((cu) => cu.id !== clienteUsuarioId));
  }

  return {
    clientes, lotes, pesagens, consumos, leiturasCocho, clientesUsuarios, carregando,
    adicionarCliente, atualizarCliente, excluirCliente,
    adicionarLote, atualizarLote, excluirLote,
    adicionarPesagem, excluirPesagem,
    adicionarConsumo, atualizarConsumo, excluirConsumo,
    registrarLeituraCocho,
    excluirAcessoCliente,
    recarregar: carregarTudo,
  };
}
