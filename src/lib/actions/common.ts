import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";

export type ActionResult = { error?: string; ok?: boolean; message?: string } | null;

/** Ubah error Postgres/PostgREST menjadi pesan yang ramah pengguna. */
export function friendlyError(error: Pick<PostgrestError, "message" | "code"> | null): string {
  if (!error) return "Terjadi kesalahan";
  switch (error.code) {
    case "23503":
      return "Data masih dipakai oleh dokumen lain sehingga tidak bisa dihapus/diubah. Nonaktifkan saja jika tidak dipakai lagi.";
    case "23505":
      return "Kode/nomor sudah dipakai. Gunakan kode lain.";
    case "23514":
      return "Nilai tidak valid (cek qty/harga tidak boleh negatif).";
    case "22P02":
      return "Format data tidak valid. Pastikan semua pilihan sudah diisi.";
    case "42501":
      return "Anda tidak memiliki akses. Silakan login ulang.";
  }
  return error.message;
}

export function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

export function strOrNull(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
}

export function num(fd: FormData, key: string, fallback = 0): number {
  const v = str(fd, key).replace(",", ".");
  if (v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}
