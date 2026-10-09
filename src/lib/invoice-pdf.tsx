import "server-only";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { INVOICE_STATUS } from "./constants";
import { formatDate, formatIDR, formatQty, terbilang } from "./format";
import type { InvoiceFull } from "./queries";

const BRAND = "#c2410c";

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#0f172a" },
  row: { flexDirection: "row" },
  between: { flexDirection: "row", justifyContent: "space-between" },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold", color: BRAND },
  company: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  muted: { color: "#64748b" },
  bold: { fontFamily: "Helvetica-Bold" },
  box: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 4, padding: 8 },
  th: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderColor: "#cbd5e1",
    paddingVertical: 5,
    fontFamily: "Helvetica-Bold",
  },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#e2e8f0", paddingVertical: 5 },
  cNo: { width: "5%", paddingHorizontal: 4 },
  cDesc: { width: "41%", paddingHorizontal: 4 },
  cQty: { width: "12%", paddingHorizontal: 4, textAlign: "right" },
  cPrice: { width: "15%", paddingHorizontal: 4, textAlign: "right" },
  cDisc: { width: "9%", paddingHorizontal: 4, textAlign: "right" },
  cTotal: { width: "18%", paddingHorizontal: 4, textAlign: "right" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  stamp: {
    position: "absolute",
    top: 300,
    left: 150,
    fontSize: 60,
    color: "#ef4444",
    opacity: 0.15,
    transform: "rotate(-25deg)",
    fontFamily: "Helvetica-Bold",
  },
});

