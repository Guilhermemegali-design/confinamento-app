export const lotes = [1, 2, 3, 4].map((n) => ({ id: `l${n}`, nome: `Lote ${n}` }));
export const cargas = [
  { carga_codigo: '101', data: '2026-09-15', hora: '07:00', receita: 'Terminação', peso_real: 995,
    itens: [{ ingrediente: 'Silagem de milho', peso_previsto: 600, peso_real: 570 }, { ingrediente: 'Milho moído', peso_previsto: 300, peso_real: 320 }, { ingrediente: 'Núcleo mineral', peso_previsto: 100, peso_real: 105 }],
    descargas: [{ data: '2026-09-15', lote_codigo: '1', peso: 480, peso_previsto: 500 }, { data: '2026-09-15', lote_codigo: '2', peso: 515, peso_previsto: 500 }] },
  { carga_codigo: '102', data: '2026-09-16', hora: '07:00', receita: 'Terminação', peso_real: 1010,
    itens: [{ ingrediente: 'Silagem de milho', peso_previsto: 600, peso_real: 625 }, { ingrediente: 'Milho moído', peso_previsto: 300, peso_real: 280 }, { ingrediente: 'Núcleo mineral', peso_previsto: 100, peso_real: 105 }],
    descargas: [{ data: '2026-09-16', lote_codigo: '1', peso: 475, peso_previsto: 500 }, { data: '2026-09-16', lote_codigo: '2', peso: 535, peso_previsto: 500 }] },
  { carga_codigo: '103', data: '2026-09-16', hora: '14:30', receita: 'Recria', peso_real: 1000,
    itens: [{ ingrediente: 'Silagem de milho', peso_previsto: 700, peso_real: 700 }, { ingrediente: 'Farelo de soja', peso_previsto: 200, peso_real: 190 }, { ingrediente: 'Núcleo mineral', peso_previsto: 100, peso_real: 110 }],
    descargas: [{ data: '2026-09-16', lote_codigo: '3', peso: 600 }, { data: '2026-09-16', lote_codigo: '4', peso: 400 }] },
];
export const leiturasCocho = [{ lote_id: 'l3', data: '2026-09-16', quantidade_esperada: 620 }];
