"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import { buscarIngredientesMs } from "./ingredientesMs.mjs";

export function useIngredientesMs(campo, id) {
  const [ingredientesMs, definirIngredientesMs] = useState([]);
  const requisicao = useRef(0);
  const setIngredientesMs = useCallback((valor) => {
    // Uma resposta iniciada antes de uma edição não pode desfazer o que foi salvo.
    requisicao.current += 1;
    definirIngredientesMs(valor);
  }, []);
  const carregarIngredientesMs = useCallback(async () => {
    if (!id) return;
    const atual = ++requisicao.current;
    const linhas = await buscarIngredientesMs(supabase, campo, id);
    if (atual === requisicao.current) definirIngredientesMs(linhas);
    return linhas;
  }, [campo, id]);

  useEffect(() => {
    const atualizar = () => {
      if (document.visibilityState !== "visible") return;
      carregarIngredientesMs().catch((erro) => console.error("Não foi possível atualizar a MS dos ingredientes:", erro));
    };
    window.addEventListener("focus", atualizar);
    document.addEventListener("visibilitychange", atualizar);
    return () => {
      requisicao.current += 1;
      window.removeEventListener("focus", atualizar);
      document.removeEventListener("visibilitychange", atualizar);
    };
  }, [carregarIngredientesMs]);

  return { ingredientesMs, setIngredientesMs, carregarIngredientesMs };
}
