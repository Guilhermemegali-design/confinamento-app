// Usa o resolvedor histórico existente, com as mesmas permissões da conferência.
// Nenhuma meta é reconstruída a partir da soma dos ajustes do último trato.
export async function loadDailyTargets(client, farmId, cargas) {
  const valid=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value));
  const dates=[...new Set(cargas.flatMap(c=>[c.data,...(Array.isArray(c.descargas)?c.descargas.map(d=>d.data||c.data):[])]).filter(valid))].sort();
  const result=[];
  async function read(from,to){
    const {data,error}=await client.rpc('trato_resumo_diario',{p_cliente_id:farmId,p_de:from,p_ate:to});
    if(error){
      // O resolvedor limita a quantidade de linhas; dividir mantém todas as metas.
      if(from<to&&String(error.message||'').includes('Muitos registros')){
        const middle=new Date(Math.floor((Date.parse(from)+Date.parse(to))/2/86400000)*86400000).toISOString().slice(0,10);
        const next=new Date(Date.parse(middle)+86400000).toISOString().slice(0,10);
        await read(from,middle);await read(next,to);return;
      }
      throw error;
    }
    if(!Array.isArray(data))throw new Error('Resposta inválida ao recuperar metas diárias.');
    result.push(...data);
  }
  for(let index=0;index<dates.length;){
    const from=dates[index];let end=index;
    while(end+1<dates.length&&Date.parse(dates[end+1])-Date.parse(from)<=30*86400000)end++;
    await read(from,dates[end]);index=end+1;
  }
  return result;
}
