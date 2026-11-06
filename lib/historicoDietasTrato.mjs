import { encontrarLoteDaDescarga } from './relatorioTrato.mjs';

const chave = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const alias = (v) => chave(String(v ?? '').replace(/^dieta\s+/i,''));
function encontrarDieta(dietas, receita, dietaId) {
  if (dietaId) {
    const porId=dietas.filter((d)=>d.id===dietaId || d.trato_dieta_id===dietaId);
    if(porId.length===1)return porId[0];
  }
  const nomes=(d)=>[d.nome,d.nome_receita_trato].filter(Boolean);
  const exatas=dietas.filter((d)=>nomes(d).some((n)=>chave(n)===chave(receita)));
  if(exatas.length)return exatas.length===1?exatas[0]:null;
  const equivalentes=dietas.filter((d)=>nomes(d).some((n)=>alias(n)===alias(receita)));
  return equivalentes.length===1?equivalentes[0]:null;
}

// Histórico derivado das entregas efetivas e, antes delas, das fases dos consumos.
// Não retroage a receita atual até a entrada nem altera dados do Trato Certo.
export function construirHistoricoDietasTrato(lotes, dietas, cargas = [], consumos = [], currais = [], ocupacoes = [], opcoes = {}) {
  const lotesPorId=new Map(lotes.map((l)=>[l.id,l]));
  const diasPorLote=new Map();
  const registrar=(lote,data,receita,dieta,prioridade)=>{
    if(!lote || !/^\d{4}-\d{2}-\d{2}$/.test(data||'') || data<lote.data_entrada || (lote.data_saida && data>lote.data_saida))return;
    const dias=diasPorLote.get(lote.id)||new Map();
    const identidade=dieta?.id || `sem-vinculo:${chave(receita)}`;
    const atual=dias.get(data);
    const registro={dieta_id:dieta?.id??null,dieta_nome:dieta?.nome_receita_trato||dieta?.nome||receita||'Dieta não identificada',gmd_previsto:dieta?.gmd_previsto??null,receita_trato:receita,data_inicio:data,origem:'trato_certo',identidade};
    if(!atual || prioridade>atual.prioridade)dias.set(data,{prioridade,receitas:new Map([[identidade,registro]])});
    else if(prioridade===atual.prioridade)atual.receitas.set(identidade,registro);
    diasPorLote.set(lote.id,dias);
  };
  for(const c of consumos) {
    const l=lotesPorId.get(c.lote_id);
    if(!l || !c.dieta_fase)continue;
    const ds=dietas.filter((d)=>d.cliente_id===l.cliente_id);
    let d=encontrarDieta(ds,c.dieta_fase);
    if(!d) {const candidatos=ds.filter((x)=>x.tipo===c.dieta_fase);if(candidatos.length===1)d=candidatos[0];}
    registrar(l,c.data,c.dieta_fase,d,1);
  }
  for(const c of cargas)for(const descarga of Array.isArray(c.descargas)?c.descargas:[]) {
    if(!(Number(descarga.peso)>0))continue;
    const data=descarga.data||c.data;
    // O ID gravado na entrega tem prioridade sobre a ocupação atual do curral.
    const lote=descarga.lote_id ? lotesPorId.get(descarga.lote_id) : encontrarLoteDaDescarga({...descarga,data},lotes.filter((l)=>l.cliente_id===c.cliente_id),currais,ocupacoes);
    if(!lote || lote.cliente_id!==c.cliente_id)continue;
    const ds=dietas.filter((d)=>d.cliente_id===lote.cliente_id);
    const receita=descarga.receita||c.receita;
    registrar(lote,data,receita,encontrarDieta(ds,receita,descarga.dieta_id||c.dieta_id),2);
  }
  return lotes.map((l)=>{
    const dias=diasPorLote.get(l.id);
    if(!dias?.size)return l;
    const datas=[...dias.keys()].sort();
    const historico=(l.historico_dietas||[]).filter((p)=>p.data_inicio<datas[0]).map((p)=>({...p}));
    let anterior=null;
    for(const data of datas) {
      const registros=[...dias.get(data).receitas.values()].sort((a,b)=>a.dieta_nome.localeCompare(b.dieta_nome));
      const gmds=registros.map((r)=>r.gmd_previsto==null || String(r.gmd_previsto).trim()==='' ? null : Number(String(r.gmd_previsto).replace(',','.')));
      const dietasIdentificadas=registros.every((r)=>r.dieta_id);
      const valoresCompletos=dietasIdentificadas && gmds.every((v)=>v!=null && Number.isFinite(v) && v>=0);
      const mediaGmd=valoresCompletos ? gmds.reduce((s,v)=>s+v,0)/gmds.length : null;
      const grupoTransicao={dieta_id:null,dietas_ids:dietasIdentificadas ? registros.map((r)=>r.dieta_id) : [],dieta_nome:registros.map((r)=>r.dieta_nome).join(' / '),gmd_previsto:mediaGmd,data_inicio:data,origem:'trato_certo',transicao_dietas:true,identidade:`dietas:${registros.map((r)=>r.dieta_id||r.identidade).sort().join('|')}`};
      if(!valoresCompletos)grupoTransicao.motivo=dietasIdentificadas
        ? `GMD não informado para uma ou mais dietas da transição em ${data}.`
        : `Dieta não identificada na transição registrada no Trato Certo em ${data}.`;
      const p=registros.length===1 ? registros[0] : grupoTransicao;
      if(p.identidade===anterior)continue;
      const {identidade,...periodo}=p;
      historico.push(periodo);anterior=identidade;
    }
    const primeira=historico[0];
    if(opcoes.usarPrimeiraDietaDesdeEntrada && primeira && primeira.data_inicio>l.data_entrada
      && primeira.data_inicio<=(opcoes.dataAtual || new Date().toISOString().slice(0,10))) {
      historico[0]={...primeira,data_primeiro_registro:primeira.data_inicio,data_inicio:l.data_entrada,inicio_inferido:true};
    }
    return {...l,historico_dietas:historico,historico_dietas_trato:true};
  });
}
