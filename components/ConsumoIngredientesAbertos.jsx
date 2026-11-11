import React from 'react';

const kg = valor => Number(valor).toLocaleString('pt-BR', {maximumFractionDigits: 2});

export default function ConsumoIngredientesAbertos({dados, onExportar}) {
  if (!dados || (!dados.premisturas.length && !dados.avisos.length)) return null;
  return <section aria-label="Consumo com pré-misturas abertas" style={{background:'#fff',border:'1px solid #DCE5DE',borderRadius:16,padding:16,marginBottom:14}}>
    <h3 style={{margin:'0 0 8px',fontSize:17,color:'#1F4D45'}}>Consumo por ingrediente · pré-misturas abertas</h3>
    <p style={{margin:'0 0 12px',fontSize:13,lineHeight:1.6,color:'#5C5C58'}}>Soma o uso direto de cada ingrediente com sua participação nas pré-misturas, sem contar a mistura novamente. Quantidades em matéria natural calculadas pela composição cadastrada atualmente; os componentes não foram pesados separadamente na carga.</p>
    {dados.avisos.map(aviso=><p key={aviso} role="alert" style={{color:'#8A6420'}}>{aviso}</p>)}
    {onExportar && <button type="button" onClick={onExportar} style={{padding:'9px 14px',border:'1px solid #CBD7CF',borderRadius:8,background:'#F4F7F4',color:'#1F4D45',fontWeight:600,cursor:'pointer',marginBottom:12}}>Exportar consumo aberto CSV</button>}
    <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
      <caption style={{textAlign:'left',paddingBottom:8}}>Pré-misturas detalhadas: {dados.premisturas.join(', ') || 'composição a conferir'}</caption>
      <thead><tr style={{textAlign:'right',background:'#F4F2ED'}}><th style={{padding:10,textAlign:'left'}}>Ingrediente</th><th style={{padding:10}}>Previsto MN (kg)</th><th style={{padding:10}}>Consumo MN (kg)</th></tr></thead>
      <tbody>{dados.ingredientes.map(item=><tr key={item.nome} style={{borderTop:'1px solid #E8E5DE',textAlign:'right'}}><td style={{padding:10,textAlign:'left',fontWeight:600}}>{item.nome}</td><td style={{padding:10}}>{item.semMeta ? 'Incompleto' : kg(item.previsto)}</td><td style={{padding:10,fontWeight:600}}>{item.semPeso ? 'Incompleto' : kg(item.real)}</td></tr>)}</tbody>
    </table></div>
  </section>;
}
