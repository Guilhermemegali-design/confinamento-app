"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { styles } from "@/lib/styles";
import { LogOut, Beef, FileText, KeyRound } from "lucide-react";
import ConfinamentoTab from "@/components/ConfinamentoTab";
import RelatoriosPortalTab from "@/components/RelatoriosPortalTab";
import MarcaDesenvolvedor from "@/components/MarcaDesenvolvedor";
import { BackHeader, InputField, PrimaryButton } from "@/components/UI";
import { calcularResumoSaidas } from "@/lib/confinamento";

export default function PortalCliente() {
  const [sessao, setSessao] = useState(undefined);
  const [cliente, setCliente] = useState(undefined);
  const [papel, setPapel] = useState("editor");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => setSessao(session));
    return () => listener.subscription.unsubscribe();
  }, []);

  const carregarCliente = useCallback(async () => {
    if (!sessao) return;
    const { data: vinculo } = await supabase
      .from("clientes_usuarios")
      .select("cliente_id, papel")
      .eq("auth_user_id", sessao.user.id)
      .maybeSingle();
    if (!vinculo) {
      setCliente(null);
      return;
    }
    setPapel(vinculo.papel || "editor");
    const { data } = await supabase.from("clientes").select("*").eq("id", vinculo.cliente_id).maybeSingle();
    setCliente(data || null);
  }, [sessao]);

  useEffect(() => {
    if (sessao) carregarCliente();
  }, [sessao, carregarCliente]);

  if (sessao === undefined) return <div style={styles.loadingScreen}>Carregando...</div>;
  if (!sessao) return <TelaLoginCliente />;
  if (cliente === undefined) return <div style={styles.loadingScreen}>Carregando...</div>;
  if (cliente === null) return <TelaVincularConvite onVinculado={carregarCliente} />;
  return <PainelCliente cliente={cliente} somenteLeitura={papel === "leitor"} papel={papel} />;
}

// ---------- Login ----------
function TelaLoginCliente() {
  const [modo, setModo] = useState("login");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
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
          <button type="submit" disabled={carregando} style={styles.primaryBtn}>
            {carregando ? "Aguarde..." : modo === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>
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
      const { data: sessao } = await supabase.auth.getSession();
      const userId = sessao.session.user.id;
      const userEmail = sessao.session.user.email;
      const { data: clienteEncontrado, error: erroBusca } = await supabase
        .from("clientes").select("id, consultor_id").eq("codigo_convite", codigo.trim()).maybeSingle();
      if (erroBusca) throw erroBusca;
      if (!clienteEncontrado) { setErro("Código inválido. Confira com seu consultor."); return; }
      const { error: erroVinculo } = await supabase.from("clientes_usuarios").insert({
        cliente_id: clienteEncontrado.id,
        consultor_id: clienteEncontrado.consultor_id,
        auth_user_id: userId,
        email: userEmail,
      });
      if (erroVinculo) {
        if (erroVinculo.code === "23505") {
          setErro("Você já tem acesso a essa fazenda.");
          return;
        }
        throw erroVinculo;
      }
      onVinculado();
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div style={styles.loginScreen}>
      <div style={styles.loginCard}>
        <div style={styles.loginBrand}>Quase lá!</div>
        <div style={styles.loginSub}>Digite o código que seu consultor te enviou para liberar seu acesso</div>
        <form onSubmit={handleVincular}>
          <label style={styles.field}>
            <div style={styles.fieldLabel}>Código de acesso</div>
            <input type="text" required value={codigo} onChange={(e) => setCodigo(e.target.value)}
              style={{ ...styles.input, textTransform: "uppercase", letterSpacing: 2, fontWeight: 700, fontSize: 18 }}
              placeholder="EX: A1B2C3D4" />
          </label>
          {erro && <div style={styles.errorBox}>{erro}</div>}
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
function PainelCliente({ cliente, somenteLeitura, papel }) {
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

  const carregar = useCallback(async () => {
    const { data: l } = await supabase.from("lotes_confinamento").select("*").eq("cliente_id", cliente.id);
    setLotes(l || []);
    const loteIds = (l || []).map((x) => x.id);
    if (loteIds.length > 0) {
      const { data: p } = await supabase.from("pesagens_lote").select("*").in("lote_id", loteIds);
      setPesagens(p || []);
      const { data: c } = await supabase.from("consumos_lote").select("*").in("lote_id", loteIds);
      setConsumos(c || []);
      const { data: s } = await supabase.from("saidas_lote").select("*").in("lote_id", loteIds);
      setSaidas(s || []);
      const { data: e } = await supabase.from("entradas_lote").select("*").in("lote_id", loteIds);
      setEntradas(e || []);
      const { data: lc } = await supabase.from("leituras_cocho").select("*").in("lote_id", loteIds);
      setLeiturasCocho(lc || []);
    } else {
      setPesagens([]);
      setConsumos([]);
      setSaidas([]);
      setEntradas([]);
      setLeiturasCocho([]);
    }
    const { data: cu } = await supabase.from("currais").select("*").eq("cliente_id", cliente.id);
    setCurrais(cu || []);
    const { data: cv } = await supabase.from("cargas_vagao").select("*").eq("cliente_id", cliente.id);
    setCargasVagao(cv || []);
    const { data: im } = await supabase.from("ingredientes_ms").select("*").eq("cliente_id", cliente.id);
    setIngredientesMs(im || []);
    const { data: dt } = await supabase.from("dietas").select("*").eq("cliente_id", cliente.id);
    setDietas(dt || []);
    const curralIds = (cu || []).map((x) => x.id);
    if (curralIds.length > 0) {
      const { data: co } = await supabase.from("curral_ocupacoes").select("*").in("curral_id", curralIds);
      setCurralOcupacoes(co || []);
    } else {
      setCurralOcupacoes([]);
    }
    if (papel === "administrador") {
      const { data: rels } = await supabase.from("relatorios").select("*").eq("cliente_id", cliente.id);
      setRelatorios(rels || []);
    }
  }, [cliente.id, papel]);

  useEffect(() => {
    carregar();
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
  // já consolidados por lote/data e ignora dias que já existem.
  async function importarConsumosEmLote(linhas) {
    if (linhas.length === 0) return [];
    const paraInserir = linhas.map((l) => ({ ...l, consultor_id: cliente.consultor_id }));
    const { data, error } = await supabase
      .from("consumos_lote")
      .upsert(paraInserir, { onConflict: "lote_id,data", ignoreDuplicates: true })
      .select();
    if (error) throw error;
    setConsumos((cs) => [...cs, ...(data || [])]);
    return data || [];
  }

  // Upsert: uma leitura por lote/dia — clicar em outra nota no mesmo dia
  // substitui a anterior.
  async function registrarLeituraCocho(loteId, dados) {
    const { data, error } = await supabase
      .from("leituras_cocho")
      .upsert({ ...dados, lote_id: loteId, consultor_id: cliente.consultor_id }, { onConflict: "lote_id,data" })
      .select()
      .single();
    if (error) throw error;
    setLeiturasCocho((ls) => {
      const existe = ls.some((l) => l.lote_id === loteId && l.data === data.data);
      return existe ? ls.map((l) => (l.lote_id === loteId && l.data === data.data ? data : l)) : [...ls, data];
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
        {abaPortal === "relatorios" && papel === "administrador" ? (
          <RelatoriosPortalTab relatorios={relatorios} />
        ) : (
          <ConfinamentoTab
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
  return msg;
}
