const VERSAO_STORAGE = "v1";

function storageDisponivel() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function chave(escopo, tipo) {
  return `rastro-cocho-${VERSAO_STORAGE}:${tipo}:${escopo}`;
}

function lerJson(chaveStorage, fallback) {
  if (!storageDisponivel()) return fallback;
  try {
    const valor = window.localStorage.getItem(chaveStorage);
    return valor ? JSON.parse(valor) : fallback;
  } catch {
    return fallback;
  }
}

function gravarJson(chaveStorage, valor, obrigatorio = false) {
  if (!storageDisponivel()) return;
  try {
    window.localStorage.setItem(chaveStorage, JSON.stringify(valor));
  } catch (error) {
    if (obrigatorio) throw new Error("Não foi possível salvar a leitura neste aparelho. Libere espaço e tente novamente.");
    // O cache é uma conveniência para uso sem sinal. Uma cota cheia não pode
    // impedir a leitura online nem apagar lançamentos que já estão na fila.
    console.warn("Não foi possível atualizar o cache offline do cocho:", error);
  }
}

function chaveLeitura(leitura) {
  return `${leitura.lote_id}|${leitura.data}`;
}

function idLocal(payload) {
  return `offline:${payload.lote_id}:${payload.data}`;
}

function ultimosPorLote(linhas, limite) {
  const porLote = new Map();
  for (const linha of linhas || []) {
    const atuais = porLote.get(linha.lote_id) || [];
    atuais.push(linha);
    porLote.set(linha.lote_id, atuais);
  }
  return [...porLote.values()].flatMap((itens) =>
    itens
      .sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")))
      .slice(0, limite)
  );
}

export function criarEscopoCocho(tipo, id) {
  return `${tipo}:${id}`;
}

export function carregarCacheCocho(escopo) {
  return lerJson(chave(escopo, "cache"), null);
}

export function salvarCacheCocho(escopo, dados) {
  const cache = {
    clientes: dados.clientes || [],
    lotes: dados.lotes || [],
    // Para registrar a nota só é necessário o consumo de referência mais
    // recente. Limitar o histórico evita estourar a cota do localStorage.
    consumos: ultimosPorLote(dados.consumos, 1),
    leiturasCocho: ultimosPorLote(dados.leiturasCocho, 30),
    currais: dados.currais || [],
    atualizadoEm: new Date().toISOString(),
  };
  gravarJson(chave(escopo, "cache"), cache);
  return cache;
}

export function atualizarLeiturasNoCache(escopo, leiturasCocho) {
  const atual = carregarCacheCocho(escopo) || {};
  salvarCacheCocho(escopo, { ...atual, leiturasCocho });
}

export function carregarLeiturasPendentes(escopo) {
  return lerJson(chave(escopo, "pendentes"), []);
}

export function salvarLeituraPendente(escopo, payload) {
  const pendentes = carregarLeiturasPendentes(escopo);
  const local = {
    ...payload,
    id: idLocal(payload),
    _offline_pendente: true,
    _offline_criado_em: new Date().toISOString(),
  };
  const alvo = chaveLeitura(local);
  const proximas = [...pendentes.filter((item) => chaveLeitura(item) !== alvo), local];
  gravarJson(chave(escopo, "pendentes"), proximas, true);
  return local;
}

export function removerLeituraPendente(escopo, leitura) {
  const alvo = chaveLeitura(leitura);
  const proximas = carregarLeiturasPendentes(escopo).filter((item) => chaveLeitura(item) !== alvo);
  gravarJson(chave(escopo, "pendentes"), proximas);
}

export function mesclarLeiturasPendentes(leituras, pendentes) {
  const porChave = new Map((leituras || []).map((leitura) => {
    const limpa = { ...leitura };
    delete limpa._offline_pendente;
    delete limpa._offline_criado_em;
    return [chaveLeitura(limpa), limpa];
  }));
  for (const pendente of pendentes || []) porChave.set(chaveLeitura(pendente), pendente);
  return [...porChave.values()];
}

export function substituirLeituraNaLista(leituras, leitura) {
  const alvo = chaveLeitura(leitura);
  const existe = (leituras || []).some((item) => chaveLeitura(item) === alvo);
  return existe
    ? leituras.map((item) => (chaveLeitura(item) === alvo ? leitura : item))
    : [...(leituras || []), leitura];
}

export function erroEhDeRede(error) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const status = Number(error?.status || error?.statusCode || 0);
  if ([408, 502, 503, 504, 520, 522, 524].includes(status)) return true;
  const mensagem = String(error?.message || error || "").toLowerCase();
  return ["failed to fetch", "fetch failed", "networkerror", "network error", "load failed", "timeout", "timed out"]
    .some((trecho) => mensagem.includes(trecho));
}

function payloadParaBanco(leitura) {
  const payload = { ...leitura };
  delete payload.id;
  delete payload._offline_pendente;
  delete payload._offline_criado_em;
  return payload;
}

export async function sincronizarLeiturasPendentes(escopo, supabase) {
  const sincronizadas = [];
  for (const pendente of carregarLeiturasPendentes(escopo)) {
    let resultado;
    try {
      resultado = await supabase
        .from("leituras_cocho")
        .upsert(payloadParaBanco(pendente), { onConflict: "lote_id,data" })
        .select()
        .single();
    } catch (error) {
      if (erroEhDeRede(error)) break;
      console.error("Leitura de cocho pendente não pôde ser sincronizada:", error);
      continue;
    }
    const { data, error } = resultado;
    if (error) {
      if (erroEhDeRede(error)) break;
      console.error("Leitura de cocho pendente não pôde ser sincronizada:", error);
      continue;
    }
    removerLeituraPendente(escopo, pendente);
    sincronizadas.push(data);
  }
  return sincronizadas;
}
