"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "./ui";

type NavItem = { href: string; label: string; icon: string };
const NAV: { group?: string; items: NavItem[] }[] = [
  { items: [{ href: "/", label: "Dashboard", icon: "▦" }] },
  {
    group: "Penjualan",
    items: [
      { href: "/orders", label: "Order Masuk", icon: "📥" },
      { href: "/invoices", label: "Invoice", icon: "🧾" },
      { href: "/customers", label: "Customer", icon: "👥" },
    ],
  },
  {
    group: "Produksi",
    items: [
      { href: "/mrp", label: "MRP / Kebutuhan", icon: "🧮" },
      { href: "/work-orders", label: "Work Order", icon: "🏭" },
      { href: "/bom", label: "BOM / Resep", icon: "📋" },
    ],
  },
  {
    group: "Pembelian",
    items: [
      { href: "/purchase-orders", label: "Purchase Order", icon: "🛒" },
      { href: "/suppliers", label: "Supplier", icon: "🚚" },
    ],
  },
  {
    group: "Inventory",
    items: [
      { href: "/inventory", label: "Stok", icon: "📦" },
      { href: "/inventory/movements", label: "Kartu Stok", icon: "📜" },
      { href: "/items", label: "Produk & Material", icon: "🏷️" },
    ],
  },
  { group: "Sistem", items: [{ href: "/settings", label: "Pengaturan", icon: "⚙️" }] },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/inventory") return pathname === "/inventory" || pathname.startsWith("/inventory/adjust");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  children,
  userEmail,
  companyName,
  logoutAction,
}: {
  children: ReactNode;
  userEmail: string;
  companyName: string;
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {NAV.map((section, i) => (
        <div key={i}>
          {section.group && (
            <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {section.group}
            </div>
          )}
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
                    isActive(pathname, item.href)
                      ? "bg-brand-50 font-medium text-brand-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  <span className="w-5 text-center text-base leading-none" aria-hidden>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  const sidebar = (
    <div className="flex h-full flex-col border-r border-slate-200 bg-white">
      <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-sm font-bold text-white">
          {companyName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{companyName}</div>
          <div className="text-[11px] text-slate-500">Invoicing · MRP · Inventory</div>
        </div>
      </div>
      {nav}
      <div className="border-t border-slate-200 p-3">
        <div className="truncate px-2 text-xs text-slate-500" title={userEmail}>
          {userEmail}
        </div>
        <form action={logoutAction}>
          <button className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-sm text-slate-600 hover:bg-slate-100">
            Keluar
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
          <button
            onClick={() => setOpen(true)}
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
            aria-label="Buka menu"
          >
            ☰
          </button>
          <span className="font-semibold">{companyName}</span>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
