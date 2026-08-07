"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useDados } from "@/lib/useDados";
import { useConexao } from "@/lib/useConexao";
import TelaLogin from "@/components/TelaLogin";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import ClientesTab from "@/components/ClientesTab";
import AgendaTab from "@/components/AgendaTab";
import RelatoriosTab from "@/components/RelatoriosTab";
import DespesasTab from "@/components/DespesasTab";
import DietaTab from "@/components/DietaTab";
import GestaoTab from "@/components/GestaoTab";
import ConfiguracoesTab from "@/components/ConfiguracoesTab";
import Toast from "@/components/Toast";
import { styles } from "@/lib/styles";

const CONSULTOR_UID = "0db4e2fd-9cef-4e3f-9fb7-f974d4d22e02";

export default function Home() {
  return (
    <Suspense fallback={<div style={styles.loadingScreen}>Carregando...</div>}>
      <HomeConteudo />
    </Suspense>
  );
}

function HomeConteudo() {
  const [sessao, setSessao] = useState(undefined); // undefined = carregando, null = deslogado
  const [tab, setTab] = useState("clientes");
  const [view, setView] = useState({ screen: "list" });
  const [toast, setToast] = useState(null);
  const [mostrarConfiguracoes, setMostrarConfiguracoes] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessao(session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const consultorId = sessao?.user?.id;
  const conexao = useConexao(consultorId);
  const dados = useDados(consultorId);

  function mostrarToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  async function handleMarcarPago(relatorio, pago) {
    await dados.marcarPago(relatorio, pago);
    mostrarToast(pago ? "Marcado como pago" : "Marcado como pendente");
  }

  useEffect(() => {
    const googleSync = searchParams.get("google_sync");
    if (!googleSync) return;
    if (googleSync === "sucesso") {
      mostrarToast("Google Calendar conectado com sucesso!");
    } else if (googleSync === "erro") {
      mostrarToast("Não foi possível conectar o Google Calendar. Tente novamente.");
    }
    router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  if (sessao === undefined) {
    return <div style={styles.loadingScreen}>Carregando...</div>;
  }

  if (!sessao) {
    return <TelaLogin onLogin={() => {}} />;
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

  if (mostrarConfiguracoes) {
    return (
      <div style={styles.app}>
        <div style={styles.content}>
          <ConfiguracoesTab consultorId={consultorId} onBack={() => setMostrarConfiguracoes(false)} />
        </div>
        {toast && <Toast text={toast} />}
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <TopBar
        online={conexao.online}
        pendentes={conexao.pendentes}
        sincronizando={conexao.sincronizando}
        onSync={async () => {
          const r = await conexao.sincronizar();
          await dados.recarregar();
          if (r) {
            if (r.enviados > 0) mostrarToast(`${r.enviados} relatório(s) sincronizado(s)`);
            if (r.falhas > 0) mostrarToast(`Falha ao sincronizar: ${r.erros?.[0] || "erro desconhecido"}`);
            if (r.enviados === 0 && r.falhas === 0) mostrarToast("Tudo já está sincronizado");
          }
        }}
        onLogout={() => supabase.auth.signOut()}
        onAbrirConfiguracoes={() => setMostrarConfiguracoes(true)}
      />

      <div style={styles.content}>
        {tab === "clientes" && (
          <ClientesTab
            clientes={dados.clientes}
            visitas={dados.visitas}
            relatorios={dados.relatorios}
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
          />
        )}

        {tab === "agenda" && (
          <AgendaTab
            clientes={dados.clientes}
            visitas={dados.visitas}
            view={view}
            setView={setView}
            online={conexao.online}
            onAddVisita={async (v) => {
              await dados.adicionarVisita(v);
              setView({ screen: "list" });
              mostrarToast("Visita agendada");
            }}
            onUpdateVisita={async (id, v) => {
              await dados.atualizarVisita(id, v);
              mostrarToast("Visita atualizada");
            }}
            onDeleteVisita={async (id) => {
              await dados.excluirVisita(id);
              mostrarToast("Visita cancelada");
            }}
          />
        )}

        {tab === "relatorios" && (
          <RelatoriosTab
            clientes={dados.clientes}
            relatorios={dados.relatorios}
            view={view}
            setView={setView}
            online={conexao.online}
            onSaveRelatorio={async (r) => {
              const ehNovo = !r.id && !r.client_uuid;
              await dados.salvarRelatorio(r);
              if (ehNovo) setView({ screen: "list" });
              if (ehNovo) {
                mostrarToast(conexao.online ? "Relatório salvo e sincronizado" : "Relatório salvo no aparelho — será enviado quando voltar a internet");
              } else {
                mostrarToast(conexao.online ? "Alterações salvas e sincronizadas" : "Alterações salvas no aparelho — serão enviadas quando voltar a internet");
              }
            }}
            onMarcarPago={handleMarcarPago}
            onDeleteRelatorio={async (r) => {
              await dados.excluirRelatorio(r);
              mostrarToast("Relatório excluído");
            }}
          />
        )}

        {tab === "despesas" && (
          <DespesasTab
            despesas={dados.despesas}
            view={view}
            setView={setView}
            onAddDespesa={async (d) => {
              await dados.adicionarDespesa(d);
              setView({ screen: "list" });
              mostrarToast("Despesa registrada");
            }}
            onUpdateDespesa={async (id, d) => {
              await dados.atualizarDespesa(id, d);
              mostrarToast("Despesa atualizada");
            }}
            onDeleteDespesa={async (id) => {
              await dados.excluirDespesa(id);
              mostrarToast("Despesa excluída");
            }}
          />
        )}

        {tab === "dietas" && (
          <DietaTab
            dietas={dados.dietas}
            view={view}
            setView={setView}
            onAddDieta={async (d) => {
              await dados.adicionarDieta(d);
              setView({ screen: "list" });
              mostrarToast("Dieta cadastrada");
            }}
            onUpdateDieta={async (id, d) => {
              await dados.atualizarDieta(id, d);
              mostrarToast("Dieta atualizada");
            }}
            onDeleteDieta={async (id) => {
              await dados.excluirDieta(id);
              mostrarToast("Dieta excluída");
            }}
          />
        )}

        {tab === "gestao" && (
          <GestaoTab relatorios={dados.relatorios} despesas={dados.despesas} clientes={dados.clientes} onMarcarPago={handleMarcarPago} />
        )}
      </div>

      <BottomNav tab={tab} setTab={(t) => { setTab(t); setView({ screen: "list" }); }} />
      {toast && <Toast text={toast} />}
    </div>
  );
}
