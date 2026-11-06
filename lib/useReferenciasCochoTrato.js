"use client";
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { buscarTodasPaginas } from './paginacao.mjs';

// Somente leitura: a fonte dos limites é o cadastro de dietas do Trato Certo.
export function useReferenciasCochoTrato(clienteId) {
  const [estado, setEstado] = useState({ clienteId: null, receitas: [], vinculos: [], aviso: '', carregando: true });
  useEffect(() => {
    if (!clienteId) return;
    let encerrado = false;
    let emAndamento = false;
    let receitas = [];
    let vinculos = [];
    const cache = `cocho-referencias-trato-v2:${clienteId}`;
    try {
      const salvo = JSON.parse(localStorage.getItem(cache) || 'null');
      if (Array.isArray(salvo?.receitas)) receitas = salvo.receitas.filter((r) => r.cliente_id === clienteId);
      if (Array.isArray(salvo?.vinculos)) vinculos = salvo.vinculos.filter((r) => r.cliente_id === clienteId);
    } catch { /* Cache opcional; a consulta autenticada é a referência principal. */ }
    setEstado({ clienteId, receitas, vinculos, aviso: receitas.length ? 'Atualizando dados da dieta do Trato Certo…' : '', carregando: true });
    async function carregar() {
      if (emAndamento || document.visibilityState === 'hidden') return;
      emAndamento = true;
      try {
        const [atuais, status] = await Promise.all([
          buscarTodasPaginas(() => supabase.from('trato_dietas')
            .select('id,cliente_id,nome,tipo_receita,ingredientes,consumo_ms_pv_min,consumo_ms_pv_max').eq('cliente_id', clienteId)),
          // RPC existente autoriza consultor, titular da fazenda e usuários vinculados.
          // Retorna também os vínculos das dietas com garantia mínima desligada.
          supabase.rpc('trato_consumo_minimo_status', { p_cliente_id: clienteId }),
        ]);
        if (encerrado) return;
        if (status.error) throw status.error;
        if (!Array.isArray(status.data)) throw new Error("Vínculos de dieta indisponíveis");
        receitas = atuais;
        vinculos = status.data.filter((c) => typeof c.lote_id === 'string' && typeof c.dieta_id === 'string').map((c) => ({ lote_id: c.lote_id, dieta_id: c.dieta_id, cliente_id: clienteId }));
        setEstado({ clienteId, receitas, vinculos, aviso: '', carregando: false });
        try { localStorage.setItem(cache, JSON.stringify({ receitas, vinculos })); } catch { /* Não impede leitura. */ }
      } catch {
        if (!encerrado) setEstado({ clienteId, receitas, vinculos, carregando: false, aviso: receitas.length
          ? 'Não foi possível atualizar as dietas. Usando a última referência salva neste aparelho.'
          : 'Não foi possível carregar os dados das dietas do Trato Certo. Previsões e alertas indisponíveis.' });
      } finally { emAndamento = false; }
    }
    carregar();
    const intervalo = setInterval(carregar, 60000);
    window.addEventListener('focus', carregar);
    document.addEventListener('visibilitychange', carregar);
    return () => {
      encerrado = true;
      clearInterval(intervalo);
      window.removeEventListener('focus', carregar);
      document.removeEventListener('visibilitychange', carregar);
    };
  }, [clienteId]);
  return estado.clienteId === clienteId ? estado : { receitas: [], vinculos: [], aviso: '', carregando: Boolean(clienteId) };
}
