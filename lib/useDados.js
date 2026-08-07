"use client";

// ============================================================
// useDados: hook central que decide de onde ler/gravar
//
// Regra simples:
// - LEITURA: tenta o Supabase; se falhar (sem internet), usa o IndexedDB
// - CLIENTES e VISITAS: sempre tenta gravar direto no Supabase
//   (são leves e raramente criados em campo sem sinal)
// - RELATÓRIOS: SEMPRE grava primeiro no IndexedDB (fonte da verdade
//   imediata) e tenta sincronizar na hora; se não conseguir, fica
//   pendente até a sincronização automática
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";
import {
  salvarClientesLocal, listarClientesLocal,
  salvarVisitasLocal, listarVisitasLocal,
  salvarRelatorioLocal, listarRelatoriosLocal, excluirRelatorioLocal,
  gerarIdLocal,
} from "./db";
import { sincronizarRelatoriosPendentes } from "./sync";
import { sincronizarCriacaoVisita, sincronizarAtualizacaoVisita, sincronizarExclusaoVisita } from "./googleSync";

export function useDados(consultorId) {
  const [clientes, setClientes] = useState([]);
  const [visitas, setVisitas] = useState([]);
  const [relatorios, setRelatorios] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [dietas, setDietas] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const carregarTudo = useCallback(async () => {
    if (!consultorId) return;
    setCarregando(true);

    // Clientes
    try {
      const { data, error } = await supabase.from("clientes").select("*").eq("consultor_id", consultorId);
      if (error) throw error;
      setClientes(data);
      await salvarClientesLocal(data);
    } catch {
      setClientes(await listarClientesLocal());
    }

    // Visitas
    try {
      const { data, error } = await supabase.from("visitas").select("*").eq("consultor_id", consultorId);
      if (error) throw error;
      setVisitas(data);
      await salvarVisitasLocal(data);
    } catch {
      setVisitas(await listarVisitasLocal());
    }

    // Relatórios: sempre soma o que está no servidor + o que está
    // pendente localmente (para não "desaparecer" um relatório
    // feito offline que ainda não subiu)
    let relatoriosServidor = [];
    try {
      const { data, error } = await supabase.from("relatorios").select("*").eq("consultor_id", consultorId);
      if (error) throw error;
      relatoriosServidor = data.map((r) => ({ ...r, sincronizado: true }));
    } catch {
      // sem internet: ignora, usa só o que tem local
    }
    const locais = await listarRelatoriosLocal();
    const idsServidor = new Set(relatoriosServidor.map((r) => r.client_uuid).filter(Boolean));
    const locaisNaoDuplicados = locais.filter((r) => !idsServidor.has(r.client_uuid));
    setRelatorios([...relatoriosServidor, ...locaisNaoDuplicados]);

    // Despesas
    try {
      const { data, error } = await supabase.from("despesas").select("*").eq("consultor_id", consultorId);
      if (error) throw error;
      setDespesas(data);
    } catch {
      // sem internet: mantém o que já estava carregado em memória
    }

    // Dietas
    try {
      const { data, error } = await supabase.from("dietas").select("*").eq("consultor_id", consultorId);
      if (error) throw error;
      setDietas(data);
    } catch {
      // sem internet: mantém o que já estava carregado em memória
    }

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
  // junto as visitas e relatórios dele automaticamente.
  async function excluirCliente(clienteId) {
    const { error } = await supabase.from("clientes").delete().eq("id", clienteId);
    if (error) throw error;
    setClientes((cs) => cs.filter((c) => c.id !== clienteId));
    setVisitas((vs) => vs.filter((v) => v.cliente_id !== clienteId));
    setRelatorios((rs) => rs.filter((r) => r.cliente_id !== clienteId));
  }

  // ---------- Visitas ----------
  async function adicionarVisita(dados) {
    const { data, error } = await supabase
      .from("visitas")
      .insert({ ...dados, consultor_id: consultorId, status: "agendada" })
      .select()
      .single();
    if (error) throw error;
    setVisitas((vs) => [...vs, data]);

    const cliente = clientes.find((c) => c.id === data.cliente_id);
    sincronizarCriacaoVisita(consultorId, data, cliente?.nome || "Cliente");

    return data;
  }

  async function atualizarVisita(visitaId, dados) {
    const { data, error } = await supabase
      .from("visitas")
      .update(dados)
      .eq("id", visitaId)
      .select()
      .single();
    if (error) throw error;
    setVisitas((vs) => vs.map((v) => (v.id === visitaId ? data : v)));

    const cliente = clientes.find((c) => c.id === data.cliente_id);
    sincronizarAtualizacaoVisita(consultorId, data, cliente?.nome || "Cliente");

    return data;
  }

  async function excluirVisita(visitaId) {
    const visita = visitas.find((v) => v.id === visitaId);
    const { error } = await supabase.from("visitas").delete().eq("id", visitaId);
    if (error) throw error;
    setVisitas((vs) => vs.filter((v) => v.id !== visitaId));

    if (visita?.google_event_id) {
      sincronizarExclusaoVisita(consultorId, visita);
    }
  }

  // ---------- Relatórios (offline-first) ----------
  async function salvarRelatorio(dados) {
    // client_uuid é a chave estável: se o relatório já existe (veio do
    // servidor ou já foi salvo local antes), reaproveita; senão, gera uma nova.
    const client_uuid = dados.client_uuid || gerarIdLocal();
    const registro = { ...dados, client_uuid, consultor_id: consultorId };

    // 1. Sempre grava local primeiro (garante que nunca se perde)
    const salvoLocal = await salvarRelatorioLocal(registro);

    setRelatorios((rs) => {
      const chave = (r) => r.client_uuid || r.id;
      const existe = rs.some((r) => chave(r) === client_uuid || r.id === dados.id);
      return existe
        ? rs.map((r) => (chave(r) === client_uuid || r.id === dados.id ? salvoLocal : r))
        : [...rs, salvoLocal];
    });

    // 2. Tenta sincronizar imediatamente (se tiver internet, sobe na hora)
    sincronizarRelatoriosPendentes(consultorId).then(() => carregarTudo());

    return salvoLocal;
  }

  // Ao editar pagamento de um relatório que já existe (no servidor ou
  // localmente), apenas reenviamos o registro com a mudança — o
  // client_uuid e o id (se houver) já estão preservados no objeto.
  async function marcarPago(relatorio, pago) {
    return salvarRelatorio({ ...relatorio, pago });
  }

  // Apaga tanto do servidor (se já sincronizado) quanto do IndexedDB local
  // (se estava salvo lá) — o relatório pode existir em um, no outro, ou nos dois.
  async function excluirRelatorio(relatorio) {
    if (relatorio.id) {
      const { error } = await supabase.from("relatorios").delete().eq("id", relatorio.id);
      if (error) throw error;
    }
    if (relatorio.client_uuid) {
      await excluirRelatorioLocal(relatorio.client_uuid);
    }
    const chave = (r) => r.id || r.client_uuid;
    setRelatorios((rs) => rs.filter((r) => chave(r) !== chave(relatorio)));
  }

  // ---------- Despesas ----------
  async function adicionarDespesa(dados) {
    const { data, error } = await supabase
      .from("despesas")
      .insert({ ...dados, consultor_id: consultorId, client_uuid: gerarIdLocal() })
      .select()
      .single();
    if (error) throw error;
    setDespesas((ds) => [...ds, data]);
    return data;
  }

  async function atualizarDespesa(despesaId, dados) {
    const { data, error } = await supabase
      .from("despesas")
      .update(dados)
      .eq("id", despesaId)
      .select()
      .single();
    if (error) throw error;
    setDespesas((ds) => ds.map((d) => (d.id === despesaId ? data : d)));
    return data;
  }

  async function excluirDespesa(despesaId) {
    const { error } = await supabase.from("despesas").delete().eq("id", despesaId);
    if (error) throw error;
    setDespesas((ds) => ds.filter((d) => d.id !== despesaId));
  }

  // ---------- Dietas ----------
  async function adicionarDieta(dados) {
    const { data, error } = await supabase
      .from("dietas")
      .insert({ ...dados, consultor_id: consultorId })
      .select()
      .single();
    if (error) throw error;
    setDietas((ds) => [...ds, data]);
    return data;
  }

  async function atualizarDieta(dietaId, dados) {
    const { data, error } = await supabase
      .from("dietas")
      .update(dados)
      .eq("id", dietaId)
      .select()
      .single();
    if (error) throw error;
    setDietas((ds) => ds.map((d) => (d.id === dietaId ? data : d)));
    return data;
  }

  async function excluirDieta(dietaId) {
    const { error } = await supabase.from("dietas").delete().eq("id", dietaId);
    if (error) throw error;
    setDietas((ds) => ds.filter((d) => d.id !== dietaId));
  }

  return {
    clientes, visitas, relatorios, despesas, dietas, carregando,
    adicionarCliente, atualizarCliente, excluirCliente, adicionarVisita, atualizarVisita, excluirVisita, salvarRelatorio, marcarPago, excluirRelatorio,
    adicionarDespesa, atualizarDespesa, excluirDespesa,
    adicionarDieta, atualizarDieta, excluirDieta,
    recarregar: carregarTudo,
  };
}
