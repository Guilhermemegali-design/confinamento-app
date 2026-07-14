"use client";

import { styles } from "@/lib/styles";

export default function Toast({ text }) {
  return <div style={styles.toast}>{text}</div>;
}
