"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { styles } from "@/lib/styles";
import { LogOut, Beef, FileText, KeyRound } from "lucide-react";
import ConfinamentoTab from "@/components/ConfinamentoTab";
import RelatoriosPortalTab from "@/components/RelatoriosPortalTab";
import MarcaDesenvolvedor from "@/components/MarcaDesenvolvedor";
import BotaoAtualizar from "@/components/BotaoAtualizar";
import { BackHeader, InputField, PrimaryButton } from "@/components/UI";
import { buscarTodasPaginas } from "@/lib/paginacao.mjs";
import { calcularResumoSaidas } from "@/lib/confinamento";
import { buscarVinculoPortal, mensagemErroConvite, resgatarConvitePortal } from "@/lib/convitePortal.mjs";
import {
  atualizarLeiturasNoCache,
  carregarCacheCocho,
  carregarLeiturasPendentes,
  criarEscopoCocho,
  erroEhDeRede,
  mesclarLeiturasPendentes,
  removerLeituraPendente,
  salvarCacheCocho,
  salvarLeituraPendente,
  sincronizarLeiturasPendentes,
  substituirLeituraNaLista,
} from "@/lib/leituraCochoOffline";

const CHAVE_PERFIL_PORTAL = "rastro-portal-perfil-v1";

function lerPerfilPortal(userId) {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.localStorage.getItem(`${CHAVE_PERFIL_PORTAL}:${userId}`) || "null");
  } catch {
    return null;
  }
}

