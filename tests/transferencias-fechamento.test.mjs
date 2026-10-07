import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const fonte = await readFile(new URL('../lib/confinamento.js', import.meta.url), 'utf8');
const { calcularIndicadoresLote, calcularFechamentoCusto, calcularPainelConfinamento,
  obterHistoricoTransferencias, proporcaoConsumoEtapa, calcularCustoAcumulado, calcularEvolucaoLote } =
  await import(`data:text/javascript;base64,${Buffer.from(fonte).toString('base64')}`);
const perto = (a,b) => assert.ok(Math.abs(a-b) < 1e-7, `${a} != ${b}`);
const origem = { id:'origem', cliente_id:'alterosa', nome:'Curral 8', num_cabecas:100,
  data_entrada:'2026-07-15', data_saida:'2026-08-27', peso_entrada:408.89,
  peso_saida_vivo:474.7, rendimento_entrada:50, preco_arroba_entrada:300,
  rendimento_carcaca:50, preco_venda_arroba:330, custo_operacional:1.8 };
const destino = { ...origem, id:'destino', nome:'Lote 16', num_cabecas:265,
  data_entrada:'2026-07-14', data_saida:'2026-09-16', preco_venda_arroba:335 };
const troca = { id:'troca', tipo:'transferencia', lote_id:'origem', lote_destino_id:'destino',
  num_cabecas:99, data:'2026-08-25', peso_saida_vivo:474.7 };
const trauma = { id:'trauma', tipo:'doenca_trauma', num_cabecas:1, data:'2026-08-27' };
const entrada = { id:'entrada', lote_id:'destino', lote_origem_id:'origem', saida_origem_id:'troca',
  num_cabecas:99, data:'2026-08-25', peso_entrada:474.7, custo_acumulado_herdado:594.33 };
const vendas = [
  { id:'v1', tipo:'venda', data:'2026-08-13', num_cabecas:55, peso_saida_vivo:503.27 },
  { id:'v2', tipo:'venda', data:'2026-08-21', num_cabecas:55, peso_saida_vivo:509.63 },
  { id:'v3', tipo:'venda', data:'2026-08-27', num_cabecas:60, peso_saida_vivo:521 },
  { id:'v4', tipo:'venda', data:'2026-09-16', num_cabecas:95, peso_saida_vivo:471.47 },
];
const consumoOrigem = { id:'c1', data:'2026-08-23', consumo_total_lote:2580, ms_dieta:50.6, custo_kg_mn:.46 };
const consumoDestino = { id:'c2', data:'2026-08-26', consumo_total_lote:1550, ms_dieta:50, custo_kg_mn:.5 };
const contexto = { lotes:[origem,destino], saidasPorLote:{ origem:[troca,trauma], destino:vendas },
  entradasPorLote:{ destino:[entrada] }, consumosPorLote:{ origem:[consumoOrigem],destino:[consumoDestino] }, pesagensPorLote:{} };
const indicadorDestino = () => calcularIndicadoresLote(destino,[],[consumoDestino],vendas,[entrada],contexto);

test('Curral 8 encerra por transferência e não inventa receita ou lucro com preço residual',()=>{
  const i = calcularIndicadoresLote(origem,[],[consumoOrigem],[troca,trauma],[],contexto);
  assert.equal(i.status,'Transferido');
  assert.equal(i.cabecasRestantes,0);
  const f = calcularFechamentoCusto(origem,i,[troca,trauma]);
  assert.equal(f.receitaTotal,null);
  assert.equal(f.resultadoTotal,null);
  assert.equal(f.arrobasVendidasTotal,0);
  const painel = calcularPainelConfinamento(contexto.lotes,{},contexto.consumosPorLote,contexto.saidasPorLote,contexto.entradasPorLote);
  assert.equal(painel.lotesFinalizados,1);
});

test('custo das 99 cabeças persiste após venda total e entra exatamente uma vez no fechamento',()=>{
  const i = indicadorDestino();
  assert.equal(i.cabecasRestantes,0);
  perto(i.custoHerdadoTotal,99*594.33);
  const f = calcularFechamentoCusto(destino,i,vendas);
  perto(f.custoHerdadoTotal,58838.67);
  perto(f.custoProducaoTotal, f.custoAlimentarTotal + f.custoOperacionalTotal + 58838.67);
  perto(i.custoAcumuladoAnimal*265, f.custoAlimentarTotal+58838.67);
  perto(f.custoTotalGeral, f.valorCompraTotal+f.custoProducaoTotal);
  perto(f.resultadoTotal, f.receitaTotal-f.custoTotalGeral);
});

