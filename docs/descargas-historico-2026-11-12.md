# Descargas históricas — 12/11/2026

Base: produção Confinamento 76050e5, deployment dpl_23Z1gb7zCzf3VVGxVhoniSEXYcz7. origin/main contém uma árvore diferente e não é a base desta publicação; não substituir a produção por ela.

Diagnóstico só de leitura Junco: 5390 descargas até11/11, sendo2269 importadas de maio a03/09 sem peso_previsto e sem lote_id. Dois cadastros Lote3, períodos21/05–27/09 e03/10 em diante, impediam resolução apenas pelo nome. Leituras começam05/08. Ausências anteriores não podem ser preenchidas com a meta atual ou com o peso realizado. RPC autenticado existente trato_resumo_diario confirmou154 lote/dias com meta_programada_kg entre01e11/11.

Correção geral, sem IDs de fazendas no código:
- Resolve códigos legados por nome/número e vigência na data; recusa ambiguidade e mantém prioridade dos caminhos de ID e ocupação existentes.
- Destinos numéricos sem cadastro normalizam somente zeros iniciais (03=3); alfanuméricos permanecem distintos. Ausência de vínculo fica explícita.
- Consulta RPC existente em blocos de até31datas, recupera meta original antes da leitura ajustada e das somas compensadas. Estado cancelado/chaveado por fazenda e lista; não reutiliza resposta atrasada de outro cliente.
- Realizado por tratador inclui também descargas sem previsão e meta zero. Comparação incompleta não recebe percentual; não rateia meta diária entre autores.
- Mostra quilos/dias sem referência histórica, mantém pesos recebidos integralmente. PDF aguarda consulta, recebe os mesmos valores e avisos.

Sem mudança de DB,auth,RLS,API,contratosAPKs,drivers,conexões,filas ou consumos. Não altera registros nem exige atualização/desinstalação. Não valida hardware, instalação de APK antigo ou permissões de todas as contas reais. Consulta sem permissão mostra aviso e conserva relatório disponível.

Limite: nenhum algoritmo recupera uma previsão que nunca foi importada. Para completar os registros antigos sem referência seria necessária a fonte original da previsão, sem alterar os pesos realizados. A correção não inventa valores para zerar o alerta.
