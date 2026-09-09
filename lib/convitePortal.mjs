export function normalizarCodigoConvite(codigo) {
  return String(codigo || "").trim().toLowerCase();
}

export async function resgatarConvitePortal(supabase, codigo) {
  const codigoNormalizado = normalizarCodigoConvite(codigo);
  if (!codigoNormalizado) throw new Error("Digite o código do cliente enviado pelo consultor.");

  const { data: sessao, error: erroSessao } = await supabase.auth.getSession();
  if (erroSessao) throw erroSessao;
  if (!sessao?.session?.user?.id) {
    throw new Error("Sua sessão expirou. Saia e entre novamente com seu e-mail e senha.");
  }

  // O novo usuário ainda não pode consultar clientes por causa da RLS.
  // A RPC existente valida o código e cria o vínculo atomicamente usando
  // auth.uid(), sem aceitar IDs, e-mail ou papel fornecidos pelo navegador.
  // Repetir um código já resgatado não duplica nem eleva o acesso existente.
  const { data: clienteId, error } = await supabase.rpc("resgatar_convite_rebanho", {
    p_codigo: codigoNormalizado,
  });
  if (error) throw error;
  if (!clienteId) throw new Error("Não foi possível confirmar o vínculo. Tente novamente.");
  return clienteId;
}

export async function buscarVinculoPortal(supabase, userId, clienteId) {
  let consulta = supabase.from("clientes_usuarios")
    .select("cliente_id, papel")
    .eq("auth_user_id", userId);
  if (clienteId) consulta = consulta.eq("cliente_id", clienteId);
  // Uma conta pode estar vinculada a mais de um cliente nos apps Rastro.
  // maybeSingle sem limite falhava nesse caso e voltava à tela de convite.
  const { data, error } = await consulta.order("criado_em", { ascending: true })
    .order("id", { ascending: true }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export function mensagemErroConvite(error) {
  const mensagem = String(error?.message || "");
  if (/código inválido/i.test(mensagem)) {
    return "Código do cliente inválido. Use o código enviado pelo consultor, não o código de confirmação do e-mail.";
  }
  if (/outro e-mail/i.test(mensagem)) return "Este convite foi criado para outro e-mail. Entre com a conta que recebeu o convite.";
  if (/não autenticado|jwt|session|sessão/i.test(mensagem) || error?.status === 401) {
    return "Sua sessão expirou. Saia e entre novamente com seu e-mail e senha.";
  }
  if (/fetch|network|load failed|timeout|timed out/i.test(mensagem)) {
    return "Não foi possível conectar. Confira sua internet e tente confirmar o código novamente.";
  }
  if (mensagem.startsWith("Digite o código") || mensagem.startsWith("Não foi possível confirmar")) return mensagem;
  return "Não foi possível liberar o acesso agora. Tente novamente. Se persistir, informe ao consultor.";
}
