import { describe, expect, it } from "vitest";
import { terbilang } from "./format";

describe("terbilang", () => {
  it.each([
    [0, "Nol Rupiah"],
    [11, "Sebelas Rupiah"],
    [15, "Lima Belas Rupiah"],
    [100, "Seratus Rupiah"],
    [1500, "Seribu Lima Ratus Rupiah"],
    [178710, "Seratus Tujuh Puluh Delapan Ribu Tujuh Ratus Sepuluh Rupiah"],
    [2_000_000, "Dua Juta Rupiah"],
    [1_250_000_000, "Satu Miliar Dua Ratus Lima Puluh Juta Rupiah"],
  ])("%d", (n, words) => {
    expect(terbilang(n)).toBe(words);
  });
});
