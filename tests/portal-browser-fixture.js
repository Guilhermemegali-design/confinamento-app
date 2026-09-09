// Fixture exclusiva para testar a interface local sem criar contas, enviar
// e-mails ou alterar clientes reais. Usar com agent-browser --init-script.
(() => {
  if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) return;
  const usuario = { id: "00000000-0000-4000-8000-000000000001", email: "portal-teste@example.invalid", aud: "authenticated", role: "authenticated" };
  const cliente = { id: "00000000-0000-4000-8000-000000000002", nome: "Fazenda de teste do convite", consultor_id: "00000000-0000-4000-8000-000000000003" };
  const estado = { vinculado: false, erroVinculo: false, chamadas: [] };
  const fetchReal = window.fetch.bind(window);
  window.__portalTeste = estado;
  window.__ativarTesteConvite = () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: usuario.id, exp: expiresAt, role: "authenticated" }))}.fixture-sem-assinatura`;
    localStorage.setItem("sb-vvukwhxlsymjsjajzeyl-auth-token", JSON.stringify({ access_token: token, refresh_token: "fixture-sem-token-real", token_type: "bearer", expires_in: 3600, expires_at: expiresAt, user: usuario }));
  };
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
