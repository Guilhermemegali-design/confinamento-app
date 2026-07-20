"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { styles } from "@/lib/styles";
import { ListHeader, BackHeader, SectionTitle, EmptyHint, InputField, PrimaryButton } from "./UI";
import ConfinamentoTab from "./ConfinamentoTab";

export default function ClientesTab({
  clientes, lotes, pesagens, consumos, leiturasCocho = [], clientesUsuarios = [], currais = [], curralOcupacoes = [], view, setView,
  onAddCliente, onUpdateCliente, onDeleteCliente,
  onAddLote, onUpdateLote, onDeleteLote,
  onAddPesagem, onDeletePesagem,
  onAddConsumo, onUpdateConsumo, onDeleteConsumo, onImportarConsumos,
  onRegistrarLeituraCocho, onImportarLeiturasCocho,
  onAddCurral, onUpdateCurral, onDeleteCurral, onImportarCurrais, onMoverLoteParaCurral,
  onRemoveAcessoCliente,
}) {
  if (view.screen === "confinamento") {
    const cliente = clientes.find((c) => c.id === view.id);
    if (!cliente) return <EmptyHint text="Cliente não encontrado." />;
    const lotesCliente = lotes.filter((l) => l.cliente_id === cliente.id);
    const loteIdsCliente = new Set(lotesCliente.map((l) => l.id));
    const pesagensCliente = pesagens.filter((p) => loteIdsCliente.has(p.lote_id));
    const consumosCliente = consumos.filter((c) => loteIdsCliente.has(c.lote_id));
    const leiturasCochoCliente = leiturasCocho.filter((l) => loteIdsCliente.has(l.lote_id));
    const curraisCliente = currais.filter((c) => c.cliente_id === cliente.id);
    const curralIdsCliente = new Set(curraisCliente.map((c) => c.id));
    const curralOcupacoesCliente = curralOcupacoes.filter((o) => curralIdsCliente.has(o.curral_id));
    return (
      <ConfinamentoTab
        cliente={cliente}
        lotes={lotesCliente}
        pesagens={pesagensCliente}
        consumos={consumosCliente}
        leiturasCocho={leiturasCochoCliente}
        currais={curraisCliente}
        curralOcupacoes={curralOcupacoesCliente}
        onAdicionar={(dados) => onAddLote(cliente.id, dados)}
        onAtualizar={onUpdateLote}
        onExcluir={onDeleteLote}
        onAdicionarPesagem={onAddPesagem}
        onExcluirPesagem={onDeletePesagem}
        onAdicionarConsumo={onAddConsumo}
        onAtualizarConsumo={onUpdateConsumo}
        onExcluirConsumo={onDeleteConsumo}
        onImportarConsumos={onImportarConsumos}
        onRegistrarLeituraCocho={onRegistrarLeituraCocho}
        onImportarLeiturasCocho={onImportarLeiturasCocho}
        onAdicionarCurral={onAddCurral}
        onAtualizarCurral={onUpdateCurral}
        onExcluirCurral={onDeleteCurral}
        onImportarCurrais={onImportarCurrais}
        onMoverLoteParaCurral={onMoverLoteParaCurral}
        onAtualizarCliente={onUpdateCliente}
        onBack={() => setView({ screen: "cliente-detalhe", id: cliente.id })}
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
            {pessoasComAcesso.map((pessoa) => (
              <div key={pessoa.id} style={styles.rowCard}>
                <div style={{ flex: 1 }}>{pessoa.email || "—"}</div>
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

  const ordenados = [...clientes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <div>
      <ListHeader title="Clientes" actionLabel="Novo cliente" onAction={() => setView({ screen: "novo-cliente" })} />
      {ordenados.length === 0 && <EmptyHint text="Cadastre seu primeiro cliente para começar." />}
      {ordenados.map((c) => (
        <button key={c.id} style={styles.listItem} onClick={() => setView({ screen: "cliente-detalhe", id: c.id })}>
          <div style={styles.avatar}>{c.nome.charAt(0)}</div>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={styles.listItemTitle}>{c.nome}</div>
            <div style={styles.listItemSub}>{c.contato || "Sem contato informado"}</div>
          </div>
        </button>
      ))}
    </div>
  );
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
