"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { styles } from "@/lib/styles";
import { LogOut } from "lucide-react";
import ConfinamentoTab from "@/components/ConfinamentoTab";

export default function PortalCliente() {
  const [sessao, setSessao] = useState(undefined);
  const [cliente, setCliente] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => setSessao(session));
    return () => listener.subscription.unsubscribe();
  }, []);

  const carregarCliente = useCallback(async () => {
    if (!sessao) return;
    const { data: vinculo } = await supabase
      .from("clientes_usuarios")
      .select("cliente_id")
      .eq("auth_user_id", sessao.user.id)
      .maybeSingle();
    if (!vinculo) {
      setCliente(null);
      return;
    }
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
  return <PainelCliente cliente={cliente} />;
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
        <img src="/logo.jpg" alt="Logo" style={styles.loginLogo} />
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
function PainelCliente({ cliente }) {
  const [lotes, setLotes] = useState([]);
  const [pesagens, setPesagens] = useState([]);
  const [consumos, setConsumos] = useState([]);
  const [leiturasCocho, setLeiturasCocho] = useState([]);

  const carregar = useCallback(async () => {
    const { data: l } = await supabase.from("lotes_confinamento").select("*").eq("cliente_id", cliente.id);
    setLotes(l || []);
    const loteIds = (l || []).map((x) => x.id);
    if (loteIds.length > 0) {
      const { data: p } = await supabase.from("pesagens_lote").select("*").in("lote_id", loteIds);
      setPesagens(p || []);
      const { data: c } = await supabase.from("consumos_lote").select("*").in("lote_id", loteIds);
      setConsumos(c || []);
      const { data: lc } = await supabase.from("leituras_cocho").select("*").in("lote_id", loteIds);
      setLeiturasCocho(lc || []);
    } else {
      setPesagens([]);
      setConsumos([]);
      setLeiturasCocho([]);
    }
  }, [cliente.id]);

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

  return (
    <div style={styles.app}>
      <div style={styles.topbar}>
        <div style={styles.topbarRow}>
          <div>
            <div style={styles.brand}>{cliente.nome}</div>
            <div style={styles.brandSub}>Portal do cliente</div>
          </div>
          <button onClick={() => supabase.auth.signOut()} style={styles.iconBtn} title="Sair">
            <LogOut size={16} />
          </button>
        </div>
      </div>

      <div style={styles.content}>
        <ConfinamentoTab
          cliente={cliente}
          lotes={lotes}
          pesagens={pesagens}
          consumos={consumos}
          leiturasCocho={leiturasCocho}
          onAtualizar={atualizarLote}
          onAdicionarPesagem={adicionarPesagem}
          onAdicionarConsumo={adicionarConsumo}
          onRegistrarLeituraCocho={registrarLeituraCocho}
        />
      </div>
    </div>
  );
}

function traduzErro(msg) {
  if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("already registered")) return "Este e-mail já está cadastrado.";
  return msg;
}
