"use client";

import { useState, useEffect } from "react";
import { LogOut } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useDadosConfinamento } from "@/lib/useDadosConfinamento";
import TelaLogin from "@/components/TelaLogin";
import ClientesTab from "@/components/ClientesTab";
import Toast from "@/components/Toast";
import { styles } from "@/lib/styles";

const CONSULTOR_UID = "0db4e2fd-9cef-4e3f-9fb7-f974d4d22e02";

export default function Home() {
  const [sessao, setSessao] = useState(undefined); // undefined = carregando, null = deslogado
  const [view, setView] = useState({ screen: "list" });
  const [toast, setToast] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessao(session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const consultorId = sessao?.user?.id;
  const dados = useDadosConfinamento(consultorId);

  function mostrarToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  if (sessao === undefined) {
    return <div style={styles.loadingScreen}>Carregando...</div>;
  }

  if (!sessao) {
    return <TelaLogin />;
  }

  if (sessao.user.id !== CONSULTOR_UID) {
    return (
      <div style={styles.loadingScreen}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <p>Este acesso é exclusivo do consultor.</p>
          <p>Se você é cliente, peça o link correto do portal ao seu consultor.</p>
          <button
            onClick={() => supabase.auth.signOut()}
            style={{ marginTop: 16, padding: "8px 16px", borderRadius: 8, border: "1px solid #ccc", cursor: "pointer" }}
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <div style={styles.topbar}>
        <div style={styles.topbarRow}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src="/logo.jpg" alt="Logo" style={styles.topbarLogo} />
            <div>
              <div style={styles.brand}>Confinamento</div>
              <div style={styles.brandSub}>Painel do consultor</div>
            </div>
          </div>
          <button onClick={() => supabase.auth.signOut()} style={styles.iconBtn} title="Sair">
            <LogOut size={16} />
          </button>
        </div>
      </div>

      <div style={styles.content}>
        <ClientesTab
          clientes={dados.clientes}
          lotes={dados.lotes}
          pesagens={dados.pesagens}
          consumos={dados.consumos}
          leiturasCocho={dados.leiturasCocho}
          clientesUsuarios={dados.clientesUsuarios}
          currais={dados.currais}
          view={view}
          setView={setView}
          onAddCliente={async (c) => {
            await dados.adicionarCliente(c);
            setView({ screen: "list" });
            mostrarToast("Cliente cadastrado");
          }}
          onUpdateCliente={async (id, c) => {
            await dados.atualizarCliente(id, c);
            mostrarToast("Cliente atualizado");
          }}
          onDeleteCliente={async (id) => {
            await dados.excluirCliente(id);
            mostrarToast("Cliente excluído");
          }}
          onAddLote={async (clienteId, l) => {
            await dados.adicionarLote(clienteId, l);
            mostrarToast("Lote cadastrado");
          }}
          onUpdateLote={async (id, l) => {
            await dados.atualizarLote(id, l);
            mostrarToast("Lote atualizado");
          }}
          onDeleteLote={async (id) => {
            await dados.excluirLote(id);
            mostrarToast("Lote excluído");
          }}
          onAddPesagem={async (loteId, p) => {
            await dados.adicionarPesagem(loteId, p);
            mostrarToast("Pesagem registrada");
          }}
          onDeletePesagem={async (id) => {
            await dados.excluirPesagem(id);
            mostrarToast("Pesagem excluída");
          }}
          onAddConsumo={async (loteId, c) => {
            await dados.adicionarConsumo(loteId, c);
            mostrarToast("Consumo registrado");
          }}
          onImportarConsumos={async (linhas) => {
            await dados.importarConsumosEmLote(linhas);
            mostrarToast(`${linhas.length} lançamento${linhas.length > 1 ? "s" : ""} importado${linhas.length > 1 ? "s" : ""}`);
          }}
          onUpdateConsumo={async (id, c) => {
            await dados.atualizarConsumo(id, c);
            mostrarToast("Consumo atualizado");
          }}
          onDeleteConsumo={async (id) => {
            await dados.excluirConsumo(id);
            mostrarToast("Consumo excluído");
          }}
          onRegistrarLeituraCocho={async (loteId, l) => {
            await dados.registrarLeituraCocho(loteId, l);
            mostrarToast("Leitura de cocho registrada");
          }}
          onAddCurral={async (clienteId, c) => {
            await dados.adicionarCurral(clienteId, c);
            mostrarToast("Curral marcado");
          }}
          onUpdateCurral={async (id, c) => {
            await dados.atualizarCurral(id, c);
            mostrarToast("Curral atualizado");
          }}
          onDeleteCurral={async (id) => {
            await dados.excluirCurral(id);
            mostrarToast("Curral excluído");
          }}
          onImportarCurrais={async (clienteId, linhas) => {
            await dados.importarCurraisEmLote(clienteId, linhas);
            mostrarToast(`${linhas.length} curral${linhas.length > 1 ? "is" : ""} importado${linhas.length > 1 ? "s" : ""}`);
          }}
          onRemoveAcessoCliente={async (id) => {
            await dados.excluirAcessoCliente(id);
            mostrarToast("Acesso removido");
          }}
        />
      </div>

      {toast && <Toast text={toast} />}
    </div>
  );
}