function InvoiceDoc({ data }: { data: InvoiceFull }) {
  const { invoice: inv, customer, lines, company } = data;
  const status = INVOICE_STATUS[inv.status as keyof typeof INVOICE_STATUS]?.label ?? inv.status;

  return (
    <Document title={inv.invoice_no} author={company.name}>
      <Page size="A4" style={s.page}>
        {(inv.status === "VOID" || inv.status === "DRAFT" || inv.status === "PAID") && (
          <Text style={[s.stamp, inv.status === "PAID" ? { color: "#10b981" } : {}]}>{status.toUpperCase()}</Text>
        )}

        {/* Header */}
        <View style={[s.between, { marginBottom: 20 }]}>
          <View style={[s.row, { gap: 10, maxWidth: "60%" }]}>
            {company.logo_url ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={company.logo_url} style={{ width: 48, height: 48, objectFit: "contain" }} />
            ) : null}
            <View>
              <Text style={s.company}>{company.name}</Text>
              {company.address ? <Text style={s.muted}>{company.address}</Text> : null}
              {company.phone || company.email ? (
                <Text style={s.muted}>{[company.phone, company.email].filter(Boolean).join(" · ")}</Text>
              ) : null}
              {company.npwp ? <Text style={s.muted}>NPWP: {company.npwp}</Text> : null}
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.h1}>INVOICE</Text>
            <Text style={s.bold}>{inv.invoice_no}</Text>
          </View>
        </View>

        {/* Bill to & meta */}
        <View style={[s.between, { marginBottom: 16, gap: 12 }]}>
          <View style={[s.box, { flex: 1 }]}>
            <Text style={[s.muted, { marginBottom: 3 }]}>Ditagihkan kepada</Text>
            <Text style={s.bold}>{customer.name}</Text>
            {customer.address ? <Text>{customer.address}</Text> : null}
            {customer.phone ? <Text>{customer.phone}</Text> : null}
            {customer.npwp ? <Text>NPWP: {customer.npwp}</Text> : null}
          </View>
          <View style={[s.box, { width: 200 }]}>
            <View style={s.totalRow}>
              <Text style={s.muted}>Tanggal</Text>
              <Text>{formatDate(inv.invoice_date)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.muted}>Jatuh tempo</Text>
              <Text>{formatDate(inv.due_date)}</Text>
            </View>
            {inv.order_no ? (
              <View style={s.totalRow}>
                <Text style={s.muted}>Ref. Order</Text>
                <Text>{inv.order_no}</Text>
              </View>
            ) : null}
            <View style={s.totalRow}>
              <Text style={s.muted}>Status</Text>
              <Text>{status}</Text>
            </View>
          </View>
        </View>

        {/* Lines */}
        <View style={s.th}>
          <Text style={s.cNo}>#</Text>
          <Text style={s.cDesc}>Deskripsi</Text>
          <Text style={s.cQty}>Qty</Text>
          <Text style={s.cPrice}>Harga</Text>
          <Text style={s.cDisc}>Disc</Text>
          <Text style={s.cTotal}>Jumlah</Text>
        </View>
        {lines.map((l, i) => (
          <View key={l.id} style={s.tr} wrap={false}>
            <Text style={s.cNo}>{i + 1}</Text>
            <Text style={s.cDesc}>{l.description}</Text>
            <Text style={s.cQty}>
              {formatQty(l.qty)} {l.unit ?? ""}
            </Text>
            <Text style={s.cPrice}>{formatIDR(l.unit_price)}</Text>
            <Text style={s.cDisc}>{l.discount_pct ? `${formatQty(l.discount_pct)}%` : "-"}</Text>
            <Text style={s.cTotal}>{formatIDR(l.line_total)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={[s.between, { marginTop: 12 }]} wrap={false}>
          <View style={{ width: "50%", paddingRight: 12 }}>
            <Text style={s.muted}>Terbilang:</Text>
            <Text style={{ fontFamily: "Helvetica-Oblique", marginBottom: 10 }}>{terbilang(inv.total)}</Text>
            {company.bank_account ? (
              <View style={s.box}>
                <Text style={[s.muted, { marginBottom: 2 }]}>Pembayaran ke</Text>
                <Text style={s.bold}>
                  {company.bank_name} {company.bank_account}
                </Text>
                {company.bank_holder ? <Text>a.n. {company.bank_holder}</Text> : null}
              </View>
            ) : null}
          </View>
          <View style={{ width: "42%" }}>
            <View style={s.totalRow}>
              <Text>Subtotal</Text>
              <Text>{formatIDR(inv.subtotal)}</Text>
            </View>
            {inv.discount_amount > 0 ? (
              <View style={s.totalRow}>
                <Text>Diskon</Text>
                <Text>- {formatIDR(inv.discount_amount)}</Text>
              </View>
            ) : null}
            <View style={s.totalRow}>
              <Text>DPP</Text>
              <Text>{formatIDR(inv.dpp)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text>PPN {formatQty(inv.tax_rate)}%</Text>
              <Text>{formatIDR(inv.tax_amount)}</Text>
            </View>
            <View style={[s.totalRow, { borderTopWidth: 1, borderColor: "#0f172a", marginTop: 3, paddingTop: 4 }]}>
              <Text style={[s.bold, { fontSize: 11 }]}>TOTAL</Text>
              <Text style={[s.bold, { fontSize: 11 }]}>{formatIDR(inv.total)}</Text>
            </View>
            {inv.amount_paid > 0 ? (
              <>
                <View style={s.totalRow}>
                  <Text>Dibayar</Text>
                  <Text>- {formatIDR(inv.amount_paid)}</Text>
                </View>
                <View style={s.totalRow}>
                  <Text style={s.bold}>Sisa</Text>
                  <Text style={s.bold}>{formatIDR(inv.balance)}</Text>
                </View>
              </>
            ) : null}
          </View>
        </View>

        {inv.notes ? (
          <View style={{ marginTop: 14 }}>
            <Text style={s.muted}>Catatan</Text>
            <Text>{inv.notes}</Text>
          </View>
        ) : null}

        {/* Signature */}
        <View style={[s.row, { justifyContent: "flex-end", marginTop: 30 }]} wrap={false}>
          <View style={{ width: 160, alignItems: "center" }}>
            <Text>Hormat kami,</Text>
            <Text style={{ marginTop: 50, borderTopWidth: 0.5, borderColor: "#0f172a", paddingTop: 3, width: "100%", textAlign: "center" }}>
              {company.name}
            </Text>
          </View>
        </View>

        {company.invoice_footer ? (
          <Text style={[s.muted, { position: "absolute", bottom: 24, left: 36, right: 36, textAlign: "center" }]} fixed>
            {company.invoice_footer}
          </Text>
        ) : null}
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(data: InvoiceFull): Promise<Buffer> {
  return renderToBuffer(<InvoiceDoc data={data} />);
}
