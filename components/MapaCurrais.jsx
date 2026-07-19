"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { Trash2, Upload } from "lucide-react";
import { styles } from "@/lib/styles";
import { formatDataBR } from "@/lib/format";
import { SectionTitle, EmptyHint, InputField, PrimaryButton } from "./UI";

// Área aproximada (fórmula do "shoelace", em graus²) — só serve pra comparar
// tamanho relativo entre polígonos do mesmo KML, não é área real em m².
function areaAproximada(pontos) {
  let soma = 0;
  for (let i = 0; i < pontos.length - 1; i++) {
    const [lat1, lng1] = pontos[i];
    const [lat2, lng2] = pontos[i + 1];
    soma += lng1 * lat2 - lng2 * lat1;
  }
  return Math.abs(soma) / 2;
}

// Um <Placemark> "sem nome" (ou com o nome padrão que o Google Earth dá a um
// polígono não renomeado) é tratado como o contorno geral da fazenda, não
// como um curral — os Placemarks com <Point> (sem Polygon) são ignorados:
// no Earth Pro costumam ser só marcadores de câmera ("LookAt"), não a
// posição real do curral.
function nomeEhGenerico(nome) {
  return !nome || /^pol[íi]gono sem t[íi]tulo$/i.test(nome);
}

function extrairPlacemarksComPoligono(texto) {
  const blocos = texto.match(/<Placemark\b[\s\S]*?<\/Placemark>/gi) || [];
  return blocos
    .map((bloco) => {
      const nomeMatch = bloco.match(/<name>([\s\S]*?)<\/name>/i);
      const nome = nomeMatch ? nomeMatch[1].trim() : "";
      const polyMatch = bloco.match(/<Polygon\b[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/i);
      if (!polyMatch) return null;
      const pontos = polyMatch[1]
        .trim()
        .split(/\s+/)
        .map((par) => {
          const [lng, lat] = par.split(",").map(Number);
          return [lat, lng];
        })
        .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
      if (pontos.length === 0) return null;
      const latC = pontos.reduce((s, p) => s + p[0], 0) / pontos.length;
      const lngC = pontos.reduce((s, p) => s + p[1], 0) / pontos.length;
      return { nome, pontos, centro: [latC, lngC], area: areaAproximada(pontos) };
    })
    .filter(Boolean);
}

// Lê um KML e separa: o contorno geral (pra centralizar/desenhar o limite da
// fazenda) e os currais individuais (um por polígono nomeado). Se nenhum
// polígono estiver "sem título", assume que o maior de todos é o contorno —
// currais reais costumam ser bem menores que a área total da fazenda.
function parseKml(texto, curraisExistentes) {
  const placemarks = extrairPlacemarksComPoligono(texto);
  if (placemarks.length === 0) throw new Error("Não encontrei nenhum polígono nesse KML.");

  let contornoPlacemark = placemarks.find((p) => nomeEhGenerico(p.nome));
  if (!contornoPlacemark && placemarks.length > 1) {
    contornoPlacemark = placemarks.reduce((maior, p) => (p.area > maior.area ? p : maior));
  }

  const candidatos = placemarks.filter((p) => p !== contornoPlacemark);

  // desambigua nomes repetidos dentro do próprio arquivo (ex: dois "11")
  const vistos = new Map();
  const comNomeUnico = candidatos.map((c) => {
    const nomeBase = c.nome || "Sem nome";
    const contagem = (vistos.get(nomeBase) || 0) + 1;
    vistos.set(nomeBase, contagem);
    const nome = contagem > 1 ? `${nomeBase} (${contagem})` : nomeBase;
    return { nome, lat: c.centro[0], lng: c.centro[1], duplicadoNoArquivo: contagem > 1 };
  });

  const nomesExistentes = new Set((curraisExistentes || []).map((c) => c.nome.trim().toLowerCase()));
  const novos = comNomeUnico.filter((c) => !nomesExistentes.has(c.nome.trim().toLowerCase()));
  const jaExistiam = comNomeUnico.length - novos.length;
  const duplicadosNoArquivo = comNomeUnico.filter((c) => c.duplicadoNoArquivo).map((c) => c.nome);

  const centro = contornoPlacemark
    ? contornoPlacemark.centro
    : candidatos.length > 0
    ? [
        candidatos.reduce((s, c) => s + c.centro[0], 0) / candidatos.length,
        candidatos.reduce((s, c) => s + c.centro[1], 0) / candidatos.length,
      ]
    : null;

  return {
    contorno: contornoPlacemark ? contornoPlacemark.pontos : null,
    centro,
    novos,
    jaExistiam,
    duplicadosNoArquivo,
  };
}

function escapeHtml(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

const CENTRO_PADRAO = [-15.78, -47.93]; // Brasília, só de fallback quando não há contorno/curral algum
const ZOOM_PADRAO = 4;

// Mapa de currais do confinamento: importa o contorno da fazenda de um KML,
// marca cada curral com um clique, e deixa arrastar o "crachá" do lote (o
// nome dele) de um curral pro outro — ou da bandeja de "sem curral" pra um
// curral vazio. Pensado pra funcionário usar no campo, sem precisar
// entender de mapa: arrastar e soltar é a única ação.
export default function MapaCurrais({ cliente, lotes, currais, curralOcupacoes = [], onAdicionarCurral, onAtualizarCurral, onExcluirCurral, onImportarCurrais, onAtualizarLote, onMoverLoteParaCurral, onAtualizarCliente }) {
  const mapaRef = useRef(null);
  // Cobre o mapa E a bandeja de "sem curral" abaixo — o drag precisa
  // funcionar partindo de qualquer um dos dois.
  const arrastoContainerRef = useRef(null);
  const mapaInstancia = useRef(null);
  const marcadoresPorCurral = useRef(new Map());
  const arrastoRef = useRef(null);

  const [pronto, setPronto] = useState(false);
  const [modoAdicionar, setModoAdicionar] = useState(false);
  const [novoLocal, setNovoLocal] = useState(null); // {lat, lng}
  const [nomeNovoCurral, setNomeNovoCurral] = useState("");
  const [curralEditando, setCurralEditando] = useState(null); // curral inteiro
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [lendoKml, setLendoKml] = useState(false);
  const [importandoKml, setImportandoKml] = useState(false);
  const [erroKml, setErroKml] = useState(null);
  const [previaKml, setPreviaKml] = useState(null);

  const lotesAtivos = lotes.filter((l) => !l.data_saida);
  const loteDoCurral = new Map();
  for (const l of lotesAtivos) {
    if (l.curral_id) loteDoCurral.set(l.curral_id, l);
  }
  const lotesSemCurral = lotesAtivos.filter((l) => !l.curral_id);

  // ---------- Inicializa o mapa uma única vez ----------
  useEffect(() => {
    if (!mapaRef.current || mapaInstancia.current) return;
    let cancelado = false;
    import("leaflet").then((L) => {
      if (cancelado || mapaInstancia.current) return;
      const map = L.map(mapaRef.current, { tap: true }).setView(CENTRO_PADRAO, ZOOM_PADRAO);
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19,
        attribution: "Tiles &copy; Esri",
      }).addTo(map);
      mapaInstancia.current = { L, map };
      setPronto(true);
    });
    return () => {
      cancelado = true;
      if (mapaInstancia.current) {
        mapaInstancia.current.map.remove();
        mapaInstancia.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // O container pode mudar de tamanho depois do mapa já criado (o layout do
  // resto da tela — abas, botões — ainda assentando, ou o import dinâmico do
  // Leaflet montando em outro ciclo do React). O Leaflet só recalcula a
  // posição dos marcadores quando manda invalidar o tamanho — sem isso ele
  // guarda um "_pixelOrigin" errado pra sempre e todo marcador nasce
  // deslocado da posição visual real dos tiles.
  useEffect(() => {
    if (!pronto || !mapaRef.current) return;
    const { map } = mapaInstancia.current;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(mapaRef.current);
    return () => observer.disconnect();
  }, [pronto]);

  // ---------- Centraliza no contorno/centro salvo do cliente ----------
  useEffect(() => {
    if (!pronto) return;
    const { L, map } = mapaInstancia.current;
    let cancelado = false;
    const camadasContorno = [];

    // Se o container ainda estiver com tamanho 0 (layout do resto da tela
    // ainda assentando), fitBounds/setView calculam um zoom degenerado (bate
    // no teto) que nunca mais se corrige sozinho depois — espera o tamanho
    // real aparecer antes de centralizar.
    function centralizar() {
      if (cancelado) return;
      map.invalidateSize();
      if (map.getSize().x === 0) {
        requestAnimationFrame(centralizar);
        return;
      }
      if (cliente.mapa_contorno && cliente.mapa_contorno.length > 0) {
        const poligono = L.polygon(cliente.mapa_contorno, { color: "#1F4D45", weight: 2, fillOpacity: 0.06 }).addTo(map);
        camadasContorno.push(poligono);
        map.fitBounds(poligono.getBounds(), { padding: [30, 30] });
      } else if (cliente.mapa_centro_lat != null && cliente.mapa_centro_lng != null) {
        map.setView([Number(cliente.mapa_centro_lat), Number(cliente.mapa_centro_lng)], 17);
      } else if (currais.length > 0) {
        const bounds = L.latLngBounds(currais.map((c) => [Number(c.lat), Number(c.lng)]));
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    }
    centralizar();

    return () => {
      cancelado = true;
      camadasContorno.forEach((c) => c.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, cliente.id, cliente.mapa_contorno, cliente.mapa_centro_lat, cliente.mapa_centro_lng]);

  // ---------- Clique no mapa: marcar novo curral ----------
  useEffect(() => {
    if (!pronto) return;
    const { map } = mapaInstancia.current;
    function aoClicar(e) {
      if (!modoAdicionar) return;
      setNovoLocal({ lat: e.latlng.lat, lng: e.latlng.lng });
      setModoAdicionar(false);
    }
    map.on("click", aoClicar);
    return () => map.off("click", aoClicar);
  }, [pronto, modoAdicionar]);

  // ---------- Sincroniza marcadores (um por curral) ----------
  useEffect(() => {
    if (!pronto) return;
    const { L, map } = mapaInstancia.current;
    const idsAtuais = new Set(currais.map((c) => c.id));

    // remove marcadores de currais que já não existem mais
    for (const [id, marker] of marcadoresPorCurral.current) {
      if (!idsAtuais.has(id)) {
        marker.remove();
        marcadoresPorCurral.current.delete(id);
      }
    }

    for (const curral of currais) {
      const ocupante = loteDoCurral.get(curral.id);
      const html = `
        <div class="curral-pin" data-curral-id="${curral.id}">
          <div class="curral-rotulo" data-curral-editar="${curral.id}">${escapeHtml(curral.nome)}</div>
          ${
            ocupante
              ? `<div class="lote-cracha" data-lote-id="${ocupante.id}" data-lote-nome="${escapeHtml(ocupante.nome)}">${escapeHtml(ocupante.nome)}</div>`
              : `<div class="curral-vazio">vazio</div>`
          }
        </div>`;
      const icon = L.divIcon({ html, className: "curral-icon-wrapper", iconSize: null });

      let marker = marcadoresPorCurral.current.get(curral.id);
      if (!marker) {
        marker = L.marker([Number(curral.lat), Number(curral.lng)], { icon, interactive: true }).addTo(map);
        marcadoresPorCurral.current.set(curral.id, marker);
      } else {
        marker.setIcon(icon);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, currais, lotesAtivos]);

  // ---------- Drag-and-drop dos crachás de lote (ponteiro, funciona em touch e mouse) ----------
  useEffect(() => {
    function elementoArrastavel(alvo) {
      return alvo.closest && alvo.closest("[data-lote-id]");
    }
    function elementoRotulo(alvo) {
      return alvo.closest && alvo.closest("[data-curral-editar]");
    }

    function aoPressionar(e) {
      const rotuloEl = elementoRotulo(e.target);
      if (rotuloEl) {
        const curralId = rotuloEl.getAttribute("data-curral-editar");
        const curral = currais.find((c) => c.id === curralId);
        if (curral) {
          setCurralEditando(curral);
          setNomeEdicao(curral.nome);
        }
        return;
      }

      const crachaEl = elementoArrastavel(e.target);
      if (!crachaEl) return;
      e.preventDefault();
      const origemEl = crachaEl.closest("[data-curral-id]");
      const ghost = document.createElement("div");
      ghost.className = "lote-cracha lote-cracha-fantasma";
      ghost.textContent = crachaEl.getAttribute("data-lote-nome") || crachaEl.textContent;
      ghost.style.position = "fixed";
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
      ghost.style.pointerEvents = "none";
      ghost.style.zIndex = 9999;
      document.body.appendChild(ghost);

      if (mapaInstancia.current) mapaInstancia.current.map.dragging.disable();

      arrastoRef.current = {
        loteId: crachaEl.getAttribute("data-lote-id"),
        origemCurralId: origemEl ? origemEl.getAttribute("data-curral-id") : null,
        ghost,
      };
      window.addEventListener("pointermove", aoMover);
      window.addEventListener("pointerup", aoSoltar);
    }

    function aoMover(e) {
      if (!arrastoRef.current) return;
      arrastoRef.current.ghost.style.left = `${e.clientX}px`;
      arrastoRef.current.ghost.style.top = `${e.clientY}px`;
    }

    function aoSoltar(e) {
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerup", aoSoltar);
      if (mapaInstancia.current) mapaInstancia.current.map.dragging.enable();
      const arrasto = arrastoRef.current;
      arrastoRef.current = null;
      if (!arrasto) return;
      arrasto.ghost.remove();

      const alvo = document.elementFromPoint(e.clientX, e.clientY);
      const curralAlvoEl = alvo && alvo.closest && alvo.closest("[data-curral-id]");
      const bandejaEl = alvo && alvo.closest && alvo.closest("[data-bandeja-sem-curral]");
      const curralAlvoId = curralAlvoEl ? curralAlvoEl.getAttribute("data-curral-id") : null;

      const mover = onMoverLoteParaCurral || ((loteId, novoCurralId) => onAtualizarLote(loteId, { curral_id: novoCurralId }));

      if (bandejaEl && !curralAlvoId) {
        if (arrasto.origemCurralId) mover(arrasto.loteId, null, arrasto.origemCurralId);
        return;
      }
      if (!curralAlvoId || curralAlvoId === arrasto.origemCurralId) return;

      const ocupanteAlvo = loteDoCurral.get(curralAlvoId);
      mover(arrasto.loteId, curralAlvoId, arrasto.origemCurralId);
      if (ocupanteAlvo && ocupanteAlvo.id !== arrasto.loteId) {
        mover(ocupanteAlvo.id, arrasto.origemCurralId || null, curralAlvoId);
      }
    }

    const container = arrastoContainerRef.current;
    if (!container) return;
    container.addEventListener("pointerdown", aoPressionar);
    return () => container.removeEventListener("pointerdown", aoPressionar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currais, lotesAtivos]);

  async function salvarNovoCurral() {
    if (!novoLocal || !nomeNovoCurral.trim()) return;
    await onAdicionarCurral(cliente.id, { nome: nomeNovoCurral.trim(), lat: novoLocal.lat, lng: novoLocal.lng });
    setNovoLocal(null);
    setNomeNovoCurral("");
  }

  async function salvarEdicaoCurral() {
    if (!curralEditando || !nomeEdicao.trim()) return;
    await onAtualizarCurral(curralEditando.id, { nome: nomeEdicao.trim() });
    setCurralEditando(null);
  }

  async function excluirCurralEditando() {
    if (!curralEditando) return;
    if (!confirm(`Excluir o curral "${curralEditando.nome}"? O lote que estiver nele fica sem curral.`)) return;
    await onExcluirCurral(curralEditando.id);
    setCurralEditando(null);
  }

  async function lerKml(file) {
    if (!file) return;
    setLendoKml(true);
    setErroKml(null);
    setPreviaKml(null);
    try {
      const texto = await file.text();
      const resultado = parseKml(texto, currais);
      setPreviaKml(resultado);
    } catch (e) {
      setErroKml(e.message || "Não foi possível ler esse KML.");
    } finally {
      setLendoKml(false);
    }
  }

  async function confirmarImportacaoKml() {
    if (!previaKml) return;
    setImportandoKml(true);
    try {
      if (previaKml.contorno || previaKml.centro) {
        await onAtualizarCliente(cliente.id, {
          mapa_contorno: previaKml.contorno,
          mapa_centro_lat: previaKml.centro ? previaKml.centro[0] : null,
          mapa_centro_lng: previaKml.centro ? previaKml.centro[1] : null,
        });
      }
      if (previaKml.novos.length > 0 && onImportarCurrais) {
        await onImportarCurrais(
          cliente.id,
          previaKml.novos.map((n) => ({ nome: n.nome, lat: n.lat, lng: n.lng }))
        );
      }
      setPreviaKml(null);
    } finally {
      setImportandoKml(false);
    }
  }

  return (
    <div ref={arrastoContainerRef}>
      <style>{`
        .curral-icon-wrapper { background: transparent; border: none; }
        .curral-pin { display: flex; flex-direction: column; align-items: center; gap: 3px; transform: translate(-50%, -100%); }
        .curral-rotulo { background: #1F4D45; color: #fff; font-size: 11px; font-weight: 700; padding: 3px 7px; border-radius: 6px; white-space: nowrap; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
        .lote-cracha { background: #A85A2A; color: #fff; font-size: 12px; font-weight: 700; padding: 5px 10px; border-radius: 8px; white-space: nowrap; cursor: grab; touch-action: none; box-shadow: 0 1px 4px rgba(0,0,0,0.35); border: 2px solid #fff; }
        .lote-cracha-fantasma { opacity: 0.9; transform: translate(-50%, -50%); }
        .curral-vazio { background: rgba(255,255,255,0.85); color: #5C5C58; font-size: 10.5px; padding: 3px 8px; border-radius: 8px; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 4px 10px", gap: 8, flexWrap: "wrap" }}>
        <div style={{ ...styles.sectionTitle, margin: 0 }}>Mapa de currais</div>
        <div style={{ display: "flex", gap: 8 }}>
          {onAtualizarCliente && (
            <label style={{ ...styles.editLinkBtn, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <Upload size={14} /> {lendoKml ? "Lendo..." : "Importar KML"}
              <input
                type="file"
                accept=".kml"
                disabled={lendoKml}
                onChange={(e) => lerKml(e.target.files?.[0])}
                style={{ display: "none" }}
              />
            </label>
          )}
          {onAdicionarCurral && (
            <button
              onClick={() => setModoAdicionar((v) => !v)}
              style={{ ...styles.editLinkBtn, background: modoAdicionar ? "#A85A2A" : "#1F4D45" }}
            >
              {modoAdicionar ? "Toque no mapa..." : "+ Marcar curral"}
            </button>
          )}
        </div>
      </div>
      {erroKml && <div style={{ fontSize: 13, color: "#B8763E", padding: "0 4px 8px" }}>{erroKml}</div>}

      {previaKml && (
        <div style={{ ...styles.card, marginBottom: 10 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, padding: "10px 0 4px" }}>Resumo do KML</div>
          <div style={{ fontSize: 13, color: "#5C5C58", lineHeight: 1.6, paddingBottom: 10 }}>
            {previaKml.contorno
              ? "Contorno da fazenda encontrado (vai centralizar o mapa)."
              : "Sem contorno geral nesse KML — só os currais."}
            <div>{previaKml.novos.length} curral{previaKml.novos.length !== 1 ? "is" : ""} novo{previaKml.novos.length !== 1 ? "s" : ""}: {previaKml.novos.map((n) => n.nome).join(", ") || "—"}</div>
            {previaKml.jaExistiam > 0 && <div>{previaKml.jaExistiam} já existiam (não serão duplicados)</div>}
            {previaKml.duplicadosNoArquivo.length > 0 && (
              <div style={{ color: "#B8763E", marginTop: 4 }}>
                Nomes repetidos dentro do próprio KML, renomeados pra não colidir: {previaKml.duplicadosNoArquivo.join(", ")} — vale revisar o nome certo depois.
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, padding: "0 0 12px" }}>
            <button onClick={() => setPreviaKml(null)} style={{ ...styles.editLinkBtn, background: "#F1EFE8", color: "#5C5C58", flex: 1 }}>
              Cancelar
            </button>
            <button onClick={confirmarImportacaoKml} disabled={importandoKml} style={{ ...styles.editLinkBtn, flex: 1 }}>
              {importandoKml ? "Importando..." : "Confirmar importação"}
            </button>
          </div>
        </div>
      )}

      <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid #ECEAE3" }}>
        <div ref={mapaRef} style={{ width: "100%", height: 420, background: "#E4EFE9" }} />
      </div>

      {novoLocal && (
        <div style={{ ...styles.card, marginTop: 10 }}>
          <InputField label="Nome do curral" value={nomeNovoCurral} onChange={setNomeNovoCurral} placeholder="Ex: Curral 5" />
          <div style={{ display: "flex", gap: 8, padding: "0 0 12px" }}>
            <button onClick={() => { setNovoLocal(null); setNomeNovoCurral(""); }} style={{ ...styles.editLinkBtn, background: "#F1EFE8", color: "#5C5C58", flex: 1 }}>
              Cancelar
            </button>
            <button onClick={salvarNovoCurral} disabled={!nomeNovoCurral.trim()} style={{ ...styles.editLinkBtn, flex: 1 }}>
              Salvar curral
            </button>
          </div>
        </div>
      )}

      {curralEditando && (
        <div style={{ ...styles.card, marginTop: 10 }}>
          {(() => {
            const ocupante = loteDoCurral.get(curralEditando.id);
            const historico = curralOcupacoes
              .filter((o) => o.curral_id === curralEditando.id)
              .sort((a, b) => b.data_inicio.localeCompare(a.data_inicio));
            const ocupacaoAtual = historico.find((o) => o.data_fim == null);
            return (
              <div style={{ padding: "10px 0 4px" }}>
                <div style={styles.fieldLabel}>Ocupante atual</div>
                {ocupante ? (
                  <div style={{ fontSize: 13.5, padding: "4px 0 10px" }}>
                    <div style={{ fontWeight: 700 }}>{ocupante.nome}</div>
                    <div style={{ color: "#9A9A94", fontSize: 12 }}>
                      {ocupante.num_cabecas} cab.
                      {ocupacaoAtual ? ` · desde ${formatDataBR(ocupacaoAtual.data_inicio)}` : ""}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "#9A9A94", padding: "4px 0 10px" }}>Vazio no momento.</div>
                )}
                <div style={styles.fieldLabel}>Histórico de lotes neste curral</div>
                {historico.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#9A9A94", padding: "4px 0 10px" }}>
                    Nenhuma movimentação registrada ainda.
                  </div>
                ) : (
                  <div style={{ padding: "4px 0 10px" }}>
                    {historico.map((o) => {
                      const lote = lotes.find((l) => l.id === o.lote_id);
                      return (
                        <div key={o.id} style={{ fontSize: 12.5, padding: "4px 0", borderBottom: "1px solid #F1EFE8" }}>
                          <span style={{ fontWeight: 600 }}>{lote ? lote.nome : "Lote excluído"}</span>
                          <span style={{ color: "#9A9A94" }}>
                            {" — "}
                            {formatDataBR(o.data_inicio)} até {o.data_fim ? formatDataBR(o.data_fim) : "hoje"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
          <InputField label="Nome do curral" value={nomeEdicao} onChange={setNomeEdicao} />
          <div style={{ display: "flex", gap: 8, padding: "0 0 12px" }}>
            <button onClick={() => setCurralEditando(null)} style={{ ...styles.editLinkBtn, background: "#F1EFE8", color: "#5C5C58", flex: 1 }}>
              Cancelar
            </button>
            <button onClick={salvarEdicaoCurral} disabled={!nomeEdicao.trim()} style={{ ...styles.editLinkBtn, flex: 1 }}>
              Salvar
            </button>
            {onExcluirCurral && (
              <button onClick={excluirCurralEditando} style={{ ...styles.editLinkBtn, background: "transparent", color: "#B8763E", border: "1px solid #F0DDC8", display: "flex", alignItems: "center", gap: 4 }}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      <SectionTitle>Lotes sem curral (arraste pro mapa)</SectionTitle>
      <div data-bandeja-sem-curral="1" style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "0 4px 20px", minHeight: 40 }}>
        {lotesSemCurral.length === 0 && <EmptyHint text="Todo lote ativo já está em algum curral." />}
        {lotesSemCurral.map((l) => (
          <div key={l.id} data-lote-id={l.id} data-lote-nome={l.nome} className="lote-cracha">
            {l.nome}
          </div>
        ))}
      </div>
    </div>
  );
}
