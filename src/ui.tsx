// Small shared pieces. Styling only.
import { useState } from "react";

export const inputCls = "w-full rounded-md border border-rule bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent/50";
export const btnPrimary = "rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-60";
export const btnGhost = "rounded-md border border-rule bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-rule/60 focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-60";
export const btnIcon = "rounded px-1.5 text-ink-soft hover:bg-rule hover:text-danger";

export const money = (n: number) => `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function Card({ title, action, children, id }: { title: string; action?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <div id={id} className="rounded-xl border border-rule bg-surface-raised p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Caption({ children, tone = "soft" }: { children: React.ReactNode; tone?: "soft" | "accent" | "danger" }) {
  const color = tone === "accent" ? "text-accent" : tone === "danger" ? "text-danger" : "text-ink-soft";
  return <div className={`font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] ${color}`}>{children}</div>;
}

/** A labelled field with its explanation always visible — the point of the app. */
export function Field({ label, help, children, className = "" }: { label: string; help?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {help && <span className="mt-1 block text-xs leading-relaxed text-ink-soft">{help}</span>}
    </label>
  );
}

export function MoneyInput({ value, onChange, placeholder }: { value: number; onChange: (n: number) => void; placeholder?: string }) {
  return <input className={`${inputCls} font-mono`} type="number" inputMode="decimal" step="0.01" min={0} value={value || ""} placeholder={placeholder ?? "0.00"} onChange={(e) => onChange(Number(e.target.value) || 0)} />;
}

export function Notice({ tone, title, items }: { tone: "danger" | "warn" | "good"; title: string; items: string[] }) {
  const border = tone === "danger" ? "border-danger/40 bg-danger-soft" : tone === "warn" ? "border-warn/40 bg-accent-soft/40" : "border-good/40 bg-surface";
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm text-ink ${border}`}>
      <Caption tone={tone === "danger" ? "danger" : "soft"}>{title}</Caption>
      <ul className="mt-1 list-disc pl-5">
        {items.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className={btnGhost}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}
