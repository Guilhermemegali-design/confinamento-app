"use client";

export default function MarcaDesenvolvedor({ compacto = false }) {
  return (
    <div className={compacto ? "developer-brand developer-brand-compact" : "developer-brand"}>
      <span>Desenvolvido por</span>
      <img src="/gmegali-logo.png" alt="GMegali Consultoria" />
      <strong>GMegali Consultoria</strong>
    </div>
  );
}
