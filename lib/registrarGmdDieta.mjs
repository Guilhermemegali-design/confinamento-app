// A RPC atualiza cadastro e períodos juntos; erros não deixam metade salva.
export async function registrarGmdDieta(cliente, dietaId, dados) {
  const { data, error } = await cliente.rpc('registrar_gmd_dieta', {
    p_dieta_id: dietaId,
    p_gmd_previsto: dados.gmd_previsto ?? null,
    p_dados: dados,
  });
  if (error) throw error;
  if (!data?.dieta || !Array.isArray(data.lotes)) throw new Error('Não foi possível confirmar o recálculo dos lotes. Atualize os dados antes de tentar novamente.');
  return data;
}
