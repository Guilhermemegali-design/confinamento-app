"use client";
import { useState } from "react";
import { BackHeader, Field, InputField, PrimaryButton } from "./UI";
import { styles } from "@/lib/styles";
import { numeroDecimal } from "@/lib/confinamento";

export default function RegistrarGmdDietas({ dietas = [], lotes = [], onSalvar, onVoltar, dietaInicialId }) {
  const [dietaId, setDietaId] = useState(dietaInicialId || dietas[0]?.id || "");
  const [gmd, setGmd] = useState((dietaInicialId ? dietas.find((d) => d.id === dietaInicialId) : dietas[0])?.gmd_previsto ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const valor = numeroDecimal(gmd);
  const vinculados = lotes.filter((l) => (l.historico_dietas || []).some((p) => p.dieta_id === dietaId || p.dietas_ids?.includes(dietaId)));
  const semHistorico = lotes.filter((l) => !l.historico_dietas?.length);
  async function salvar() {
    if (!dietaId || valor == null || valor < 0) return;
    setErro(""); setSucesso(""); setSalvando(true);
    try {
      await onSalvar(dietaId, {gmd_previsto: valor});
      setSucesso(`GMD registrado. ${vinculados.length} lote(s) vinculado(s) recalculado(s), incluindo os períodos anteriores.`);
    } catch(e) { setErro(e.message || "Não foi possível registrar o GMD."); }
    finally { setSalvando(false); }
  }
  return <div>
    <BackHeader title="Registrar GMD por dieta" onBack={onVoltar} />
    <div style={styles.card}>
      <label style={styles.field}><div style={styles.fieldLabel}>Dieta importada do Trato Certo</div>
        <select aria-label="Dieta para registrar GMD" style={styles.input} disabled={salvando} value={dietaId} onChange={(e)=>{
          setDietaId(e.target.value); setGmd(dietas.find((d)=>d.id===e.target.value)?.gmd_previsto ?? ""); setSucesso(""); setErro("");
        }}>
          {!dietas.length && <option value="">Nenhuma receita do Trato Certo disponível</option>}
          {dietas.map((d)=><option key={d.id} value={d.id}>{d.nome}</option>)}
        </select>
      </label>
      <InputField label="Registrar GMD por dieta (kg/cabeça/dia)" inputMode="decimal" value={gmd} onChange={(v)=>{setGmd(v);setSucesso("");}} placeholder="Ex: 1,450" disabled={salvando} />
      <p style={{fontSize:13}}>As dietas e as datas de cada lote são identificadas automaticamente pelo histórico de entregas do Trato Certo. Informe o GMD uma vez por dieta.</p>
      <Field label="Lotes vinculados que serão recalculados" value={vinculados.length} />
      <p style={{fontSize:13}}>Ao salvar, este valor substituirá o GMD de todos os períodos desta dieta, inclusive os anteriores e os de lotes finalizados. O peso esperado será recalculado a partir da última pesagem real. As datas, as pesagens e as outras dietas serão preservadas.</p>
      <PrimaryButton disabled={salvando || !dietaId || valor == null || valor < 0} onClick={salvar}>{salvando ? "Salvando e recalculando..." : "Salvar GMD e recalcular lotes"}</PrimaryButton>
      {erro && <div role="alert" style={styles.errorBox}>{erro}</div>}
      {sucesso && <p role="status" style={{color:"#1F4D45"}}>{sucesso}</p>}
    </div>
    {!!semHistorico.length && <div style={styles.card}>
      <strong>Lotes sem registros de dieta no Trato Certo ({semHistorico.length})</strong>
      <p style={{fontSize:13}}>Não foram encontradas entregas ou fases de consumo para estes lotes. Ao sincronizar os registros do trato, a associação será feita automaticamente.</p>
      {semHistorico.map((l)=><div key={l.id} style={{marginTop:8}}>{l.nome}</div>)}
    </div>}
  </div>;
}
