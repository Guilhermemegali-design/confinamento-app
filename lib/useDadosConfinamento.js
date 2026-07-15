"use client";

// ============================================================
// useDadosConfinamento: hook central de dados deste app —
// clientes, lotes de confinamento, pesagens e consumos.
// Sempre lê/grava direto no Supabase (sem modo offline: nenhum
// desses dados precisa ser criado em campo sem sinal).
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";

export function useDadosConfinamento(consultorId) {
  const [clientes, setClientes] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [pesagens, setPesagens] = useState([]);
  const [consumos, setConsumos] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const carregarTudo = useCallback(async () => {
    if (!consultorId) return;
    setCarregando(true);

    const { data: dadosClientes } = await supabase.from("clientes").select("*").eq("consultor_id", consultorId);
    setClientes(dadosClientes || []);

    const { data: dadosLotes } = await supabase.from("lotes_confinamento").select("*").eq("consultor_id", consultorId);
    setLotes(dadosLotes || []);

    const { data: dadosPesagens } = await supabase.from("pesagens_lote").select("*").eq("consultor_id", consultorId);
    setPesagens(dadosPesagens || []);

    const { data: dadosConsumos } = await supabase.from("consumos_lote").select("*").eq("consultor_id", consultorId);
    setConsumos(dadosConsumos || []);

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

  return {
    clientes, lotes, pesagens, consumos, carregando,
    adicionarCliente, atualizarCliente, excluirCliente,
    adicionarLote, atualizarLote, excluirLote,
    adicionarPesagem, excluirPesagem,
    adicionarConsumo, atualizarConsumo, excluirConsumo,
    recarregar: carregarTudo,
  };
}
