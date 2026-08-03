"use client";

import { useState } from "react";
import { FileText, ChevronLeft, Calendar as CalendarIcon, List, ChevronRight, Paperclip, Download } from "lucide-react";
import { styles } from "@/lib/styles";
import { formatDataBR } from "@/lib/format";
import { BackHeader, SectionTitle, EmptyHint, Field } from "./UI";

const MESES_LONGOS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

function normalizarFotos(fotos) {
  if (!fotos) return [];
  return fotos.map((f) => (typeof f === "string" ? { url: f, descricao: "" } : f));
}

export default function RelatoriosPortalTab({ relatorios }) {
  const [view, setView] = useState({ screen: "list" });

  if (view.screen === "detalhe") {
    const r = relatorios.find((x) => x.id === view.id);
    if (!r) return <EmptyHint text="Relatório não encontrado." />;
    return <RelatorioDetalhe relatorio={r} onBack={() => setView({ screen: "list" })} />;
  }

  const ordenados = [...relatorios].sort((a, b) => b.data.localeCompare(a.data));

  return (
    <RelatoriosLista
      relatorios={ordenados}
      onAbrirDetalhe={(id) => setView({ screen: "detalhe", id })}
    />
  );
}

function RelatoriosLista({ relatorios, onAbrirDetalhe }) {
  const [modo, setModo] = useState("lista");
  const [mesAtual, setMesAtual] = useState(() => {
    const hoje = new Date();
    return { ano: hoje.getFullYear(), mes: hoje.getMonth() };
  });
  const [diaSelecionado, setDiaSelecionado] = useState(null);

  const relatoriosPorDia = {};
  for (const r of relatorios) {
    (relatoriosPorDia[r.data] ||= []).push(r);
  }

  function mudarMes(delta) {
    setMesAtual(({ ano, mes }) => {
      const novoMes = mes + delta;
      if (novoMes < 0) return { ano: ano - 1, mes: 11 };
      if (novoMes > 11) return { ano: ano + 1, mes: 0 };
      return { ano, mes: novoMes };
    });
    setDiaSelecionado(null);
  }

  const primeiroDiaSemana = new Date(mesAtual.ano, mesAtual.mes, 1).getDay();
  const totalDias = new Date(mesAtual.ano, mesAtual.mes + 1, 0).getDate();
  const celulas = [];
  for (let i = 0; i < primeiroDiaSemana; i++) celulas.push(null);
  for (let dia = 1; dia <= totalDias; dia++) {
    celulas.push(`${mesAtual.ano}-${String(mesAtual.mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`);
  }

  const relatoriosDoDiaSelecionado = diaSelecionado ? (relatoriosPorDia[diaSelecionado] || []) : [];

  return (
    <div>
      <div style={styles.agendaHeaderRow}>
        <h1 style={styles.h1}>Relatórios</h1>
        <div style={styles.viewToggle}>
          <button onClick={() => setModo("calendario")} style={{ ...styles.viewToggleBtn, ...(modo === "calendario" ? styles.viewToggleBtnActive : {}) }}>
            <CalendarIcon size={15} />
          </button>
          <button onClick={() => setModo("lista")} style={{ ...styles.viewToggleBtn, ...(modo === "lista" ? styles.viewToggleBtnActive : {}) }}>
            <List size={15} />
          </button>
        </div>
      </div>

      {modo === "calendario" ? (
        <>
          <div style={styles.calMesNav}>
            <button onClick={() => mudarMes(-1)} style={styles.calNavBtn}><ChevronLeft size={18} /></button>
            <div style={styles.calMesLabel}>{MESES_LONGOS[mesAtual.mes]} {mesAtual.ano}</div>
            <button onClick={() => mudarMes(1)} style={styles.calNavBtn}><ChevronRight size={18} /></button>
          </div>

          <div style={styles.calGridHeader}>
            {DIAS_SEMANA.map((d, i) => <div key={i} style={styles.calDiaSemana}>{d}</div>)}
          </div>

          <div style={styles.calGrid}>
            {celulas.map((iso, i) => {
              if (!iso) return <div key={i} style={styles.calCelulaVazia} />;
              const relatoriosDoDia = relatoriosPorDia[iso] || [];
              const ehSelecionado = iso === diaSelecionado;
              const dia = Number(iso.split("-")[2]);
              return (
                <button
                  key={i}
                  onClick={() => setDiaSelecionado(iso === diaSelecionado ? null : iso)}
                  style={{ ...styles.calCelula, ...(ehSelecionado ? styles.calCelulaSelecionada : {}) }}
                >
                  <span style={{ ...styles.calCelulaDia, ...(ehSelecionado ? { color: "#fff" } : {}) }}>{dia}</span>
                  {relatoriosDoDia.length > 0 && (
                    <span style={{ ...styles.calCelulaPonto, ...(ehSelecionado ? { background: "#fff" } : {}) }} />
                  )}
                </button>
              );
            })}
          </div>

          {diaSelecionado && (
            <div style={{ marginTop: 18 }}>
              <div style={styles.sectionTitle}>{formatDataBR(diaSelecionado)}</div>
              {relatoriosDoDiaSelecionado.length === 0 && <EmptyHint text="Nenhum relatório neste dia." />}
              {relatoriosDoDiaSelecionado.map((r) => (
                <ItemRelatorio key={r.id} r={r} onClick={() => onAbrirDetalhe(r.id)} />
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ marginTop: 4 }}>
          {relatorios.length === 0 && <EmptyHint text="Nenhum relatório registrado ainda." />}
          {relatorios.map((r) => (
            <ItemRelatorio key={r.id} r={r} onClick={() => onAbrirDetalhe(r.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ItemRelatorio({ r, onClick }) {
  return (
    <button style={styles.listItem} onClick={onClick}>
      <div style={{ ...styles.avatar, background: "#1F4D45" }}>
        <FileText size={16} color="#fff" />
      </div>
      <div style={{ flex: 1, textAlign: "left" }}>
        <div style={styles.listItemTitle}>Visita {formatDataBR(r.data)}</div>
        <div style={styles.listItemSub}>{r.resumo ? (r.resumo.length > 60 ? r.resumo.slice(0, 60) + "..." : r.resumo) : "Sem resumo"}</div>
      </div>
    </button>
  );
}

function RelatorioDetalhe({ relatorio: r, onBack }) {
  return (
    <div>
      <BackHeader title={`Visita ${formatDataBR(r.data)}`} onBack={onBack} />

      <div style={styles.card}>
        <Field label="Data da visita" value={formatDataBR(r.data)} />
        <Field label="Resumo" value={r.resumo || "—"} multiline />
      </div>

      {r.fotos && r.fotos.length > 0 && (
        <>
          <SectionTitle>Fotos da visita</SectionTitle>
          <div style={styles.fotosDetalheLista}>
            {normalizarFotos(r.fotos).map((foto, i) => (
              <div key={i} style={styles.fotoDetalheItem}>
                <img src={foto.url} alt={`Foto ${i + 1}`} style={styles.fotoDetalheImg} />
                {foto.descricao && <div style={styles.fotoDetalheDescricao}>{foto.descricao}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {r.documentos && r.documentos.length > 0 && (
        <>
          <SectionTitle>Documentos anexados</SectionTitle>
          <div style={styles.card}>
            {r.documentos.map((doc, i) => (
              <a key={i} href={doc.url} target="_blank" rel="noopener noreferrer" style={styles.documentoRow}>
                <Paperclip size={15} color="#1F4D45" />
                <span style={styles.documentoNome}>{doc.nome}</span>
                <Download size={14} color="#9A9A94" />
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
