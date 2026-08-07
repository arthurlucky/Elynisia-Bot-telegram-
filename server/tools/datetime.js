/**
 * datetime.js
 * Ambil tanggal/waktu sekarang, format tanggal, dan hitung selisih hari.
 * Zero dependency — hanya Intl & Date bawaan Node.js.
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const datetimeTool = new DynamicStructuredTool({
  name       : "datetime",
  description:
    "Ambil tanggal dan waktu saat ini, format sebuah tanggal, " +
    "atau hitung selisih hari antara dua tanggal. " +
    "Gunakan saat user bertanya tentang waktu, hari, bulan, atau tahun sekarang.",
  schema: z.object({
    action: z
      .enum(["now", "format", "diff"])
      .describe(
        "'now' = tanggal & waktu sekarang. " +
        "'format' = format ulang sebuah tanggal ke bentuk lain. " +
        "'diff' = selisih hari antara dua tanggal."
      ),
    timezone: z
      .string()
      .optional()
      .default("Asia/Jakarta")
      .describe("IANA timezone atau nama kota. Default: Asia/Jakarta (WIB)."),
    date_a: z
      .string()
      .optional()
      .describe("Tanggal pertama ISO 8601 (YYYY-MM-DD atau YYYY-MM-DDTHH:mm:ss)."),
    date_b: z
      .string()
      .optional()
      .describe("Tanggal kedua ISO 8601 (untuk action diff)."),
    locale: z
      .string()
      .optional()
      .default("id-ID")
      .describe("Locale format output. Default: id-ID."),
  }),
  func: async ({ action, timezone = "Asia/Jakarta", date_a, date_b, locale = "id-ID" }) => {
    try {
      const fmt = (d, tz) =>
        new Intl.DateTimeFormat(locale, {
          timeZone : tz,
          weekday  : "long",
          year     : "numeric",
          month    : "long",
          day      : "numeric",
          hour     : "2-digit",
          minute   : "2-digit",
          second   : "2-digit",
          timeZoneName: "short",
        }).format(d);

      if (action === "now") {
        const now = new Date();
        return `📅 Sekarang:\n${fmt(now, timezone)}`;
      }

      if (action === "format") {
        if (!date_a) return "❌ Sertakan date_a untuk action format.";
        const d = new Date(date_a);
        if (isNaN(d)) return `❌ Format tanggal tidak valid: "${date_a}"`;
        return `📅 ${fmt(d, timezone)}`;
      }

      if (action === "diff") {
        if (!date_a || !date_b) return "❌ Sertakan date_a dan date_b untuk action diff.";
        const dA = new Date(date_a);
        const dB = new Date(date_b);
        if (isNaN(dA) || isNaN(dB)) return "❌ Salah satu format tanggal tidak valid.";
        const diffMs   = Math.abs(dB.getTime() - dA.getTime());
        const diffDays = Math.floor(diffMs / 86_400_000);
        const diffHrs  = Math.floor((diffMs % 86_400_000) / 3_600_000);
        return (
          `⏳ Selisih antara ${date_a} dan ${date_b}:\n` +
          `${diffDays} hari ${diffHrs} jam (${diffMs.toLocaleString()} ms)`
        );
      }

      return "❌ action tidak dikenal.";
    } catch (err) {
      return `❌ datetime error: ${err.message}`;
    }
  },
});
