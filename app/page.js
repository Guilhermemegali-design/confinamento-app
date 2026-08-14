"use client";

import { useState, useEffect } from "react";
import { LogOut } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useDadosConfinamento } from "@/lib/useDadosConfinamento";
import TelaLogin from "@/components/TelaLogin";
import ClientesTab from "@/components/ClientesTab";
import Toast from "@/components/Toast";
import MarcaDesenvolvedor from "@/components/MarcaDesenvolvedor";
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
    <div style={styles.app} className="app-shell">
      <div style={styles.topbar}>
        <div style={styles.topbarRow}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src="/rastro-icon-192.png" alt="Rastro Confinamento" style={styles.topbarLogo} />
            <div>
              <div style={styles.brand}>Rastro Confinamento</div>
              <div style={styles.brandSub}>Painel do consultor</div>
            </div>
          </div>
          <button onClick={() => supabase.auth.signOut()} style={styles.iconBtn} title="Sair">
            <LogOut size={16} />
          </button>
        </div>
      </div>

      <div style={styles.content} className="app-content">
        <ClientesTab
          clientes={dados.clientes}
          lotes={dados.lotes}
          pesagens={dados.pesagens}
          consumos={dados.consumos}
          saidas={dados.saidas}
          entradas={dados.entradas}
          leiturasCocho={dados.leiturasCocho}
          cargasVagao={dados.cargasVagao}
          ingredientesMs={dados.ingredientesMs}
          dietas={dados.dietas}
          clientesUsuarios={dados.clientesUsuarios}
          currais={dados.currais}
          curralOcupacoes={dados.curralOcupacoes}
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
          onAddSaida={async (loteId, s) => {
            await dados.adicionarSaida(loteId, s);
            mostrarToast("Saída registrada");
          }}
          onDeleteSaida={async (id) => {
            await dados.excluirSaida(id);
            mostrarToast("Saída excluída");
          }}
          onAddEntrada={async (loteId, e) => {
            await dados.adicionarEntrada(loteId, e);
            mostrarToast("Entrada registrada");
          }}
          onDeleteEntrada={async (id) => {
            await dados.excluirEntrada(id);
            mostrarToast("Entrada excluída");
          }}
          onAddConsumo={async (loteId, c) => {
            await dados.adicionarConsumo(loteId, c);
            mostrarToast("Consumo registrado");
          }}
          onImportarConsumos={async (linhas) => {
            const importados = await dados.importarConsumosEmLote(linhas);
            const quantidade = importados?.length || 0;
            mostrarToast(`${quantidade} lançamento${quantidade !== 1 ? "s" : ""} importado${quantidade !== 1 ? "s" : ""}`);
            return importados;
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
          onImportarLeiturasCocho={async (linhas) => {
            await dados.importarLeiturasCochoEmLote(linhas);
            mostrarToast(`${linhas.length} leitura${linhas.length > 1 ? "s" : ""} importada${linhas.length > 1 ? "s" : ""}`);
          }}
          onImportarCargas={async (clienteId, linhas) => {
            const importadas = await dados.importarCargasEmLote(clienteId, linhas);
            mostrarToast(`${importadas.length} carga${importadas.length !== 1 ? "s" : ""} importada${importadas.length !== 1 ? "s" : ""}`);
            return importadas;
          }}
          onExcluirCarga={async (cargaId) => {
            await dados.excluirCarga(cargaId);
            mostrarToast("Carga excluída");
          }}
          onSalvarMsIngrediente={async (clienteId, ingrediente) => {
            await dados.salvarMsIngrediente(clienteId, ingrediente);
            mostrarToast("Matéria seca atualizada");
          }}
          onSincronizarCustosMs={async (atualizacoes) => {
            const sincronizados = await dados.sincronizarCustosMsConsumos(atualizacoes);
            mostrarToast(`${sincronizados.length} consumo${sincronizados.length !== 1 ? "s" : ""} sincronizado${sincronizados.length !== 1 ? "s" : ""}`);
            return sincronizados;
          }}
          onAddDieta={async (clienteId, d) => {
            await dados.adicionarDieta(clienteId, d);
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
          onMoverLoteParaCurral={async (loteId, novoCurralId, curralAnteriorId) => {
            await dados.moverLoteParaCurral(loteId, novoCurralId, curralAnteriorId);
            mostrarToast("Lote movido");
          }}
          onRemoveAcessoCliente={async (id) => {
            await dados.excluirAcessoCliente(id);
            mostrarToast("Acesso removido");
          }}
          onUpdateAcessoCliente={async (id, dadosAcesso) => {
            await dados.atualizarAcessoCliente(id, dadosAcesso);
            mostrarToast("Permissão atualizada");
          }}
        />
      </div>
      <MarcaDesenvolvedor />

      {toast && <Toast text={toast} />}
    </div>
  );
}