function salvarPerfilPortal(userId, perfil) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${CHAVE_PERFIL_PORTAL}:${userId}`, JSON.stringify(perfil));
  } catch (error) {
    console.warn("Não foi possível guardar o acesso offline do portal:", error);
  }
}

// O PostgREST limita cada resposta a 1.000 linhas. Sem paginação, clientes
// com muito histórico deixam de receber parte dos lançamentos mais recentes.
async function buscarTodasLinhasPortal(tabela, coluna, valor) {
  return buscarTodasPaginas(() => {
    const consulta = supabase.from(tabela).select("*");
    return Array.isArray(valor) ? consulta.in(coluna, valor) : consulta.eq(coluna, valor);
  });
}

export default function PortalCliente() {
  const [sessao, setSessao] = useState(undefined);
  const [cliente, setCliente] = useState(undefined);
  const [papel, setPapel] = useState("editor");
  const [erroAcesso, setErroAcesso] = useState("");
  const usuarioId = sessao?.user?.id;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => setSessao(session));
    return () => listener.subscription.unsubscribe();
  }, []);

  const carregarCliente = useCallback(async (clienteId) => {
    if (!usuarioId) return;
    setErroAcesso("");
    setCliente(undefined);
    try {
      const vinculo = await buscarVinculoPortal(supabase, usuarioId, clienteId);
      if (!vinculo) {
        setCliente(null);
        return;
      }
      const papelAtual = vinculo.papel || "editor";
      const { data, error } = await supabase.from("clientes").select("*").eq("id", vinculo.cliente_id).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("O vínculo existe, mas o cadastro do cliente não pôde ser carregado.");
      setPapel(papelAtual);
      setCliente(data || null);
      if (data) salvarPerfilPortal(usuarioId, { cliente: data, papel: papelAtual });
    } catch (error) {
      const perfilSalvo = lerPerfilPortal(usuarioId);
      if (erroEhDeRede(error) && perfilSalvo?.cliente && (!clienteId || perfilSalvo.cliente.id === clienteId)) {
        setPapel(perfilSalvo.papel || "editor");
        setCliente(perfilSalvo.cliente);
      } else {
        setCliente(null);
        setErroAcesso("Não foi possível carregar seu acesso. Confira sua conexão e tente novamente. Não é necessário criar outra conta.");
      }
      console.error("Não foi possível atualizar o acesso do portal:", error);
    }
  }, [usuarioId]);

  useEffect(() => {
    if (usuarioId) carregarCliente();
    else {
      setCliente(undefined);
      setErroAcesso("");
    }
  }, [usuarioId, carregarCliente]);

  async function atualizarMapaCliente(clienteId, mapa) {
    if (papel === "leitor" || clienteId !== cliente?.id) {
      throw new Error("Sem permissão para importar o mapa desta fazenda.");
    }
    const { data, error } = await supabase.rpc("atualizar_mapa_cliente", {
      p_cliente_id: clienteId,
      p_contorno: mapa.mapa_contorno,
      p_centro_lat: mapa.mapa_centro_lat,
      p_centro_lng: mapa.mapa_centro_lng,
    });
    if (error) throw error;
    const clienteAtualizado = { ...cliente, ...data };
    setCliente((atual) => atual?.id === clienteId ? clienteAtualizado : atual);
    salvarPerfilPortal(usuarioId, { cliente: clienteAtualizado, papel });
    return data;
  }

  if (sessao === undefined) return <div style={styles.loadingScreen}>Carregando...</div>;
  if (!sessao) return <TelaLoginCliente />;
  if (erroAcesso) return (
    <div style={styles.loginScreen}>
      <div style={styles.loginCard}>
        <div role="alert" style={styles.errorBox}>{erroAcesso}</div>
        <button type="button" onClick={() => carregarCliente()} style={styles.primaryBtn}>Tentar novamente</button>
        <button type="button" onClick={() => supabase.auth.signOut()} style={styles.linkBtn}>Sair</button>
      </div>
    </div>
  );
  if (cliente === undefined) return <div style={styles.loadingScreen}>Carregando...</div>;
  if (cliente === null) return <TelaVincularConvite onVinculado={carregarCliente} />;
  return <PainelCliente cliente={cliente} somenteLeitura={papel === "leitor"} papel={papel} onAtualizarMapaCliente={atualizarMapaCliente} />;
}

// ---------- Login ----------
function TelaLoginCliente() {
  const [modo, setModo] = useState("login");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [reenviado, setReenviado] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    setReenviado(false);
    setCarregando(true);
    try {
      if (modo === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
      } else {
        // emailRedirectTo garante que o link de confirmação do e-mail volte
        // para o portal do cliente — sem isso, o Supabase usa a "Site URL"
        // padrão do projeto (a raiz do app, que é a tela do consultor), e o
        // cliente cai numa tela dizendo que o acesso é exclusivo dele.
        const { error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: { emailRedirectTo: "https://confinamento-nine.vercel.app/portal" },
        });
        if (error) throw error;
        setErro("Conta criada! Verifique seu e-mail para confirmar o acesso e depois entre novamente.");
      }
    } catch (err) {
      setErro(traduzErro(err.message));
    } finally {
      setCarregando(false);
    }
  }

  async function handleReenviarConfirmacao() {
    setReenviando(true);
    setReenviado(false);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: "https://confinamento-nine.vercel.app/portal" },
      });
      if (error) throw error;
      setReenviado(true);
    } catch (err) {
      setErro(traduzErro(err.message));
    } finally {
      setReenviando(false);
    }
  }

  const precisaConfirmarEmail = erro.includes("confirmar seu e-mail");

  return (
    <div style={styles.loginScreen}>
      <div style={styles.loginCard}>
        <img src="/rastro-logo.png" alt="Rastro Confinamento" style={styles.rastroLoginLogo} />
        <div style={{ fontWeight: 700, fontSize: 15, color: "#1F4D45", textAlign: "center", marginTop: 8 }}>Portal do Cliente</div>
        <div style={styles.loginSub}>{modo === "login" ? "Acesse o confinamento dos seus lotes" : "Crie sua conta de acesso"}</div>
        <form onSubmit={handleSubmit}>
          <label style={styles.field}>
            <div style={styles.fieldLabel}>E-mail</div>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={styles.input} placeholder="voce@email.com" />
          </label>
          <label style={styles.field}>
            <div style={styles.fieldLabel}>Senha</div>
            <input type="password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} style={styles.input} placeholder="••••••••" />
          </label>
          {erro && <div style={styles.errorBox}>{erro}</div>}
          {reenviado && <div style={styles.errorBox}>E-mail reenviado! Confira sua caixa de entrada e o spam.</div>}
          <button type="submit" disabled={carregando} style={styles.primaryBtn}>
            {carregando ? "Aguarde..." : modo === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>
        {precisaConfirmarEmail && (
          <button type="button" onClick={handleReenviarConfirmacao} disabled={reenviando} style={styles.linkBtn}>
            {reenviando ? "Reenviando..." : "Reenviar e-mail de confirmação"}
          </button>
        )}
        <button onClick={() => setModo(modo === "login" ? "cadastro" : "login")} style={styles.linkBtn}>
          {modo === "login" ? "Recebeu um código do seu consultor? Criar conta" : "Já tem conta? Entrar"}
        </button>
        <MarcaDesenvolvedor compacto />
      </div>
    </div>
  );
}

// ---------- Vincular convite ----------
function TelaVincularConvite({ onVinculado }) {
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function handleVincular(e) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      const clienteId = await resgatarConvitePortal(supabase, codigo);
      await onVinculado(clienteId);
    } catch (err) {
      setErro(mensagemErroConvite(err));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div style={styles.loginScreen}>
      <div style={styles.loginCard}>
        <div style={styles.loginBrand}>Quase lá!</div>
        <div style={styles.loginSub}>Seu login já está ativo. Digite o código do cliente enviado pelo consultor para vincular esta conta. Não é o código de confirmação do e-mail.</div>
        <form onSubmit={handleVincular}>
          <label style={styles.field}>
            <div style={styles.fieldLabel}>Código do cliente</div>
            <input type="text" required value={codigo} onChange={(e) => setCodigo(e.target.value)}
              autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off"
              style={{ ...styles.input, textTransform: "uppercase", letterSpacing: 2, fontWeight: 700, fontSize: 18 }}
              placeholder="EX: A1B2C3D4" />
          </label>
          {erro && <div role="alert" style={styles.errorBox}>{erro}</div>}
          <button type="submit" disabled={carregando} style={styles.primaryBtn}>
            {carregando ? "Verificando..." : "Confirmar código"}
          </button>
        </form>
        <button onClick={() => supabase.auth.signOut()} style={styles.linkBtn}>Sair</button>
      </div>
    </div>
  );
}

// ---------- Painel principal ----------
function PainelCliente({ cliente, somenteLeitura, papel, onAtualizarMapaCliente }) {
  const [abaPortal, setAbaPortal] = useState("confinamento");
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [lotes, setLotes] = useState([]);
  const [pesagens, setPesagens] = useState([]);
  const [consumos, setConsumos] = useState([]);
  const [saidas, setSaidas] = useState([]);
  const [entradas, setEntradas] = useState([]);
  const [leiturasCocho, setLeiturasCocho] = useState([]);
  const [cargasVagao, setCargasVagao] = useState([]);
  const [ingredientesMs, setIngredientesMs] = useState([]);
  const [dietas, setDietas] = useState([]);
  const [currais, setCurrais] = useState([]);
  const [curralOcupacoes, setCurralOcupacoes] = useState([]);
  const [relatorios, setRelatorios] = useState([]);
  const [historicoTratoDisponivel, setHistoricoTratoDisponivel] = useState(false);
  const [erroHistoricoTrato, setErroHistoricoTrato] = useState("");

  const carregar = useCallback(async () => {
    setHistoricoTratoDisponivel(false);
    setErroHistoricoTrato("");
    const escopoCocho = criarEscopoCocho("portal", cliente.id);
    const cacheCocho = carregarCacheCocho(escopoCocho);
    if (cacheCocho) {
      setLotes(cacheCocho.lotes || []);
      setConsumos(cacheCocho.consumos || []);
      setLeiturasCocho(mesclarLeiturasPendentes(cacheCocho.leiturasCocho || [], carregarLeiturasPendentes(escopoCocho)));
      setCurrais(cacheCocho.currais || []);
    }

    try {
      await sincronizarLeiturasPendentes(escopoCocho, supabase);
      const l = await buscarTodasLinhasPortal("lotes_confinamento", "cliente_id", cliente.id);
      setLotes(l);
      const loteIds = l.map((x) => x.id);
      let consumosNovos = [];
      let leiturasNovas = [];
      if (loteIds.length > 0) {
        const [p, c, s, e, lc] = await Promise.all([
          buscarTodasLinhasPortal("pesagens_lote", "lote_id", loteIds),
          buscarTodasLinhasPortal("consumos_lote", "lote_id", loteIds),
          buscarTodasLinhasPortal("saidas_lote", "lote_id", loteIds),
          buscarTodasLinhasPortal("entradas_lote", "lote_id", loteIds),
          buscarTodasLinhasPortal("leituras_cocho", "lote_id", loteIds),
        ]);
        consumosNovos = c;
        leiturasNovas = mesclarLeiturasPendentes(lc, carregarLeiturasPendentes(escopoCocho));
        setPesagens(p);
        setConsumos(c);
        setSaidas(s);
        setEntradas(e);
        setLeiturasCocho(leiturasNovas);
      } else {
        setPesagens([]);
        setConsumos([]);
        setSaidas([]);
        setEntradas([]);
        setLeiturasCocho([]);
      }
      const [cu, cv, im, dt] = await Promise.all([
        buscarTodasLinhasPortal("currais", "cliente_id", cliente.id),
        buscarTodasLinhasPortal("cargas_vagao", "cliente_id", cliente.id),
        buscarTodasLinhasPortal("ingredientes_ms", "cliente_id", cliente.id),
        buscarTodasLinhasPortal("dietas", "cliente_id", cliente.id),
      ]);
      setCurrais(cu);
      setCargasVagao(cv);
      setIngredientesMs(im);
      setDietas(dt);
      salvarCacheCocho(escopoCocho, {
        lotes: l,
        consumos: consumosNovos,
        leiturasCocho: leiturasNovas,
        currais: cu,
      });
      const curralIds = cu.map((x) => x.id);
      if (curralIds.length > 0) {
        setCurralOcupacoes(await buscarTodasLinhasPortal("curral_ocupacoes", "curral_id", curralIds));
      } else {
        setCurralOcupacoes([]);
      }
      setHistoricoTratoDisponivel(true);
      if (papel === "administrador") {
        setRelatorios(await buscarTodasLinhasPortal("relatorios", "cliente_id", cliente.id));
      }
    } catch (error) {
      setErroHistoricoTrato("Não foi possível atualizar o histórico completo. Conecte-se e tente novamente para exportar o PDF.");
      console.error("Não foi possível atualizar os dados do portal:", error);
    }
  }, [cliente.id, papel]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("online", carregar);
    return () => window.removeEventListener("online", carregar);
  }, [carregar]);

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

  async function adicionarLote(dados) {
    const { data, error } = await supabase
      .from("lotes_confinamento")
      .insert({ ...dados, cliente_id: cliente.id, consultor_id: cliente.consultor_id })
      .select()
      .single();
    if (error) throw error;
    setLotes((ls) => [...ls, data]);
    return data;
  }

  async function adicionarPesagem(loteId, dados) {
    const { data, error } = await supabase
      .from("pesagens_lote")
      .insert({ ...dados, lote_id: loteId, consultor_id: cliente.consultor_id })
      .select()
      .single();
    if (error) throw error;
    setPesagens((ps) => [...ps, data]);
    return data;
  }

  async function atualizarSaida(saidaId, dados) {
    const saidaAtual = saidas.find((s) => s.id === saidaId);
    const { data, error } = await supabase
      .from("saidas_lote")
      .update(dados)
      .eq("id", saidaId)
      .select()
      .single();
    if (error) throw error;
    const atualizadas = saidas.map((s) => (s.id === saidaId ? data : s));
    setSaidas(atualizadas);
    const lote = saidaAtual && lotes.find((l) => l.id === saidaAtual.lote_id);
    if (lote) {
      const saidasDoLote = atualizadas.filter((s) => s.lote_id === lote.id);
      const { finalizadoPorSaidas, dataSaidaCalculada, pesoSaidaVivoCalculado } = calcularResumoSaidas(lote, saidasDoLote);
      const dataSaidaAlvo = finalizadoPorSaidas ? dataSaidaCalculada : null;
      const pesoSaidaAlvo = finalizadoPorSaidas ? pesoSaidaVivoCalculado : null;
      if ((lote.data_saida || null) !== dataSaidaAlvo || Number(lote.peso_saida_vivo || 0) !== Number(pesoSaidaAlvo || 0)) {
        await atualizarLote(lote.id, { data_saida: dataSaidaAlvo, peso_saida_vivo: pesoSaidaAlvo });
      }
    }
    return data;
  }

  // Se essa saída esvaziar o lote inteiro, preenche data_saida/peso_saida_vivo
  // automaticamente (mesma lógica do lado do consultor) — assim o lote já
  // aparece em "Lotes finalizados" sem precisar pedir pro consultor editar.
  async function adicionarSaida(loteId, dados) {
    const { data, error } = await supabase
      .from("saidas_lote")
      .insert({ ...dados, lote_id: loteId, consultor_id: cliente.consultor_id })
      .select()
      .single();
    if (error) throw error;
    const novasSaidas = [...saidas, data];
    setSaidas(novasSaidas);
    const lote = lotes.find((l) => l.id === loteId);
    if (lote) {
      const { finalizadoPorSaidas, dataSaidaCalculada, pesoSaidaVivoCalculado } = calcularResumoSaidas(
        lote,
        novasSaidas.filter((s) => s.lote_id === loteId)
      );
      if (finalizadoPorSaidas) {
        await atualizarLote(loteId, { data_saida: dataSaidaCalculada, peso_saida_vivo: pesoSaidaVivoCalculado });
      }
    }
    return data;
  }

  async function adicionarEntrada(loteId, dados) {
    const { data, error } = await supabase
      .from("entradas_lote")
      .insert({ ...dados, lote_id: loteId, consultor_id: cliente.consultor_id })
      .select()
      .single();
    if (error) throw error;
    setEntradas((es) => [...es, data]);
    const { data: loteAtualizado, error: erroLote } = await supabase
      .from("lotes_confinamento")
      .select("*")
      .eq("id", loteId)
      .single();
    if (erroLote) throw erroLote;
    setLotes((ls) => ls.map((l) => (l.id === loteId ? loteAtualizado : l)));
    return data;
  }

  async function adicionarConsumo(loteId, dados) {
    const { data, error } = await supabase
      .from("consumos_lote")
      .insert({ ...dados, lote_id: loteId, consultor_id: cliente.consultor_id })
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

  // Mesma importação disponível no painel do consultor: recebe os consumos
  // já consolidados por lote/data e atualiza o total ao reenviar o dia.
  async function importarConsumosEmLote(linhas) {
    if (linhas.length === 0) return [];
    const paraInserir = linhas.map((l) => ({ ...l, consultor_id: cliente.consultor_id }));
    const { data, error } = await supabase
      .from("consumos_lote")
      .upsert(paraInserir, { onConflict: "lote_id,data" })
      .select();
    if (error) throw error;
    setConsumos((cs) => {
      const atualizados = new Map((data || []).map((c) => [`${c.lote_id}|${c.data}`, c]));
      const mantidos = cs.filter((c) => !atualizados.has(`${c.lote_id}|${c.data}`));
      return [...mantidos, ...(data || [])];
    });
    return data || [];
  }

  // Upsert: uma leitura por lote/dia — clicar em outra nota no mesmo dia
  // substitui a anterior.
  async function registrarLeituraCocho(loteId, dados) {
    const escopoCocho = criarEscopoCocho("portal", cliente.id);
    const payload = { ...dados, lote_id: loteId, consultor_id: cliente.consultor_id };

    const guardarOffline = () => {
      const local = salvarLeituraPendente(escopoCocho, payload);
      setLeiturasCocho((atuais) => {
        const proximas = substituirLeituraNaLista(atuais, local);
        atualizarLeiturasNoCache(escopoCocho, proximas);
        return proximas;
      });
      return local;
    };

    if (typeof navigator !== "undefined" && navigator.onLine === false) return guardarOffline();

    let resultado;
    try {
      resultado = await supabase
        .from("leituras_cocho")
        .upsert(payload, { onConflict: "lote_id,data" })
        .select()
        .single();
    } catch (error) {
      if (erroEhDeRede(error)) return guardarOffline();
      throw error;
    }
    const { data, error } = resultado;
    if (error) {
      if (erroEhDeRede(error)) return guardarOffline();
      throw error;
    }
    removerLeituraPendente(escopoCocho, payload);
    setLeiturasCocho((atuais) => {
      const proximas = substituirLeituraNaLista(atuais, data);
      atualizarLeiturasNoCache(escopoCocho, proximas);
      return proximas;
    });
    return data;
  }

  async function importarLeiturasCochoEmLote(linhas) {
    if (linhas.length === 0) return [];
    const paraInserir = linhas.map((l) => ({ ...l, consultor_id: cliente.consultor_id }));
    const { data, error } = await supabase.from("leituras_cocho").insert(paraInserir).select();
    if (error) throw error;
    setLeiturasCocho((ls) => [...ls, ...(data || [])]);
    return data;
  }

  async function importarCargasEmLote(linhas) {
    if (linhas.length === 0) return [];
    const paraInserir = linhas.map((l) => ({
      ...l,
      cliente_id: cliente.id,
      consultor_id: cliente.consultor_id,
    }));
    const { data, error } = await supabase
      .from("cargas_vagao")
      // O "Id Carga" da Hook não é globalmente único — o contador da máquina
      // reseta periodicamente e reaproveita números em datas bem diferentes.
      // A chave de dedup precisa incluir a data, senão uma carga nova
      // sobrescreve silenciosamente uma carga antiga com o mesmo código.
      .upsert(paraInserir, { onConflict: "cliente_id,data,carga_codigo" })
      .select();
    if (error) throw error;
    const importadasPorId = new Map((data || []).map((carga) => [carga.id, carga]));
    setCargasVagao((cs) => [
      ...cs.map((carga) => importadasPorId.get(carga.id) || carga),
      ...(data || []).filter((carga) => !cs.some((existente) => existente.id === carga.id)),
    ]);
    return data || [];
  }

  async function excluirCarga(cargaId) {
    const { error } = await supabase.from("cargas_vagao").delete().eq("id", cargaId);
    if (error) throw error;
    setCargasVagao((cs) => cs.filter((c) => c.id !== cargaId));
  }

  async function sincronizarCustosMsConsumos(atualizacoes) {
    if (atualizacoes.length === 0) return [];
    const linhas = await Promise.all(atualizacoes.map(async ({ id, ...dados }) => {
      const { data, error } = await supabase
        .from("consumos_lote")
        .update(dados)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }));
    const porId = new Map(linhas.map((linha) => [linha.id, linha]));
    setConsumos((cs) => cs.map((consumo) => porId.get(consumo.id) || consumo));
    return linhas;
  }

  async function salvarMsIngrediente(ingrediente) {
    const linha = {
      ...ingrediente,
      cliente_id: cliente.id,
      consultor_id: cliente.consultor_id,
      atualizado_em: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("ingredientes_ms")
      .upsert(linha, { onConflict: "cliente_id,ingrediente_chave" })
      .select()
      .single();
    if (error) throw error;
    setIngredientesMs((itens) => {
      const existe = itens.some((i) => i.ingrediente_chave === data.ingrediente_chave);
      return existe
        ? itens.map((i) => (i.ingrediente_chave === data.ingrediente_chave ? data : i))
        : [...itens, data];
    });
    return data;
  }

  async function adicionarDieta(dados) {
    const { data, error } = await supabase
      .from("dietas")
      .insert({ ...dados, cliente_id: cliente.id, consultor_id: cliente.consultor_id })
      .select()
      .single();
    if (error) throw error;
    setDietas((ds) => [...ds, data]);
    return data;
  }

  async function atualizarDieta(dietaId, dados) {
    const { data, error } = await supabase
      .from("dietas")
      .update({ ...dados, atualizado_em: new Date().toISOString() })
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

  async function adicionarCurral(clienteId, dados) {
    const { data, error } = await supabase
      .from("currais")
      .insert({ ...dados, cliente_id: clienteId, consultor_id: cliente.consultor_id })
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

  async function excluirCurral(curralId) {
    const { error } = await supabase.from("currais").delete().eq("id", curralId);
    if (error) throw error;
    setCurrais((cs) => cs.filter((c) => c.id !== curralId));
    setLotes((ls) => ls.map((l) => (l.curral_id === curralId ? { ...l, curral_id: null } : l)));
    setCurralOcupacoes((os) => os.filter((o) => o.curral_id !== curralId));
  }

  async function importarCurraisEmLote(clienteId, linhas) {
    if (linhas.length === 0) return [];
    const paraInserir = linhas.map((l) => ({ ...l, cliente_id: clienteId, consultor_id: cliente.consultor_id }));
    const { data, error } = await supabase.from("currais").insert(paraInserir).select();
    if (error) throw error;
    setCurrais((cs) => [...cs, ...(data || [])]);
    return data;
  }

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
        .insert({ curral_id: novoCurralId, lote_id: loteId, consultor_id: cliente.consultor_id, data_inicio: hoje })
        .select()
        .single();
      if (erroAbrir) throw erroAbrir;
      setCurralOcupacoes((os) => [...os, nova]);
    }
    return atualizarLote(loteId, { curral_id: novoCurralId });
  }

  return (
    <div style={styles.app} className="app-shell">
      <div style={styles.topbar}>
        <div style={styles.topbarRow}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src="/rastro-icon-192.png" alt="Rastro Confinamento" style={styles.topbarLogo} />
            <div>
              <div style={styles.brand}>Rastro Confinamento</div>
              <div style={styles.brandSub}>{cliente.nome}{somenteLeitura ? " · Somente leitura" : ""}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <BotaoAtualizar />
            <button onClick={() => setTrocandoSenha(true)} style={styles.iconBtn} title="Trocar senha">
              <KeyRound size={16} />
            </button>
            <button onClick={() => supabase.auth.signOut()} style={styles.iconBtn} title="Sair">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>

      {trocandoSenha ? (
        <div style={styles.content} className="app-content">
          <TrocarSenha onVoltar={() => setTrocandoSenha(false)} />
        </div>
      ) : (
      <>
      <div style={styles.content} className="app-content">
        {!historicoTratoDisponivel && <div role={erroHistoricoTrato ? "alert" : "status"} style={{ ...styles.card, marginBottom: 12 }}>
          {erroHistoricoTrato || "Carregando histórico completo para exportação..."}
          {erroHistoricoTrato && <button type="button" onClick={carregar} style={{ ...styles.secondaryActionBtn, marginLeft: 12 }}>Tentar novamente</button>}
        </div>}
        {abaPortal === "relatorios" && papel === "administrador" ? (
          <RelatoriosPortalTab relatorios={relatorios} />
        ) : (
          <ConfinamentoTab
            exportacaoTratoDisponivel={historicoTratoDisponivel}
            cliente={cliente}
            lotes={lotes}
            pesagens={pesagens}
            consumos={consumos}
            saidas={saidas}
            entradas={entradas}
            leiturasCocho={leiturasCocho}
            cargasVagao={cargasVagao}
            ingredientesMs={ingredientesMs}
            dietas={dietas}
            currais={currais}
            curralOcupacoes={curralOcupacoes}
            onAdicionar={somenteLeitura ? undefined : adicionarLote}
            onAtualizar={somenteLeitura ? undefined : atualizarLote}
            onAdicionarPesagem={somenteLeitura ? undefined : adicionarPesagem}
            onAdicionarSaida={somenteLeitura ? undefined : adicionarSaida}
            onAtualizarSaida={somenteLeitura ? undefined : atualizarSaida}
            onAdicionarEntrada={somenteLeitura ? undefined : adicionarEntrada}
            onAdicionarConsumo={somenteLeitura ? undefined : adicionarConsumo}
            onAtualizarConsumo={somenteLeitura ? undefined : atualizarConsumo}
            onExcluirConsumo={somenteLeitura ? undefined : excluirConsumo}
            onImportarConsumos={somenteLeitura ? undefined : importarConsumosEmLote}
            onRegistrarLeituraCocho={somenteLeitura ? undefined : registrarLeituraCocho}
            onImportarLeiturasCocho={somenteLeitura ? undefined : importarLeiturasCochoEmLote}
            onImportarCargas={somenteLeitura ? undefined : importarCargasEmLote}
            onExcluirCarga={somenteLeitura ? undefined : excluirCarga}
            onSalvarMsIngrediente={somenteLeitura ? undefined : salvarMsIngrediente}
            onSincronizarCustosMs={somenteLeitura ? undefined : sincronizarCustosMsConsumos}
            onAdicionarDieta={somenteLeitura ? undefined : adicionarDieta}
            onAtualizarDieta={somenteLeitura ? undefined : atualizarDieta}
            onAdicionarCurral={somenteLeitura ? undefined : adicionarCurral}
            onAtualizarCurral={somenteLeitura ? undefined : atualizarCurral}
            onExcluirCurral={somenteLeitura ? undefined : excluirCurral}
            onImportarCurrais={somenteLeitura ? undefined : importarCurraisEmLote}
            onAtualizarCliente={somenteLeitura ? undefined : onAtualizarMapaCliente}
            onMoverLoteParaCurral={somenteLeitura ? undefined : moverLoteParaCurral}
          />
        )}
      </div>

      {papel === "administrador" && (
        <div style={styles.bottomNav}>
          <button
            onClick={() => setAbaPortal("confinamento")}
            style={{ ...styles.navBtn, color: abaPortal === "confinamento" ? "#1F4D45" : "#8A8A86" }}
          >
            <Beef size={20} />
            Confinamento
          </button>
          <button
            onClick={() => setAbaPortal("relatorios")}
            style={{ ...styles.navBtn, color: abaPortal === "relatorios" ? "#1F4D45" : "#8A8A86" }}
          >
            <FileText size={20} />
            Relatórios
          </button>
        </div>
      )}
      </>
      )}

      <MarcaDesenvolvedor />
    </div>
  );
}

// ---------- Trocar senha ----------
// Não pede a senha atual: quem chega aqui já está logado (sessão válida),
// e supabase.auth.updateUser troca a senha sem precisar reautenticar.
// Serve tanto pra quem recebeu uma senha temporária do consultor quanto
// pra trocar a senha por vontade própria.
function TrocarSenha({ onVoltar }) {
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function handleSalvar() {
    setErro("");
    if (novaSenha.length < 6) {
      setErro("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (novaSenha !== confirmacao) {
      setErro("As senhas não são iguais.");
      return;
    }
    setSalvando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: novaSenha });
      if (error) throw error;
      setSucesso(true);
    } catch (err) {
      setErro(traduzErro(err.message));
    } finally {
      setSalvando(false);
    }
  }

  if (sucesso) {
    return (
      <div>
        <BackHeader title="Trocar senha" onBack={onVoltar} />
        <div style={styles.errorBox}>Senha alterada com sucesso!</div>
        <PrimaryButton onClick={onVoltar}>Voltar</PrimaryButton>
      </div>
    );
  }

  return (
    <div>
      <BackHeader title="Trocar senha" onBack={onVoltar} />
      <InputField label="Nova senha" type="password" value={novaSenha} onChange={setNovaSenha} placeholder="••••••••" />
      <InputField label="Confirmar nova senha" type="password" value={confirmacao} onChange={setConfirmacao} placeholder="••••••••" />
      {erro && <div style={styles.errorBox}>{erro}</div>}
      <PrimaryButton disabled={salvando} onClick={handleSalvar}>
        {salvando ? "Salvando..." : "Salvar nova senha"}
      </PrimaryButton>
    </div>
  );
}

function traduzErro(msg) {
  if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("already registered")) return "Este e-mail já está cadastrado.";
  if (msg.includes("Email not confirmed")) {
    return "Você ainda não confirmou seu e-mail. Veja o link que enviamos (confira também o spam) ou toque em \"Reenviar e-mail de confirmação\" abaixo.";
  }
  return msg;
}