test('99/100 dos consumos anteriores acompanham a transferência; o dia da transferência e seguintes ficam fora',()=>{
  const i = indicadorDestino();
  perto(i.consumoAnteriorMN,2580*.99);
  perto(i.consumoAnteriorMS,2580*.506*.99);
  perto(i.consumoMSMedio,(2580*.506*.99+1550*.5)/(99+155));
  const etapa = i.historicoTransferencias.etapas[0];
  perto(proporcaoConsumoEtapa(etapa,'2026-08-23'),.99);
  assert.equal(proporcaoConsumoEtapa(etapa,'2026-08-25'),0);
  assert.equal(proporcaoConsumoEtapa(etapa,'2026-08-26'),0);
  assert.equal(proporcaoConsumoEtapa(etapa,'2026-07-14'),0);
  assert.equal(contexto.consumosPorLote.origem.length,1);
});

test('operacional do destino começa na chegada de cada coorte, sem repetir os dias da origem',()=>{
  const i = indicadorDestino();
  const f = calcularFechamentoCusto(destino,i,vendas);
  // Integral da população por intervalo, em animal-dias: 166,111,56,155,95 cabeças.
  const diasProprios = 166*30+111*8+56*4+155*2+95*20;
  perto(f.custoOperacionalTotal,diasProprios*1.8);
  perto(i.animalDiasAnteriores,99*41);
});

test('venda parcial de origem segue sendo venda; transferência e doença não ganham preço por fallback',()=>{
  const venda = { id:'real',tipo:'venda',num_cabecas:10,data:'2026-08-01',peso_saida_vivo:450 };
  const i = calcularIndicadoresLote(origem,[],[consumoOrigem],[venda,{...troca,num_cabecas:89},trauma]);
  assert.equal(i.status,'Finalizado');
  const f = calcularFechamentoCusto(origem,i,[venda,{...troca,num_cabecas:89},trauma]);
  perto(f.receitaTotal,10*450*.5/15*330);
});

test('duas transferências do mesmo rebanho rateiam o consumo sem duplicar animais vendidos antes',()=>{
  const l = {...origem,num_cabecas:20};
  const d = {...destino,num_cabecas:20};
  const s1 = {...troca,id:'t1',num_cabecas:10,data:'2026-08-10'};
  const s2 = {...troca,id:'t2',num_cabecas:10,data:'2026-08-20'};
  const e1 = {...entrada,id:'e1',num_cabecas:10,data:s1.data,saida_origem_id:'t1'};
  const e2 = {...entrada,id:'e2',num_cabecas:10,data:s2.data,saida_origem_id:'t2'};
  const ctx = {...contexto,lotes:[l,d],saidasPorLote:{origem:[s1,s2]},entradasPorLote:{destino:[e1,e2]}};
  const etapas = obterHistoricoTransferencias(d,ctx).etapas;
  perto(etapas.reduce((s,e)=>s+proporcaoConsumoEtapa(e,'2026-08-01'),0),1);
  perto(etapas.reduce((s,e)=>s+proporcaoConsumoEtapa(e,'2026-08-15'),0),1);
});

test('origem de outra fazenda ou vínculo inconsistente não importa consumo',()=>{
  const ctx = {...contexto,lotes:[{...origem,cliente_id:'outra'},destino]};
  const h = obterHistoricoTransferencias(destino,ctx);
  assert.equal(h.etapas.length,0);
  assert.equal(h.pendencias.length,1);
  const ctx2 = {...contexto,entradasPorLote:{destino:[{...entrada,saida_origem_id:'inexistente'}]}};
  assert.equal(obterHistoricoTransferencias(destino,ctx2).etapas.length,0);
});

test('custo herdado sem consumos permanece disponível; zero explícito não se converte em custo presumido',()=>{
  const i = calcularCustoAcumulado(destino,[],vendas,[entrada]);
  perto(i.custoAcumuladoAnimal,58838.67/265);
  assert.equal(i.custoAlimentarProprioTotal,null);
  const zero = calcularCustoAcumulado(destino,[],vendas,[{...entrada,custo_acumulado_herdado:0}]);
  assert.equal(zero.custoHerdadoTotal,0);
});

test('histórico usa data e peso da transferência sem criar pesagem de venda no encerramento por trauma', () => {
  const pontos = calcularEvolucaoLote(origem, [], [troca, trauma]);
  assert.equal(pontos.at(-1).data, troca.data);
  assert.equal(pontos.at(-1).tipo, 'transferencia');
  assert.equal(pontos.at(-1).peso, 474.7);
  assert.equal(pontos.some(p => p.tipo === 'saida'), false);
});
