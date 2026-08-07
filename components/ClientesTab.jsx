"use client";

import { useState } from "react";
import { Trash2, Search, Settings2, Users, Beef, Layers3, TrendingUp, CalendarDays, Utensils, ArrowUpRight } from "lucide-react";
import { styles } from "@/lib/styles";
import { ListHeader, BackHeader, SectionTitle, EmptyHint, InputField, PrimaryButton } from "./UI";
import ConfinamentoTab from "./ConfinamentoTab";

export default function ClientesTab({
  clientes, lotes, pesagens, consumos, saidas = [], leiturasCocho = [], cargasVagao = [], ingredientesMs = [], dietas = [], clientesUsuarios = [], currais = [], curralOcupacoes = [], view, setView,
  onAddCliente, onUpdateCliente, onDeleteCliente,
  onAddLote, onUpdateLote, onDeleteLote,
  onAddPesagem, onDeletePesagem,
  onAddSaida, onDeleteSaida,
  onAddConsumo, onUpdateConsumo, onDeleteConsumo, onImportarConsumos,
  onRegistrarLeituraCocho, onImportarLeiturasCocho,
  onImportarCargas, onExcluirCarga, onSalvarMsIngrediente, onSincronizarCustosMs,
  onAddDieta, onUpdateDieta, onDeleteDieta,
  onAddCurral, onUpdateCurral, onDeleteCurral, onImportarCurrais, onMoverLoteParaCurral,
  onRemoveAcessoCliente, onUpdateAcessoCliente,
}) {
  const [abaGeral, setAbaGeral] = useState("clientes");
  const [buscaCliente, setBuscaCliente] = useState("");

  if (view.screen === "confinamento") {
    const cliente = clientes.find((c) => c.id === view.id);
    if (!cliente) return <EmptyHint text="Cliente não encontrado." />;
    const lotesCliente = lotes.filter((l) => l.cliente_id === cliente.id);
    const loteIdsCliente = new Set(lotesCliente.map((l) => l.id));
    const pesagensCliente = pesagens.filter((p) => loteIdsCliente.has(p.lote_id));
    const consumosCliente = consumos.filter((c) => loteIdsCliente.has(c.lote_id));
    const saidasCliente = saidas.filter((s) => loteIdsCliente.has(s.lote_id));
    const leiturasCochoCliente = leiturasCocho.filter((l) => loteIdsCliente.has(l.lote_id));
    const cargasCliente = cargasVagao.filter((c) => c.cliente_id === cliente.id);
    const ingredientesMsCliente = ingredientesMs.filter((i) => i.cliente_id === cliente.id);
    const dietasCliente = dietas.filter((d) => d.cliente_id === cliente.id);
    const curraisCliente = currais.filter((c) => c.cliente_id === cliente.id);
    const curralIdsCliente = new Set(curraisCliente.map((c) => c.id));
    const curralOcupacoesCliente = curralOcupacoes.filter((o) => curralIdsCliente.has(o.curral_id));
    return (
      <ConfinamentoTab
        cliente={cliente}
        lotes={lotesCliente}
        pesagens={pesagensCliente}
        consumos={consumosCliente}
        saidas={saidasCliente}
        leiturasCocho={leiturasCochoCliente}
        cargasVagao={cargasCliente}
        ingredientesMs={ingredientesMsCliente}
        dietas={dietasCliente}
        currais={curraisCliente}
        curralOcupacoes={curralOcupacoesCliente}
        onAdicionar={(dados) => onAddLote(cliente.id, dados)}
        onAtualizar={onUpdateLote}
        onExcluir={onDeleteLote}
        onAdicionarPesagem={onAddPesagem}
        onExcluirPesagem={onDeletePesagem}
        onAdicionarSaida={onAddSaida}
        onExcluirSaida={onDeleteSaida}
        onAdicionarConsumo={onAddConsumo}
        onAtualizarConsumo={onUpdateConsumo}
        onExcluirConsumo={onDeleteConsumo}
        onImportarConsumos={onImportarConsumos}
        onRegistrarLeituraCocho={onRegistrarLeituraCocho}
        onImportarLeiturasCocho={onImportarLeiturasCocho}
        onImportarCargas={onImportarCargas && ((linhas) => onImportarCargas(cliente.id, linhas))}
        onExcluirCarga={onExcluirCarga}
        onSalvarMsIngrediente={onSalvarMsIngrediente && ((ingrediente) => onSalvarMsIngrediente(cliente.id, ingrediente))}
        onSincronizarCustosMs={onSincronizarCustosMs}
        onAdicionarDieta={onAddDieta && ((dados) => onAddDieta(cliente.id, dados))}
        onAtualizarDieta={onUpdateDieta}
        onExcluirDieta={onDeleteDieta}
        onAdicionarCurral={onAddCurral}
        onAtualizarCurral={onUpdateCurral}
        onExcluirCurral={onDeleteCurral}
        onImportarCurrais={onImportarCurrais}
        onMoverLoteParaCurral={onMoverLoteParaCurral}
        onAtualizarCliente={onUpdateCliente}
        onBack={() => setView({ screen: "list" })}
        onGerenciarCliente={() => setView({ screen: "cliente-detalhe", id: cliente.id })}
      />
    );
  }

  if (view.screen === "novo-cliente") {
    return <FormCliente onCancel={() => setView({ screen: "list" })} onSave={onAddCliente} />;
  }

  if (view.screen === "editar-cliente") {
    const cliente = clientes.find((c) => c.id === view.id);
    if (!cliente) return <EmptyHint text="Cliente não encontrado." />;
    return (
      <FormCliente
        cliente={cliente}
        onCancel={() => setView({ screen: "cliente-detalhe", id: cliente.id })}
        onSave={async (dados) => {
          await onUpdateCliente(cliente.id, dados);
          setView({ screen: "cliente-detalhe", id: cliente.id });
        }}
      />
    );
  }

  if (view.screen === "cliente-detalhe") {
    const cliente = clientes.find((c) => c.id === view.id);
    if (!cliente) return <EmptyHint text="Cliente não encontrado." />;
    const lotesCliente = lotes.filter((l) => l.cliente_id === cliente.id);
    const lotesAtivos = lotesCliente.filter((l) => !l.data_saida).length;
    const linkPortal = "https://confinamento-nine.vercel.app/portal";
    const pessoasComAcesso = clientesUsuarios.filter((cu) => cu.cliente_id === cliente.id);

    return (
      <div>
        <div style={styles.backHeaderRow}>
          <BackHeader title={cliente.nome} onBack={() => setView({ screen: "list" })} semMargem />
          <button onClick={() => setView({ screen: "editar-cliente", id: cliente.id })} style={styles.editLinkBtn}>Editar</button>
        </div>
        <div style={styles.card}>
          <FieldRow label="Contato" value={cliente.contato || "—"} />
          <FieldRow label="Telefone" value={cliente.telefone || "—"} />
          <FieldRow label="Endereço" value={cliente.endereco || "—"} />
        </div>

        {(cliente.ms_adaptacao != null || cliente.ms_recria != null || cliente.ms_crescimento != null || cliente.ms_terminacao != null) && (
          <>
            <SectionTitle>Matéria seca (MS) da dieta por fase</SectionTitle>
            <div style={styles.card}>
              <FieldRow label="Adaptação" value={cliente.ms_adaptacao != null ? `${cliente.ms_adaptacao}%` : "—"} />
              <FieldRow label="Recria" value={cliente.ms_recria != null ? `${cliente.ms_recria}%` : "—"} />
              <FieldRow label="Crescimento" value={cliente.ms_crescimento != null ? `${cliente.ms_crescimento}%` : "—"} />
              <FieldRow label="Terminação" value={cliente.ms_terminacao != null ? `${cliente.ms_terminacao}%` : "—"} />
            </div>
          </>
        )}

        <SectionTitle>Acesso ao portal</SectionTitle>
        <div style={styles.card}>
          <FieldRow label="Código de convite" value={cliente.codigo_convite} />
          <FieldRow label="Link do portal" value={linkPortal} />
          <div style={{ fontSize: 12, color: "#9A9A94", padding: "8px 0" }}>
            Envie esse link e o código para quem precisar de acesso a essa fazenda. Cada
            pessoa cria a própria conta e digita esse código — pode liberar para várias
            pessoas com o mesmo código.
          </div>
        </div>

        {pessoasComAcesso.length > 0 && (
          <>
            <SectionTitle>Pessoas com acesso</SectionTitle>
            <div style={{ fontSize: 11.5, color: "#9A9A94", padding: "0 4px 8px", marginTop: -6 }}>
              "Administrador" tem acesso total, incluindo relatórios de visita. "Editor" cria e edita dados do confinamento. "Leitor" só visualiza.
            </div>
            {pessoasComAcesso.map((pessoa) => (
              <div key={pessoa.id} style={styles.rowCard}>
                <div style={{ flex: 1 }}>{pessoa.email || "—"}</div>
                {onUpdateAcessoCliente && (
                  <select
                    value={pessoa.papel || "editor"}
                    onChange={(e) => onUpdateAcessoCliente(pessoa.id, { papel: e.target.value })}
                    style={{ fontSize: 12, color: "#5C5C58", background: "#F1EFE8", border: "none", borderRadius: 8, padding: "5px 8px", fontFamily: "inherit", marginRight: 6 }}
                  >
                    <option value="administrador">Administrador</option>
                    <option value="editor">Editor</option>
                    <option value="leitor">Leitor</option>
                  </select>
                )}
                {onRemoveAcessoCliente && (
                  <button
                    onClick={() => {
                      if (confirm(`Remover o acesso de ${pessoa.email || "essa pessoa"} a ${cliente.nome}?`)) {
                        onRemoveAcessoCliente(pessoa.id);
                      }
                    }}
                    style={{ background: "transparent", border: "none", color: "#B8763E", cursor: "pointer", padding: 4, display: "flex" }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </>
        )}

        <SectionTitle>Confinamento</SectionTitle>
        <button style={styles.listItem} onClick={() => setView({ screen: "confinamento", id: cliente.id })}>
          <div style={styles.avatar}>{lotesCliente.length}</div>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={styles.listItemTitle}>Ver confinamento</div>
            <div style={styles.listItemSub}>
              {lotesCliente.length === 0
                ? "Nenhum lote cadastrado ainda"
                : `${lotesAtivos} lote(s) ativo(s) de ${lotesCliente.length} no total`}
            </div>
          </div>
        </button>

        <button
          onClick={async () => {
            if (confirm(`Excluir ${cliente.nome}? Isso também apaga os lotes de confinamento dele. Essa ação não pode ser desfeita.`)) {
              await onDeleteCliente(cliente.id);
              setView({ screen: "list" });
            }
          }}
          style={styles.dangerLinkBtn}
        >
          <Trash2 size={14} /> Excluir cliente
        </button>
      </div>
    );
  }

  const termoBusca = buscaCliente.trim().toLocaleLowerCase("pt-BR");
  const ordenados = [...clientes]
    .filter((cliente) => !termoBusca || cliente.nome.toLocaleLowerCase("pt-BR").includes(termoBusca))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <div>
      <div style={styles.viewToggle}>
        <button
          onClick={() => setAbaGeral("painel")}
          style={{ ...styles.viewToggleBtn, ...(abaGeral === "painel" ? styles.viewToggleBtnActive : {}), flex: 1, justifyContent: "center", padding: "7px 10px" }}
        >
          Gestão
        </button>
        <button
          onClick={() => setAbaGeral("clientes")}
          style={{ ...styles.viewToggleBtn, ...(abaGeral === "clientes" ? styles.viewToggleBtnActive : {}), flex: 1, justifyContent: "center", padding: "7px 10px" }}
        >
          Clientes
        </button>
      </div>

      {abaGeral === "painel" ? (
        <PainelGeral clientes={clientes} lotes={lotes} saidas={saidas} consumos={consumos} cargasVagao={cargasVagao} setView={setView} />
      ) : (
        <>
          <ListHeader title="Clientes" actionLabel="Novo cliente" onAction={() => setView({ screen: "novo-cliente" })} />
          {clientes.length > 0 && (
            <label style={styles.searchBox}>
              <Search size={16} color="#8A8A86" />
              <input
                value={buscaCliente}
                onChange={(e) => setBuscaCliente(e.target.value)}
                placeholder="Buscar fazenda ou cliente"
                style={styles.searchInput}
              />
            </label>
          )}
          {ordenados.length === 0 && (
            <EmptyHint text={clientes.length === 0 ? "Cadastre seu primeiro cliente para começar." : "Nenhum cliente encontrado."} />
          )}
          <div className="desktop-clients-grid">
          {ordenados.map((c) => (
            <div key={c.id} style={styles.clientListRow} className="desktop-client-card">
              <button style={styles.clientMainBtn} onClick={() => setView({ screen: "confinamento", id: c.id })}>
                <div style={styles.avatar}>{c.nome.charAt(0)}</div>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={styles.listItemTitle}>{c.nome}</div>
                  <div style={styles.listItemSub}>{c.contato || "Abrir confinamento"}</div>
                </div>
              </button>
              <button
                onClick={() => setView({ screen: "cliente-detalhe", id: c.id })}
                style={styles.clientSettingsBtn}
                title="Cadastro e acessos"
                aria-label={`Cadastro e acessos de ${c.nome}`}
              >
                <Settings2 size={17} />
              </button>
            </div>
          ))}
          </div>
        </>
      )}
    </div>
  );
}

const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function PainelGeral({ clientes, lotes, saidas, consumos = [], cargasVagao = [], setView }) {
  const hoje = new Date();
  const anosComDados = [...new Set([
    hoje.getFullYear(),
    ...lotes.map((l) => Number(String(l.data_entrada || "").slice(0, 4))),
    ...consumos.map((c) => Number(String(c.data || "").slice(0, 4))),
  ].filter((ano) => Number.isFinite(ano) && ano > 2000))].sort((a, b) => b - a);
  const [ano, setAno] = useState(anosComDados[0] || hoje.getFullYear());

  const saidasPorLote = new Map();
  for (const saida of saidas) {
    if (!saidasPorLote.has(saida.lote_id)) saidasPorLote.set(saida.lote_id, []);
    saidasPorLote.get(saida.lote_id).push(saida);
  }

  const cabecasNaData = (lote, dataISO) => {
    if (!lote.data_entrada || lote.data_entrada > dataISO || (lote.data_saida && lote.data_saida < dataISO)) return 0;
    const retiradas = (saidasPorLote.get(lote.id) || [])
      .filter((saida) => saida.data && saida.data <= dataISO)
      .reduce((soma, saida) => soma + Number(saida.num_cabecas || 0), 0);
    return Math.max(0, Number(lote.num_cabecas || 0) - retiradas);
  };

  const meses = MESES_CURTOS.map((nome, indice) => {
    const inicio = `${ano}-${String(indice + 1).padStart(2, "0")}-01`;
    const dias = new Date(ano, indice + 1, 0).getDate();
    const fim = `${ano}-${String(indice + 1).padStart(2, "0")}-${dias}`;
    let animaisDia = 0;
    const clientesAtivos = new Set();
    for (let dia = 1; dia <= dias; dia += 1) {
      const data = `${ano}-${String(indice + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
      for (const lote of lotes) {
        const cabecas = cabecasNaData(lote, data);
        animaisDia += cabecas;
        if (cabecas > 0) clientesAtivos.add(lote.cliente_id);
      }
    }
    const entradas = lotes.filter((l) => l.data_entrada >= inicio && l.data_entrada <= fim).reduce((s, l) => s + Number(l.num_cabecas || 0), 0);
    const saidasParciais = saidas.filter((s) => s.data >= inicio && s.data <= fim).reduce((total, s) => total + Number(s.num_cabecas || 0), 0);
    const saidasDiretas = lotes.filter((l) => l.data_saida >= inicio && l.data_saida <= fim && !(saidasPorLote.get(l.id) || []).length).reduce((s, l) => s + Number(l.num_cabecas || 0), 0);
    return {
      nome,
      media: Math.round(animaisDia / dias),
      fechamento: lotes.reduce((s, lote) => s + cabecasNaData(lote, fim), 0),
      entradas,
      saidas: saidasParciais + saidasDiretas,
      clientes: clientesAtivos.size,
      consumo: consumos.filter((c) => c.data >= inicio && c.data <= fim).reduce((s, c) => s + Number(c.consumo_total_lote || 0), 0) / 1000,
      cargas: cargasVagao.filter((c) => c.data >= inicio && c.data <= fim).length,
    };
  });

  const hojeISO = hoje.toISOString().slice(0, 10);
  const lotesAtivos = lotes.map((lote) => ({ lote, cabecas: cabecasNaData(lote, hojeISO) })).filter((item) => item.cabecas > 0);
  const animaisAgora = lotesAtivos.reduce((s, item) => s + item.cabecas, 0);
  const clientesAgora = new Set(lotesAtivos.map((item) => item.lote.cliente_id)).size;
  const mesesConsiderados = ano === hoje.getFullYear() ? hoje.getMonth() + 1 : 12;
  const mediaAnual = Math.round(meses.slice(0, mesesConsiderados).reduce((s, mes) => s + mes.media, 0) / mesesConsiderados);
  const entradasAno = meses.reduce((s, mes) => s + mes.entradas, 0);
  const saidasAno = meses.reduce((s, mes) => s + mes.saidas, 0);
  const consumoAno = meses.reduce((s, mes) => s + mes.consumo, 0);
  const mesAtual = ano === hoje.getFullYear() ? hoje.getMonth() : 11;
  const variacao = meses[mesAtual - 1]?.media > 0
    ? ((meses[mesAtual].media - meses[mesAtual - 1].media) / meses[mesAtual - 1].media) * 100
    : null;

  const porCliente = clientes.map((cliente) => {
    const lotesCliente = lotesAtivos.filter((item) => item.lote.cliente_id === cliente.id);
    const ids = new Set(lotes.filter((l) => l.cliente_id === cliente.id).map((l) => l.id));
    return {
      cliente,
      lotes: lotesCliente.length,
      cabecas: lotesCliente.reduce((s, item) => s + item.cabecas, 0),
      entradas: lotes.filter((l) => l.cliente_id === cliente.id && String(l.data_entrada).startsWith(`${ano}-`)).reduce((s, l) => s + Number(l.num_cabecas || 0), 0),
      consumo: consumos.filter((c) => ids.has(c.lote_id) && String(c.data).startsWith(`${ano}-`)).reduce((s, c) => s + Number(c.consumo_total_lote || 0), 0) / 1000,
    };
  }).filter((item) => item.cabecas > 0 || item.entradas > 0).sort((a, b) => b.cabecas - a.cabecas);

  const comparativoAnual = anosComDados.map((anoItem) => {
    const entradas = lotes.filter((l) => String(l.data_entrada).startsWith(`${anoItem}-`)).reduce((s, l) => s + Number(l.num_cabecas || 0), 0);
    const clientesAno = new Set(lotes.filter((l) => String(l.data_entrada).startsWith(`${anoItem}-`)).map((l) => l.cliente_id)).size;
    const consumo = consumos.filter((c) => String(c.data).startsWith(`${anoItem}-`)).reduce((s, c) => s + Number(c.consumo_total_lote || 0), 0) / 1000;
    const saidasRegistradas = saidas.filter((s) => String(s.data).startsWith(`${anoItem}-`)).reduce((total, s) => total + Number(s.num_cabecas || 0), 0);
    const saidasDiretas = lotes.filter((l) => String(l.data_saida).startsWith(`${anoItem}-`) && !(saidasPorLote.get(l.id) || []).length).reduce((total, l) => total + Number(l.num_cabecas || 0), 0);
    return { ano: anoItem, entradas, abatidos: saidasRegistradas + saidasDiretas, clientes: clientesAno, consumo };
  });
  if (lotes.length === 0) return <EmptyHint text="Cadastre os primeiros lotes para começar a análise da consultoria." />;

  return (
    <div className="gestao-dashboard">
      <div className="gestao-hero">
        <div>
          <div className="gestao-eyebrow">VISÃO EXECUTIVA</div>
          <h2>Gestão da consultoria</h2>
          <p>Volume atendido, evolução do confinamento e movimentação dos clientes.</p>
        </div>
        <label className="gestao-year-filter">
          <CalendarDays size={16} />
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))}>
            {anosComDados.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>

      <div className="gestao-kpis">
        <KpiGestao icone={<Beef size={18} />} rotulo="Animais agora" valor={animaisAgora.toLocaleString("pt-BR")} detalhe={`${lotesAtivos.length} lotes ativos`} destaque />
        <KpiGestao icone={<Users size={18} />} rotulo="Clientes ativos" valor={clientesAgora.toLocaleString("pt-BR")} detalhe={`${clientes.length} cadastrados`} />
        <KpiGestao icone={<TrendingUp size={18} />} rotulo="Média mensal" valor={mediaAnual.toLocaleString("pt-BR")} detalhe="cabeças/dia no ano" />
        <KpiGestao icone={<ArrowUpRight size={18} />} rotulo={`Entradas em ${ano}`} valor={entradasAno.toLocaleString("pt-BR")} detalhe={`${saidasAno.toLocaleString("pt-BR")} saídas`} />
        <KpiGestao icone={<Utensils size={18} />} rotulo="Consumo no ano" valor={`${consumoAno.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} t`} detalhe={`${cargasVagao.filter((c) => String(c.data).startsWith(`${ano}-`)).length} cargas registradas`} />
      </div>

      <div className="gestao-chart-grid">
        <CardGrafico titulo="Animais confinados por mês" subtitulo="Média diária de cabeças acompanhadas — mede o volume real do serviço">
          <GraficoArea dados={meses.map((m) => m.media)} rotulos={MESES_CURTOS} />
          <div className="gestao-chart-note">{variacao == null ? "Selecione um ano com histórico para comparar a evolução." : `${variacao >= 0 ? "+" : ""}${variacao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% em relação ao mês anterior`}</div>
        </CardGrafico>
        <CardGrafico titulo="Movimentação mensal" subtitulo="Entradas e saídas de animais por mês">
          <GraficoBarrasDuplas dados={meses} />
          <div className="gestao-legend"><span><i className="entrada" /> Entradas</span><span><i className="saida" /> Saídas</span></div>
        </CardGrafico>
      </div>

      <CardGrafico titulo="Consumo acompanhado" subtitulo="Matéria natural registrada por mês, em toneladas">
        <GraficoBarras dados={meses.map((m) => m.consumo)} rotulos={MESES_CURTOS} />
      </CardGrafico>

      <div className="gestao-chart-grid">
        <CardGrafico titulo="Animais abatidos por mês" subtitulo={`Cabeças com saída registrada em cada mês de ${ano}`}>
          <GraficoBarras dados={meses.map((m) => m.saidas)} rotulos={MESES_CURTOS} />
        </CardGrafico>
        <CardGrafico titulo="Animais abatidos por ano" subtitulo="Comparativo anual de cabeças com saída registrada">
          <GraficoBarras dados={comparativoAnual.map((item) => item.abatidos)} rotulos={comparativoAnual.map((item) => String(item.ano))} />
        </CardGrafico>
      </div>

      <div className="gestao-section-header"><div><span>DETALHAMENTO</span><h3>Desempenho mensal de {ano}</h3></div></div>
      <div className="gestao-table-wrap">
        <table className="gestao-table">
          <thead><tr><th>Mês</th><th>Média confinada</th><th>Fechamento</th><th>Entradas</th><th>Saídas</th><th>Clientes</th><th>Consumo</th><th>Cargas</th></tr></thead>
          <tbody>{meses.map((mes) => <tr key={mes.nome}><td><strong>{mes.nome}</strong></td><td>{mes.media.toLocaleString("pt-BR")}</td><td>{mes.fechamento.toLocaleString("pt-BR")}</td><td className="positive">+{mes.entradas.toLocaleString("pt-BR")}</td><td className="negative">−{mes.saidas.toLocaleString("pt-BR")}</td><td>{mes.clientes}</td><td>{mes.consumo.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t</td><td>{mes.cargas}</td></tr>)}</tbody>
        </table>
      </div>

      <div className="gestao-bottom-grid">
        <div className="gestao-panel">
          <div className="gestao-panel-title"><div><span>CARTEIRA DE CLIENTES</span><h3>Clientes em acompanhamento</h3></div></div>
          {porCliente.map(({ cliente, lotes: qtdLotes, cabecas, entradas, consumo }) => (
            <div key={cliente.id} className="gestao-client-row">
              <button className="gestao-client-main" onClick={() => setView({ screen: "confinamento", id: cliente.id })}><div className="gestao-client-avatar">{cliente.nome.charAt(0)}</div><div className="gestao-client-name"><strong>{cliente.nome}</strong><span>{qtdLotes} lotes ativos · {entradas.toLocaleString("pt-BR")} entradas no ano</span></div><div className="gestao-client-volume"><strong>{cabecas.toLocaleString("pt-BR")}</strong><span>animais · {consumo.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} t</span></div></button>
            </div>
          ))}
        </div>
        <div className="gestao-panel">
          <div className="gestao-panel-title"><div><span>EVOLUÇÃO</span><h3>Comparativo anual</h3></div><TrendingUp size={20} /></div>
          {comparativoAnual.map((item) => <div className="gestao-year-row" key={item.ano}><strong>{item.ano}</strong><div><b>{item.entradas.toLocaleString("pt-BR")}</b><span>animais recebidos</span></div><div><b>{item.abatidos.toLocaleString("pt-BR")}</b><span>animais abatidos</span></div><div><b>{item.clientes}</b><span>clientes</span></div><div><b>{item.consumo.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} t</b><span>consumo</span></div></div>)}
        </div>
      </div>
    </div>
  );
}

function KpiGestao({ icone, rotulo, valor, detalhe, destaque = false }) {
  return <div className={`gestao-kpi${destaque ? " destaque" : ""}`}><div className="gestao-kpi-icon">{icone}</div><span>{rotulo}</span><strong>{valor}</strong><small>{detalhe}</small></div>;
}

function CardGrafico({ titulo, subtitulo, children }) {
  return <section className="gestao-chart-card"><div className="gestao-card-heading"><div><h3>{titulo}</h3><p>{subtitulo}</p></div></div>{children}</section>;
}

function GraficoArea({ dados, rotulos }) {
  const max = Math.max(...dados, 1);
  const pontos = dados.map((valor, i) => ({ x: 38 + (i * 520) / 11, y: 168 - (valor / max) * 126, valor }));
  const linha = pontos.map((p) => `${p.x},${p.y}`).join(" ");
  const area = `38,168 ${linha} 558,168`;
  return <svg className="gestao-chart" viewBox="0 0 596 210" role="img" aria-label="Evolução mensal de animais confinados"><defs><linearGradient id="areaGestao" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2E7667" stopOpacity=".28"/><stop offset="1" stopColor="#2E7667" stopOpacity=".02"/></linearGradient></defs>{[42,84,126,168].map((y) => <line key={y} x1="38" x2="558" y1={y} y2={y} stroke="#EAE8E1" strokeWidth="1"/>)}<polygon points={area} fill="url(#areaGestao)"/><polyline points={linha} fill="none" stroke="#1F5B50" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>{pontos.map((p, i) => <g key={rotulos[i]}><circle cx={p.x} cy={p.y} r="4" fill="#fff" stroke="#1F5B50" strokeWidth="2.5"/><text x={p.x} y={Math.max(17, p.y - 10)} textAnchor="middle" className="gestao-svg-value">{p.valor}</text><text x={p.x} y="195" textAnchor="middle" className="gestao-svg-label">{rotulos[i]}</text></g>)}</svg>;
}

function GraficoBarrasDuplas({ dados }) {
  const max = Math.max(...dados.flatMap((m) => [m.entradas, m.saidas]), 1);
  return <svg className="gestao-chart" viewBox="0 0 596 210" role="img" aria-label="Entradas e saídas mensais">{[42,84,126,168].map((y) => <line key={y} x1="30" x2="566" y1={y} y2={y} stroke="#EAE8E1"/>)}{dados.map((m, i) => { const x = 39 + i * 44; const h1 = (m.entradas / max) * 126; const h2 = (m.saidas / max) * 126; return <g key={m.nome}><rect x={x} y={168-h1} width="13" height={h1} rx="3" fill="#2E7667"/><rect x={x+15} y={168-h2} width="13" height={h2} rx="3" fill="#D09159"/><text x={x+14} y="195" textAnchor="middle" className="gestao-svg-label">{m.nome}</text></g>; })}</svg>;
}

function GraficoBarras({ dados, rotulos }) {
  const max = Math.max(...dados, 1);
  return <svg className="gestao-chart gestao-chart-wide" viewBox="0 0 1180 210" role="img" aria-label="Consumo mensal em toneladas">{dados.map((valor, i) => { const h = (valor / max) * 126; const x = 50 + i * 94; return <g key={rotulos[i]}><rect x={x} y={168-h} width="54" height={h} rx="6" fill="#5B8F82"/><text x={x+27} y={Math.max(18, 158-h)} textAnchor="middle" className="gestao-svg-value">{valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</text><text x={x+27} y="195" textAnchor="middle" className="gestao-svg-label">{rotulos[i]}</text></g>; })}</svg>;
}

function FieldRow({ label, value }) {
  return (
    <div style={styles.field}>
      <div style={styles.fieldLabel}>{label}</div>
      <div style={styles.fieldValue}>{value}</div>
    </div>
  );
}

function FormCliente({ cliente, onCancel, onSave }) {
  const [nome, setNome] = useState(cliente?.nome || "");
  const [contato, setContato] = useState(cliente?.contato || "");
  const [telefone, setTelefone] = useState(cliente?.telefone || "");
  const [endereco, setEndereco] = useState(cliente?.endereco || "");
  const [msAdaptacao, setMsAdaptacao] = useState(cliente?.ms_adaptacao != null ? String(cliente.ms_adaptacao) : "");
  const [msRecria, setMsRecria] = useState(cliente?.ms_recria != null ? String(cliente.ms_recria) : "");
  const [msCrescimento, setMsCrescimento] = useState(cliente?.ms_crescimento != null ? String(cliente.ms_crescimento) : "");
  const [msTerminacao, setMsTerminacao] = useState(cliente?.ms_terminacao != null ? String(cliente.ms_terminacao) : "");
  const [salvando, setSalvando] = useState(false);
  const valido = nome.trim().length > 0;
  const editando = Boolean(cliente);

  async function handleSave() {
    setSalvando(true);
    try {
      await onSave({
        nome, contato, telefone, endereco,
        ms_adaptacao: msAdaptacao !== "" ? Number(msAdaptacao) : null,
        ms_recria: msRecria !== "" ? Number(msRecria) : null,
        ms_crescimento: msCrescimento !== "" ? Number(msCrescimento) : null,
        ms_terminacao: msTerminacao !== "" ? Number(msTerminacao) : null,
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <BackHeader title={editando ? "Editar cliente" : "Novo cliente"} onBack={onCancel} />
      <div style={styles.card}>
        <InputField label="Nome da fazenda/cliente *" value={nome} onChange={setNome} placeholder="Ex: Agropecuária Porto Pará" />
        <InputField label="Pessoa de contato" value={contato} onChange={setContato} placeholder="Ex: Daner e Denis" />
        <InputField label="Telefone" value={telefone} onChange={setTelefone} placeholder="(00) 00000-0000" />
        <InputField label="Endereço" value={endereco} onChange={setEndereco} placeholder="Rua, número, cidade" />
      </div>

      <SectionTitle>Matéria seca (MS) da dieta por fase</SectionTitle>
      <div style={styles.card}>
        <InputField label="Adaptação (%)" type="number" value={msAdaptacao} onChange={setMsAdaptacao} placeholder="Ex: 55" />
        <InputField label="Recria (%)" type="number" value={msRecria} onChange={setMsRecria} placeholder="Ex: 60" />
        <InputField label="Crescimento (%)" type="number" value={msCrescimento} onChange={setMsCrescimento} placeholder="Ex: 65" />
        <InputField label="Terminação (%)" type="number" value={msTerminacao} onChange={setMsTerminacao} placeholder="Ex: 70" />
        <div style={{ fontSize: 11.5, color: "#9A9A94", padding: "0 0 10px" }}>
          Vale para todos os lotes deste cliente — ao lançar o consumo, basta escolher a dieta que a MS já vem preenchida.
        </div>
      </div>

      <PrimaryButton disabled={!valido || salvando} onClick={handleSave}>
        {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Salvar cliente"}
      </PrimaryButton>
    </div>
  );
}
