"use client";

import { ChevronLeft, Plus } from "lucide-react";
import { styles } from "@/lib/styles";

export function ListHeader({ title, actionLabel, onAction }) {
  return (
    <div style={styles.listHeader}>
      <h1 style={styles.h1}>{title}</h1>
      <button style={styles.fabInline} onClick={onAction}>
        <Plus size={15} /> {actionLabel}
      </button>
    </div>
  );
}

export function BackHeader({ title, onBack, semMargem }) {
  return (
    <div style={semMargem ? { ...styles.backHeader, marginBottom: 0 } : styles.backHeader}>
      <button onClick={onBack} style={styles.backBtn}><ChevronLeft size={20} /></button>
      <h1 style={styles.h1}>{title}</h1>
    </div>
  );
}

export function SectionTitle({ children }) {
  return <div style={styles.sectionTitle}>{children}</div>;
}

export function EmptyHint({ text }) {
  return <div style={styles.emptyHint}>{text}</div>;
}

export function Field({ label, value, multiline, highlight }) {
  return (
    <div style={styles.field}>
      <div style={styles.fieldLabel}>{label}</div>
      <div style={{ ...styles.fieldValue, ...(multiline ? { whiteSpace: "pre-wrap" } : {}), ...(highlight ? { color: "#1F4D45", fontWeight: 700 } : {}) }}>{value}</div>
    </div>
  );
}

export function InputField({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <label style={styles.field}>
      <div style={styles.fieldLabel}>{label}</div>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={styles.input}
      />
    </label>
  );
}

export function TextAreaField({ label, value, onChange, placeholder }) {
  return (
    <label style={styles.field}>
      <div style={styles.fieldLabel}>{label}</div>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...styles.input, minHeight: 90, resize: "vertical", fontFamily: "inherit" }}
      />
    </label>
  );
}

export function SelectField({ label, value, onChange, options }) {
  return (
    <label style={styles.field}>
      <div style={styles.fieldLabel}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={styles.input}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

export function PrimaryButton({ children, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...styles.primaryBtn, ...(disabled ? styles.primaryBtnDisabled : {}) }}>
      {children}
    </button>
  );
}
