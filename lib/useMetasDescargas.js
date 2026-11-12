"use client";
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { loadDailyTargets } from './daily-targets.mjs';

// Consulta autenticada e só de leitura. Estado antigo nunca atravessa fazendas.
export function useMetasDescargas(clienteId, cargas, inicio, fim) {
  const [estado, setEstado] = useState(null);
  useEffect(() => {
    if (!clienteId) return;
    let cancelado = false;
    setEstado({ clienteId, cargas, inicio, fim, metas: [], carregando: true, erro: '' });
    const noPeriodo = data => typeof data === 'string' && data >= inicio && data <= fim;
    const selecionadas = cargas.filter(c => c.cliente_id === clienteId).map(c => ({
      data: noPeriodo(c.data) ? c.data : undefined,
      descargas: (Array.isArray(c.descargas) ? c.descargas : [])
        .map(d => ({ data: d.data || c.data })).filter(d => noPeriodo(d.data)),
    }));
    loadDailyTargets(supabase, clienteId, selecionadas)
      .then(metas => { if (!cancelado) setEstado({ clienteId, cargas, inicio, fim, metas, carregando: false, erro: '' }); })
      .catch(() => { if (!cancelado) setEstado({ clienteId, cargas, inicio, fim, metas: [], carregando: false,
        erro: 'Não foi possível consultar as metas originais do Trato. Os valores abaixo usam apenas os registros disponíveis. Atualize para tentar novamente.' }); });
    return () => { cancelado = true; };
  }, [clienteId, cargas, inicio, fim]);
  return estado?.clienteId === clienteId && estado?.cargas === cargas && estado?.inicio === inicio && estado?.fim === fim ? estado
    : { metas: [], carregando: Boolean(clienteId), erro: '' };
}
