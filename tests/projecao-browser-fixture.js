// Fixture exclusiva para testar a interface local sem criar contas, enviar
// e-mails ou alterar clientes reais. Usar com agent-browser --init-script.
(() => {
  if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) return;
  const usuario = { id: "00000000-0000-4000-8000-000000000001", email: "portal-teste@example.invalid", aud: "authenticated", role: "authenticated" };
  const cliente = { id: "00000000-0000-4000-8000-000000000002", nome: "Fazenda de teste do convite", consultor_id: "00000000-0000-4000-8000-000000000003" };
  const estado = { vinculado: true, erroVinculo: false, chamadas: [] };
  const fetchReal = window.fetch.bind(window);
  window.__portalTeste = estado;
  window.__ativarTesteConvite = () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: usuario.id, exp: expiresAt, role: "authenticated" }))}.fixture-sem-assinatura`;
    localStorage.setItem("sb-vvukwhxlsymjsjajzeyl-auth-token", JSON.stringify({ access_token: token, refresh_token: "fixture-sem-token-real", token_type: "bearer", expires_in: 3600, expires_at: expiresAt, user: usuario }));
  };
  window.__ativarTesteConvite();
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, window.location.origin);
    if (!url.hostname.endsWith(".supabase.co")) return fetchReal(input, init);
    const responder = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
    estado.chamadas.push({ path: url.pathname, search: url.search, method: init.method || "GET", body: init.body });
    if (url.pathname === "/auth/v1/user") return responder(usuario);
    if (url.pathname === "/rest/v1/rpc/resgatar_convite_rebanho") {
      const payload = JSON.parse(init.body);
      if (payload.p_codigo !== "abcd1234") return responder({ code: "P0001", message: "Código inválido. Confira com o responsável pela fazenda." }, 400);
      estado.vinculado = true;
      return responder(cliente.id);
    }
    if (url.pathname === "/rest/v1/clientes_usuarios") {
      if (estado.erroVinculo) return responder({ message: "Falha controlada no teste" }, 500);
      return responder(estado.vinculado ? [{ cliente_id: cliente.id, papel: "editor" }] : []);
    }
    if (url.pathname === "/rest/v1/clientes") return responder(estado.vinculado ? [cliente] : []);
    if (url.pathname.startsWith("/rest/v1/")) return responder([]);
    throw new Error(`Chamada Supabase não prevista pela fixture: ${url.pathname}`);
  };
})();

(() => {
  if (!["localhost", "127.0.0.1"].includes(location.hostname)) return;
  const iso = (dias) => { const d = new Date(); d.setUTCDate(d.getUTCDate()-dias); d.setUTCHours(12,0,0,0); return d.toISOString().slice(0,10); };
  const dietaA = { cliente_id:"00000000-0000-4000-8000-000000000002", id:"00000000-0000-4000-8000-000000000010", nome:"Adaptação teste", nome_receita_trato:"Adaptação teste", gmd_previsto:1.2, tipo:"adaptacao", ingredientes:[{nome:"Milho",participacao_ms:100}] };
  const dietaB = { ...dietaA, id:"00000000-0000-4000-8000-000000000011", nome:"Terminação teste", nome_receita_trato:"Terminação teste", gmd_previsto:1.6, tipo:"terminacao" };
  const lote = { id:"00000000-0000-4000-8000-000000000020", cliente_id:"00000000-0000-4000-8000-000000000002", nome:"Validação GMD 394", num_cabecas:10, data_entrada:iso(30), peso_entrada:350, historico_dietas:[
    {dieta_id:dietaA.id,dieta_nome:dietaA.nome,data_inicio:iso(30),gmd_previsto:1.2},
    {dieta_id:dietaB.id,dieta_nome:dietaB.nome,data_inicio:iso(20),gmd_previsto:1.6}
  ] };
  if (new URLSearchParams(location.search).has("semHistorico")) lote.historico_dietas=[];
  const usarTrato = new URLSearchParams(location.search).has("usarTrato");
  if (usarTrato) lote.historico_dietas=[];
  const cargasTrato = [
    {id:"carga-a",cliente_id:lote.cliente_id,data:iso(30),receita:"Adaptação teste",itens:[],descargas:[{lote_id:lote.id,peso:100}]},
    {id:"carga-b",cliente_id:lote.cliente_id,data:iso(20),receita:"Terminação teste",itens:[],descargas:[{lote_id:lote.id,peso:100}]}
  ];
  const anterior = window.fetch;
  window.__projecaoTeste = {lote,dietas:[dietaA,dietaB]};
  window.fetch = async (input, init={}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.origin);
    const responder = (body) => Promise.resolve(new Response(JSON.stringify(body), {status:200,headers:{"Content-Type":"application/json"}}));
    if (url.hostname.endsWith(".supabase.co")) {
      if(url.pathname==="/rest/v1/rpc/sincronizar_dietas_gmd_trato") return responder(0);
      if(usarTrato && url.pathname==="/rest/v1/cargas_vagao") return responder(cargasTrato);
      if(url.pathname==="/rest/v1/rpc/registrar_gmd_dieta") {
        const args=JSON.parse(init.body);
        const dieta=window.__projecaoTeste.dietas.find((d)=>d.id===args.p_dieta_id);
        dieta.gmd_previsto=args.p_gmd_previsto;
        lote.historico_dietas=lote.historico_dietas.map((p)=>p.dieta_id===dieta.id ? {...p,gmd_previsto:args.p_gmd_previsto} : p);
        return responder({dieta,lotes:[lote]});
      }
      if(url.pathname==="/rest/v1/lotes_confinamento") {
        if(init.method==="PATCH") { Object.assign(lote,JSON.parse(init.body)); return responder(lote); }
        return responder([lote]);
      }
      if(url.pathname==="/rest/v1/dietas") return responder([dietaA,dietaB]);
    }
    return anterior(input,init);
  };
})();
