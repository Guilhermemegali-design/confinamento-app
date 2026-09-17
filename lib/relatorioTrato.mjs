// Cálculos independentes do PDF. Cada pesagem entra antes da soma, para
// faltas e excessos em cargas/dias diferentes nunca se anularem.
export function pesoValido(valor) {
  if (valor == null || typeof valor === "boolean" || String(valor).trim() === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

export function encontrarLoteDescarga(valor, lotes) {
  const alvo = String(valor ?? "").trim().toLowerCase();
  if (!alvo) return null;
  const exatos = lotes.filter((l) => String(l.nome ?? "").trim().toLowerCase() === alvo);
  if (exatos.length) return exatos.length === 1 ? exatos[0] : null;
  if (!/^\d+$/.test(alvo)) return null;
  const candidatos = lotes.filter((l) => {
    const numero = String(l.nome ?? "").match(/\d+/)?.[0];
    return numero != null && Number(numero) === Number(alvo);
  });
  return candidatos.length === 1 ? candidatos[0] : null;
}

function normalizarTexto(valor) {
  return String(valor ?? "").trim().toLowerCase();
}

export function encontrarCurralDescarga(descarga, currais = []) {
  if (descarga?.curral_id) {
    const porId = currais.find((curral) => curral.id === descarga.curral_id);
    if (porId) return porId;
  }

  // O Trato Certo grava o destino como "Curral 5 — Lote 10". A parte
  // anterior ao travessão identifica o curral físico e continua válida
  // mesmo depois que outro lote ocupar esse curral.
  const texto = String(descarga?.lote_codigo || "").trim();
  const nomeCurral = texto.match(/^((?:curral|cocheira)\s+[^—–-]+)/i)?.[1]?.trim();
  if (!nomeCurral) return null;
  const alvo = normalizarTexto(nomeCurral);
  return currais.find((curral) => normalizarTexto(curral.nome) === alvo) || null;
}

export function encontrarLoteDaDescarga(descarga, lotes, currais = [], curralOcupacoes = []) {
  const data = descarga?.data;
  const curral = encontrarCurralDescarga(descarga, currais);
  const loteDireto = descarga?.lote_id
    ? lotes.find((lote) => lote.id === descarga.lote_id) || null
    : null;

  if (curral && data) {
    const ocupacoes = curralOcupacoes
      .filter((ocupacao) => ocupacao.curral_id === curral.id
        && ocupacao.data_inicio <= data
        && (ocupacao.data_fim == null || ocupacao.data_fim >= data))
      .map((ocupacao) => ({ ocupacao, lote: lotes.find((lote) => lote.id === ocupacao.lote_id) }))
      .filter(({ lote }) => lote
        && lote.data_entrada <= data
        && (lote.data_saida == null || lote.data_saida >= data))
      .sort((a, b) => b.ocupacao.data_inicio.localeCompare(a.ocupacao.data_inicio)
        || Number(b.ocupacao.data_fim == null) - Number(a.ocupacao.data_fim == null)
        || String(b.ocupacao.criado_em || "").localeCompare(String(a.ocupacao.criado_em || "")));
    if (ocupacoes.length) return ocupacoes[0].lote;

    // Alguns currais antigos ainda não têm todo o histórico preenchido.
    // Nesses casos, aceita o lote que veio junto da descarga somente se o
    // vínculo físico dele com o curral confere.
    if (loteDireto?.curral_id === curral.id) return loteDireto;
    const lotesCompativeis = lotes.filter((lote) => lote.curral_id === curral.id
      && lote.data_entrada <= data
      && (lote.data_saida == null || lote.data_saida >= data));
    if (lotesCompativeis.length === 1) return lotesCompativeis[0];
  }

  // Descargas novas também trazem o ID imutável do lote. Ele preserva a
  // vinculação histórica quando o curral não pôde ser identificado.
  if (loteDireto) return loteDireto;
  return encontrarLoteDescarga(descarga?.lote_codigo, lotes);
}

function comparar(registro) {
  const { previsto, real } = registro;
  const diferenca = previsto != null && real != null ? real - previsto : null;
  const percentual = diferenca != null && previsto > 0 ? diferenca / previsto * 100 : null;
  const situacao = real == null ? "Sem peso válido" : previsto == null ? "Sem meta" :
    previsto === 0 && real > 0 ? "Não previsto" :
    Math.abs(percentual || 0) <= 2 ? "Até 2%" : Math.abs(percentual) <= 5 ? "Atenção" : "Revisar";
  return { ...registro, diferenca, percentual, situacao };
}

export function resumirRegistros(registros) {
  const resumo = { total: registros.length, avaliados: 0, semReferencia: 0, previsto: 0, real: 0,
    falta: 0, excesso: 0, ate2: 0, atencao: 0, revisar: 0, semMeta: 0, semPeso: 0 };
  for (const r of registros) {
    if (r.previsto == null) resumo.semMeta++;
    if (r.real == null) resumo.semPeso++;
    if (r.diferenca == null) { resumo.semReferencia++; continue; }
    resumo.avaliados++;
    resumo.previsto += r.previsto;
    resumo.real += r.real;
    resumo.falta += Math.max(0, -r.diferenca);
    resumo.excesso += Math.max(0, r.diferenca);
    if (r.situacao === "Até 2%") resumo.ate2++;
    else if (r.situacao === "Atenção") resumo.atencao++;
    else resumo.revisar++;
  }
  resumo.erroKg = resumo.falta + resumo.excesso;
  resumo.erroPercentual = resumo.previsto > 0 ? resumo.erroKg / resumo.previsto * 100 : null;
  // O resultado acumulado tem uma única direção. A classificação continua
  // considerando cada pesagem, sem esconder erros que se compensaram.
  resumo.saldo = resumo.avaliados > 0 && resumo.semReferencia === 0
    ? Number((resumo.real - resumo.previsto).toFixed(6)) : null;
  return resumo;
}

export function resultadoAcumulado(resumo) {
  const diferenca = resumo.saldo;
  const estado = diferenca == null ? "incompleto" : diferenca < 0 ? "faltou" : diferenca > 0 ? "passou" : "previsto";
  return { estado, diferenca, quantidade: diferenca == null ? null : Math.abs(diferenca),
    rotulo: { faltou: "FALTOU", passou: "PASSOU", previsto: "NO PREVISTO", incompleto: "SEM AVALIAÇÃO" }[estado] };
}

function somarPesosRegistrados(registros) {
  return {
    totalPrevisto: registros.some((r) => r.previsto != null) ? registros.reduce((s, r) => s + (r.previsto ?? 0), 0) : null,
    totalCarregado: registros.some((r) => r.real != null) ? registros.reduce((s, r) => s + (r.real ?? 0), 0) : null,
  };
}

function agruparDesvios(registros) {
  const grupos = new Map();
  for (const r of registros) {
    const chave = String(r.chave || r.nome).normalize("NFC").trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
    const grupo = grupos.get(chave) || { nome: r.nome, registros: [] };
    grupo.registros.push(r);
    grupos.set(chave, grupo);
  }
  return [...grupos.values()].map((g) => ({ nome: g.nome, ...resumirRegistros(g.registros), ...somarPesosRegistrados(g.registros) }))
    .sort((a, b) => b.erroKg - a.erroKg || a.nome.localeCompare(b.nome));
}

// O PIN do tratador tem identidade própria, mesmo em tablets conectados
// à conta do gestor. Nunca usamos consultor_id ou a sessão atual como autor.
export function equipeDoRegistro(registro = {}) {
  const login = typeof registro.tratador_login_id === "string" ? registro.tratador_login_id.trim() : "";
  const informado = String(registro.tratador || registro.operador || registro.operator || "").normalize("NFC").trim().replace(/\s+/g, " ");
  const nome = /^(tratador não informado|sincronizado do|histórico do confinamento|confinamento \/ rastro)/i.test(informado) ? "" : informado;
  return {
    equipeChave: login ? `login:${login}` : nome ? `legado:${nome.toLocaleLowerCase("pt-BR")}` : "sem-login",
    equipe: nome || (login ? "Login sem nome registrado" : "Sem login identificado"),
    equipeIdentificada: Boolean(login),
  };
}

export function resumirCarregamentosPorEquipe(registros) {
  const grupos = new Map();
  for (const r of registros) {
    const chave = r.equipeChave || "sem-login";
    const grupo = grupos.get(chave) || { chave, nome: r.equipe || "Sem login identificado", identificada: Boolean(r.equipeIdentificada), registros: [] };
    // As operações estão em ordem de data; conserva o nome mais recente
    // do mesmo login, sem dividir a equipe após uma alteração de nome.
    if (r.equipe && r.equipe !== "Login sem nome registrado") grupo.nome = r.equipe;
    grupo.registros.push(r);
    grupos.set(chave, grupo);
  }
  const equipes = [...grupos.values()].map((grupo) => {
    const resumo = resumirRegistros(grupo.registros);
    return { chave: grupo.chave, nome: grupo.nome, identificada: grupo.identificada, ...resumo,
      totalCargas: new Set(grupo.registros.map((r) => r.cargaChave)).size,
      totalDias: new Set(grupo.registros.map((r) => r.data)).size,
      ...somarPesosRegistrados(grupo.registros),
      classificavel: grupo.identificada && resumo.semReferencia === 0 && resumo.erroPercentual != null,
      ingredientes: agruparDesvios(grupo.registros),
    };
  });
  const nomes = new Map();
  for (const e of equipes) {
    const nome = e.nome.toLocaleLowerCase("pt-BR");
    nomes.set(nome, (nomes.get(nome) || 0) + 1);
  }
  for (const e of equipes) {
    // Logins distintos podem ter o mesmo nome; o PDF precisa distingui-los.
    if (nomes.get(e.nome.toLocaleLowerCase("pt-BR")) > 1) e.nome += e.identificada ? ` (login ${e.chave.slice(-8)})` : " (sem login)";
  }
  equipes.sort((a, b) => Number(b.classificavel) - Number(a.classificavel) ||
    (a.classificavel && b.classificavel ? a.erroPercentual - b.erroPercentual : 0) ||
    Number(b.identificada) - Number(a.identificada) || a.nome.localeCompare(b.nome));
  let ultimaTaxa = null;
  let posicao = 0;
  equipes.forEach((e, indice) => {
    if (!e.classificavel) { e.posicao = null; return; }
    // Compara com precisão maior que a exibida e preserva empates reais.
    const taxa = Math.round(e.erroPercentual * 1e8) / 1e8;
    if (taxa !== ultimaTaxa) posicao = indice + 1;
    e.posicao = posicao;
    ultimaTaxa = taxa;
  });
  return equipes;
}

export function datasDisponiveisTrato(cargas) {
  return [...new Set(cargas.flatMap((c) => [c.data, ...(Array.isArray(c.descargas) ? c.descargas : []).map((d) => d.data)]))]
    .filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
}

export function agruparGraficosPorCarga(carregamentos, descargas) {
  const cargas = new Map();
  const totaisDiarios = new Map();
  for (const [etapa, registros] of [["carregamentos", carregamentos], ["descargas", descargas]]) {
    for (const registro of registros) {
      // A leitura de cocho se refere ao lote/dia. Não pode ser atribuída
      // a uma viagem, nem repetida nos gráficos de cada carga.
      if (registro.escopo === "dia") {
        const dia = totaisDiarios.get(registro.data) || { data: registro.data, registros: [] };
        dia.registros.push(registro);
        totaisDiarios.set(registro.data, dia);
        continue;
      }
      const chave = `${registro.data}|${registro.cargaChave}`;
      const grupo = cargas.get(chave) || { data: registro.data, carga: registro.carga,
        hora: registro.horaCarga, receita: registro.receita, carregamentos: [], descargas: [] };
      grupo[etapa].push(registro);
      cargas.set(chave, grupo);
    }
  }
  return {
    cargas: [...cargas.values()].sort((a, b) => a.data.localeCompare(b.data) ||
      String(a.hora || "").localeCompare(String(b.hora || "")) || a.carga.localeCompare(b.carga, "pt-BR", { numeric: true })),
    totaisDiarios: [...totaisDiarios.values()].sort((a, b) => a.data.localeCompare(b.data)),
  };
}

export function montarRelatorioTrato({ cargas = [], lotes = [], leiturasCocho = [], currais = [], curralOcupacoes = [], inicio, fim, modo = inicio === fim ? "dia" : "periodo" }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio || "") || !/^\d{4}-\d{2}-\d{2}$/.test(fim || "") || inicio > fim) {
    throw new Error("Escolha um dia ou um período válido. A data inicial deve ser anterior ou igual à final.");
  }
  const noPeriodo = (data) => typeof data === "string" && data >= inicio && data <= fim;
  const carregamentos = [];
  const gruposDescarga = new Map();
  const cargasPeriodo = cargas.filter((c) => noPeriodo(c.data));
  const leituras = new Map();
  // Metas duplicadas/ambíguas não devem ser escolhidas arbitrariamente.
  for (const l of leiturasCocho) {
    const chave = `${l.lote_id}|${l.data}`;
    leituras.set(chave, leituras.has(chave) ? null : pesoValido(l.quantidade_esperada));
  }
  let quantidadeDescargas = 0;
  for (const [indiceCarga, carga] of cargas.entries()) {
    const codigo = String(carga.carga_codigo ?? "Sem código");
    const identidade = { cargaChave: String(carga.id ?? indiceCarga), horaCarga: carga.hora, receita: carga.receita, escopo: "carga" };
    if (noPeriodo(carga.data)) {
      const itens = Array.isArray(carga.itens) ? carga.itens : [];
      for (const item of itens) {
        carregamentos.push(comparar({ ...identidade, ...equipeDoRegistro(item), data: carga.data, carga: codigo, hora: carga.hora,
          nome: item.ingrediente || "Ingrediente não identificado",
          chave: item.ingrediente_chave || String(item.ingrediente || "").trim().toLowerCase(),
          previsto: pesoValido(item.peso_previsto), real: pesoValido(item.peso_real),
          referencia: "Previsto registrado na carga" }));
      }
      if (!itens.length) carregamentos.push(comparar({ ...identidade, ...equipeDoRegistro(), data: carga.data, carga: codigo, hora: carga.hora,
        nome: "Carga sem detalhamento", chave: "sem-itens", previsto: null, real: pesoValido(carga.peso_real),
        referencia: "Sem pesagens dos ingredientes" }));
    }
    // A descarga usa sua própria data, mesmo quando a carga é do dia anterior.
    for (const descarga of Array.isArray(carga.descargas) ? carga.descargas : []) {
      if (!noPeriodo(descarga.data)) continue;
      quantidadeDescargas++;
      const lote = encontrarLoteDaDescarga(descarga, lotes, currais, curralOcupacoes);
      const chaveLote = lote?.id || `codigo:${String(descarga.lote_codigo ?? "").trim().toLowerCase()}`;
      const chave = `${chaveLote}|${descarga.data}`;
      const grupo = gruposDescarga.get(chave) || { lote, chave: chaveLote, data: descarga.data,
        nome: lote?.nome || `Lote ${descarga.lote_codigo || "não identificado"}`, registros: [] };
      grupo.registros.push({ ...identidade, ...equipeDoRegistro(descarga), data: descarga.data, carga: codigo, hora: descarga.hora,
        nome: grupo.nome, chave: chaveLote, previsto: pesoValido(descarga.peso_previsto), real: pesoValido(descarga.peso) });
      gruposDescarga.set(chave, grupo);
    }
  }
  const descargas = [];
  for (const grupo of gruposDescarga.values()) {
    const metaDiaria = grupo.lote ? leituras.get(`${grupo.lote.id}|${grupo.data}`) : null;
    if (grupo.registros.every((r) => r.previsto != null)) {
      descargas.push(...grupo.registros.map((r) => comparar({ ...r, referencia: "Meta original da descarga" })));
    } else if (metaDiaria != null) {
      // Uma meta de dia inteiro só é comparada à soma de TODAS as descargas
      // daquele lote/dia. Nunca repetimos a meta para cada viagem.
      descargas.push(comparar({ escopo: "dia", data: grupo.data, nome: grupo.nome, chave: grupo.chave,
        carga: [...new Set(grupo.registros.map((r) => r.carga))].join(", "),
        previsto: metaDiaria, real: grupo.registros.every((r) => r.real != null)
          ? grupo.registros.reduce((s, r) => s + r.real, 0) : null,
        referencia: `Total do dia / leitura de cocho (${grupo.registros.length} descargas)` }));
    } else {
      descargas.push(...grupo.registros.map((r) => comparar({ ...r,
        referencia: r.previsto != null ? "Meta original da descarga" : grupo.lote ? "Sem meta original ou leitura de cocho" : "Lote não localizado; sem meta original" })));
    }
  }
  const ordenar = (a, b) => a.data.localeCompare(b.data) || String(a.hora || "").localeCompare(String(b.hora || "")) || a.carga.localeCompare(b.carga);
  carregamentos.sort(ordenar);
  descargas.sort(ordenar);
  const dias = [...new Set([...carregamentos, ...descargas].map((r) => r.data))].sort();
  return { inicio, fim, modo, quantidadeCargas: cargasPeriodo.length, quantidadeDescargas,
    cargasSemDescarga: cargasPeriodo.filter((c) => !Array.isArray(c.descargas) || !c.descargas.length).length,
    carregamentos, descargas, cargas: resumirRegistros(carregamentos), descarga: resumirRegistros(descargas),
    ingredientes: agruparDesvios(carregamentos), lotes: agruparDesvios(descargas),
    graficos: agruparGraficosPorCarga(carregamentos, descargas),
    equipes: resumirCarregamentosPorEquipe(carregamentos),
    dias: dias.map((data) => ({ data, cargas: resumirRegistros(carregamentos.filter((r) => r.data === data)),
      descarga: resumirRegistros(descargas.filter((r) => r.data === data)) })) };
}
