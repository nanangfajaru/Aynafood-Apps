const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const qtyFmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 });

export function formatIDR(n: number | string | null | undefined): string {
  return idr.format(Number(n ?? 0));
}

export function formatQty(n: number | string | null | undefined): string {
  return qtyFmt.format(Number(n ?? 0));
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return "-";
  const date = new Date(d.length === 10 ? `${d}T00:00:00` : d);
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

/** Tanggal hari ini (YYYY-MM-DD) di zona waktu Asia/Jakarta. */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

const SATUAN = [
  "", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas",
];

function terbilangInt(n: number): string {
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${terbilangInt(n - 10)} belas`;
  if (n < 100) return `${terbilangInt(Math.floor(n / 10))} puluh ${terbilangInt(n % 10)}`;
  if (n < 200) return `seratus ${terbilangInt(n - 100)}`;
  if (n < 1000) return `${terbilangInt(Math.floor(n / 100))} ratus ${terbilangInt(n % 100)}`;
  if (n < 2000) return `seribu ${terbilangInt(n - 1000)}`;
  if (n < 1e6) return `${terbilangInt(Math.floor(n / 1000))} ribu ${terbilangInt(n % 1000)}`;
  if (n < 1e9) return `${terbilangInt(Math.floor(n / 1e6))} juta ${terbilangInt(n % 1e6)}`;
  if (n < 1e12) return `${terbilangInt(Math.floor(n / 1e9))} miliar ${terbilangInt(n % 1e9)}`;
  return `${terbilangInt(Math.floor(n / 1e12))} triliun ${terbilangInt(n % 1e12)}`;
}

/** Angka ke kata (Bahasa Indonesia), mis. 1500 -> "Seribu Lima Ratus Rupiah". */
export function terbilang(amount: number): string {
  const n = Math.round(Math.abs(amount));
  if (n === 0) return "Nol Rupiah";
  const words = terbilangInt(n).replace(/\s+/g, " ").trim();
  return `${words} rupiah`.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Bersihkan kata kunci pencarian agar aman dipakai di filter PostgREST `or()`. */
export function searchTerm(q: unknown): string | undefined {
  if (typeof q !== "string") return undefined;
  const s = q.replace(/[,()%*\\:"]/g, " ").trim();
  return s === "" ? undefined : s;
}
