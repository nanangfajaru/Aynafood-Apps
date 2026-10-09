import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { statusMeta, type Tone } from "@/lib/constants";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------- Buttons
type Variant = "primary" | "secondary" | "danger" | "ghost" | "success";
type Size = "sm" | "md";

export function buttonClass(variant: Variant = "secondary", size: Size = "md") {
  return cn(
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap",
    size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm",
    variant === "primary" && "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
    variant === "success" && "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
    variant === "secondary" && "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-sm",
    variant === "danger" && "border border-red-200 bg-white text-red-600 hover:bg-red-50",
    variant === "ghost" && "text-slate-600 hover:bg-slate-100",
  );
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={cn(buttonClass(variant, size), className)} {...props} />;
}

export function LinkButton({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={cn(buttonClass(variant, size), className)} {...props} />;
}

// ---------------------------------------------------------------- Layout
export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-block text-sm text-slate-500 hover:text-slate-800">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-slate-200 bg-white shadow-sm", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-slate-800">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "gray",
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  href?: string;
}) {
  const body = (
    <div className={cn("rounded-lg border bg-white p-4 shadow-sm", href && "hover:border-brand-300", TONE_BORDER[tone])}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

const TONE_BORDER: Record<Tone, string> = {
  gray: "border-slate-200",
  blue: "border-l-4 border-l-sky-500 border-slate-200",
  amber: "border-l-4 border-l-amber-500 border-slate-200",
  green: "border-l-4 border-l-emerald-500 border-slate-200",
  red: "border-l-4 border-l-red-500 border-slate-200",
  violet: "border-l-4 border-l-violet-500 border-slate-200",
};

// ---------------------------------------------------------------- Badges
const TONE_BADGE: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONE_BADGE[tone],
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({
  map,
  status,
}: {
  map: Record<string, { label: string; tone: Tone }>;
  status: string;
}) {
  const m = statusMeta(map, status);
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

// ---------------------------------------------------------------- Forms
export const inputClass =
  "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm " +
  "placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 " +
  "disabled:bg-slate-50 disabled:text-slate-500";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(inputClass, "pr-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputClass, className)} rows={3} {...props} />;
}

export function Alert({ tone = "red", children }: { tone?: "red" | "amber" | "blue" | "green"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        tone === "red" && "border-red-200 bg-red-50 text-red-700",
        tone === "amber" && "border-amber-200 bg-amber-50 text-amber-800",
        tone === "blue" && "border-sky-200 bg-sky-50 text-sky-800",
        tone === "green" && "border-emerald-200 bg-emerald-50 text-emerald-800",
      )}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- Tables
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="min-w-full divide-y divide-slate-200 text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "whitespace-nowrap bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({ children, className, ...props }: ComponentProps<"td">) {
  return (
    <td className={cn("px-3 py-2 align-top text-slate-700", className)} {...props}>
      {children}
    </td>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-sm text-slate-500">
        {children}
      </td>
    </tr>
  );
}

export function TabLinks({
  tabs,
  active,
}: {
  tabs: { key: string; label: ReactNode; href: string }[];
  active: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
            t.key === active
              ? "border-brand-600 text-brand-700"
              : "border-transparent text-slate-500 hover:text-slate-800",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function DescList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => (
        <div key={it.label}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{it.label}</dt>
          <dd className="mt-0.5 text-sm text-slate-900">{it.value ?? "-"}</dd>
        </div>
      ))}
    </dl>
  );
}
