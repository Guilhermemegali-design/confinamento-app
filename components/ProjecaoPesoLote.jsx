"use client";

import { useState } from "react";
import { Field, InputField, PrimaryButton, SectionTitle } from "./UI";
import { styles } from "@/lib/styles";
import { dataLocalFazenda, numeroDecimal, validarHistoricoDietas } from "@/lib/confinamento";
import { formatDataBR } from "@/lib/format";

const numero = (v, casas = 1) => v == null ? "—" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

export default function ProjecaoPesoLote({ lote, projecao, gmdPrevistoMedio, dietas = [], onSalvar }) {
  const periodoVazio = () => ({dieta_id:"",dieta_nome:"",data_inicio:lote.data_entrada || "",gmd_previsto:""});
  const [editando, setEditando] = useState(Boolean(onSalvar && !lote.historico_dietas?.length));
  const [periodos, setPeriodos] = useState(() => lote.historico_dietas?.length ? lote.historico_dietas.map((p) => ({...p})) : [periodoVazio()]);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [original, setOriginal] = useState(lote.historico_dietas ?? []);
  const hoje = dataLocalFazenda(lote.fuso_horario || "America/Sao_Paulo");
  const r = projecao;
  const historico = [...(lote.historico_dietas || [])].sort((a,b) => a.data_inicio.localeCompare(b.data_inicio));
  function abrir() {
    setPeriodos(historico.length ? historico.map((p) => ({ ...p })) : [periodoVazio()]);
    setOriginal(lote.historico_dietas ?? []);
    setErro(""); setEditando(true);
  }
  function alterar(i, campo, valor) {
    setPeriodos((atuais) => atuais.map((p, n) => {
      if (n !== i) return p;
      if (campo !== "dieta_id") return { ...p, [campo]: valor };
      const dieta = dietas.find((d) => d.id === valor);
      return { ...p, dieta_id: valor, dieta_nome: dieta?.nome || "", gmd_previsto: dieta?.gmd_previsto ?? "" };
    }));
  }
  async function salvar() {
    setErro("");
    const normalizados = periodos.map((p) => ({ dieta_id: p.dieta_id || null, dieta_nome: p.dieta_nome || "", data_inicio: p.data_inicio, gmd_previsto: numeroDecimal(p.gmd_previsto) })).sort((a,b) => a.data_inicio.localeCompare(b.data_inicio));
    const erros = validarHistoricoDietas(normalizados, lote);
    if (periodos.some((p) => String(p.gmd_previsto ?? "").trim() && numeroDecimal(p.gmd_previsto) == null)) erros.push("GMD inválido. Use um decimal como 1,450.");
    if (erros.length) { setErro(erros.join(" ")); return; }
    setSalvando(true);
    try {
      await onSalvar({ historico_dietas: normalizados }, original);
      setEditando(false);
    } catch (e) { setErro(e.message || "Não foi possível salvar o histórico."); }
    finally { setSalvando(false); }
  }
  return <section aria-label="Projeção de peso por dieta">
    <SectionTitle>Projeção de peso por dieta</SectionTitle>
    {lote.historico_dietas_trato && <p style={{fontSize:13}}>Dietas e períodos identificados automaticamente pelas entregas do Trato Certo. Cadastre o GMD por dieta para atualizar todos os lotes.</p>}
    {onSalvar && !editando && <div style={{marginBottom:12}}><PrimaryButton onClick={abrir}>Registrar GMD por dieta no lote</PrimaryButton></div>}
    {editando && <div style={styles.card}>
      <h2 style={{fontSize:18,marginTop:0}}>Registrar GMD por dieta no lote</h2>
      <p>Cada início encerra o período anterior nessa data, sem repetir dias. O GMD é copiado do cadastro ao escolher a dieta; corrija o valor aplicado somente se necessário. Registrar o GMD por dieta atualiza também os valores dos períodos anteriores vinculados a ela.</p>
      {periodos.map((p,i) => <div key={i} style={{borderTop:"1px solid #ddd",paddingTop:12}}>
        <label style={styles.field}><div style={styles.fieldLabel}>Dieta do período</div><select aria-label={`Dieta do período ${i+1}`} style={styles.input} value={p.dieta_id || ""} onChange={(e)=>alterar(i,"dieta_id",e.target.value)}>
          <option value="">Não informada</option>
          {p.dieta_id && !dietas.some((d)=>d.id===p.dieta_id) && <option value={p.dieta_id}>{p.dieta_nome} (cadastro indisponível)</option>}
          {dietas.map((d)=><option key={d.id} value={d.id}>{d.nome}</option>)}
        </select></label>
        <InputField label={`Data de início do período ${i+1}`} type="date" min={lote.data_entrada} value={p.data_inicio || ""} onChange={(v)=>alterar(i,"data_inicio",v)} />
        <InputField label={`Registrar GMD por dieta — período ${i+1} (kg/cabeça/dia)`} inputMode="decimal" value={p.gmd_previsto ?? ""} placeholder="Não informado" onChange={(v)=>alterar(i,"gmd_previsto",v)} />
        <button disabled={salvando} style={styles.linkBtn} onClick={()=>setPeriodos((ps)=>ps.filter((_,n)=>n!==i))}>Remover período {i+1}</button>
      </div>)}
      <button disabled={salvando} style={styles.editLinkBtn} onClick={()=>setPeriodos((ps)=>[...ps,{dieta_id:"",dieta_nome:"",data_inicio:ps.length ? hoje : lote.data_entrada,gmd_previsto:""}])}>+ Adicionar período</button>
      {erro && <div role="alert" style={styles.errorBox}>{erro}</div>}
      <PrimaryButton disabled={salvando} onClick={salvar}>{salvando ? "Salvando..." : "Salvar dieta e GMD do lote"}</PrimaryButton>
      <button disabled={salvando} style={styles.linkBtn} onClick={()=>setEditando(false)}>Cancelar</button>
    </div>}
    <div style={styles.card}>
      <Field label={lote.data_saida ? "Dieta na data de encerramento" : "Dieta atual"} value={r.dietaAtual?.dieta_nome || "Não informada"} />
      <Field label="GMD previsto atual" value={r.dietaAtual?.gmd_previsto != null ? `${numero(r.dietaAtual.gmd_previsto, 3)} kg/cabeça/dia` : "Não informado"} />
      <Field label={r.referenciaTipo === "pesagem" ? "Último peso médio real — pesagem" : "Peso médio real de referência — entrada"} value={`${numero(r.pesoReferencia)} kg/cabeça · ${formatDataBR(r.dataReferencia)}`} />
      <Field label="Dias desde a referência" value={r.diasDesdeReferencia ?? "—"} />
      <Field label="Ganho previsto acumulado" value={r.ganhoPrevisto == null ? "—" : `${numero(r.ganhoPrevisto)} kg/cabeça`} />
      <Field label={lote.data_saida ? `Peso médio esperado na saída (${formatDataBR(r.dataAlvo)})` : "Peso médio esperado hoje"} value={r.completa ? `${numero(r.pesoEsperado)} kg/cabeça` : "Projeção incompleta"} highlight />
      <Field label={lote.data_saida ? "GMD previsto médio até a saída" : "GMD previsto médio até hoje"} value={gmdPrevistoMedio == null ? "—" : `${numero(gmdPrevistoMedio,3)} kg/cabeça/dia`} />
      {!r.completa && <div role="status" style={styles.errorBox}>{r.pendencias.join(" ")}</div>}
      <p style={{fontSize:12, color:"#666"}}>Dias corridos completos no fuso {lote.fuso_horario || "America/Sao_Paulo"}. Na data da referência, o ganho é zero.</p>
      {historico.map((p,i) => <div key={`${p.data_inicio}-${i}`} style={{padding:"8px 0",borderTop:"1px solid #eee",fontSize:13}}>
        <strong>{p.dieta_nome || "Dieta não informada"}</strong> · {formatDataBR(p.data_inicio)} até {historico[i+1] ? `${formatDataBR(historico[i+1].data_inicio)} (sem incluir esse dia)` : lote.data_saida ? formatDataBR(lote.data_saida) : "próxima troca"}<br />
        {p.inicio_inferido && <>Dieta inicial aplicada desde a entrada; primeiro registro em {formatDataBR(p.data_primeiro_registro)}.<br /></>}
        {p.transicao_dietas ? "GMD médio da transição" : "GMD aplicado"}: {p.gmd_previsto == null ? "Não informado" : `${numero(p.gmd_previsto,3)} kg/cabeça/dia`}
      </div>)}
    </div>

  </section>;
}
