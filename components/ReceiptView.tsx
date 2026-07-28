import React from "react";
import { View, Text } from "react-native";
import type { SaleRecord } from "@/lib/types";
import { formatWeight, formatPcs, formatDateTime } from "@/lib/utils";

interface Props {
  sale: SaleRecord;
  farmName: string;
}

const C = {
  text: "#0F1B2D",
  muted: "#637381",
  border: "#D1D9E0",
  shade: "#F7F9FC",
  red: "#C0392B",
  redBg: "#FEF0EF",
  green: "#1E8449",
  greenBg: "#F0FFF4",
  amber: "#9A6400",
  amberBg: "#FFF8E6",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes().toString().padStart(2, "0");
  const ap = d.getHours() >= 12 ? "PM" : "AM";
  return `${h}:${m} ${ap}`;
}

function tk(n: number) {
  return `Tk ${n.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
}

function HR() {
  return <View style={{ height: 1, backgroundColor: C.border, marginVertical: 14 }} />;
}

function SectionLabel({ label }: { label: string }) {
  return (
    <Text
      style={{
        fontSize: 9,
        fontFamily: "Outfit_700Bold",
        color: C.muted,
        letterSpacing: 1.8,
        marginBottom: 8,
        paddingBottom: 5,
        borderBottomWidth: 1,
        borderBottomColor: C.border,
      }}
    >
      {label}
    </Text>
  );
}

function CalcRow({
  label,
  value,
  valColor,
  indent,
}: {
  label: string;
  value?: string;
  valColor?: string;
  indent?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        paddingVertical: 4,
        paddingLeft: indent ? 14 : 0,
        gap: 8,
      }}
    >
      <Text
        style={{
          flex: 1,
          fontSize: indent ? 12 : 14,
          fontFamily: "Outfit_400Regular",
          color: C.muted,
          lineHeight: 20,
        }}
        numberOfLines={2}
      >
        {label}
      </Text>
      {!!value && (
        <Text
          style={{
            fontSize: 14,
            fontFamily: "Outfit_600SemiBold",
            color: valColor ?? C.text,
            textAlign: "right",
          }}
        >
          {value}
        </Text>
      )}
    </View>
  );
}

function LogTable({
  rows,
  title,
  totalKg,
  totalPcs,
}: {
  rows: SaleRecord["rows"];
  title: string;
  totalKg: number;
  totalPcs: number;
}) {
  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 7,
        }}
      >
        <Text style={{ fontSize: 11, fontFamily: "Outfit_700Bold", color: C.text, letterSpacing: 0.4 }}>
          {title}
        </Text>
        <Text style={{ fontSize: 11, fontFamily: "Outfit_400Regular", color: C.muted }}>
          {formatWeight(totalKg)} KG · {totalPcs} birds
        </Text>
      </View>

      {/* Table head */}
      <View
        style={{
          flexDirection: "row",
          borderBottomWidth: 1.5,
          borderBottomColor: C.text,
          paddingBottom: 5,
          marginBottom: 2,
        }}
      >
        <Text style={[colNo, th]}>#</Text>
        <Text style={[colKg, th]}>Weight</Text>
        <Text style={[colPcs, th]}>Birds</Text>
        <Text style={[colTime, th]}>Time</Text>
      </View>

      {rows.map((row, idx) => (
        <View
          key={row.id}
          style={[
            { flexDirection: "row", paddingVertical: 4.5 },
            idx % 2 === 1 && { backgroundColor: C.shade },
          ]}
        >
          <Text style={[colNo, td]}>{rows.length - idx}</Text>
          <Text style={[colKg, td]}>{formatWeight(row.weightKg)}</Text>
          <Text style={[colPcs, td]}>{formatPcs(row.pcs, "Unknown")}</Text>
          <Text style={[colTime, td]}>{formatTime(row.timestamp)}</Text>
        </View>
      ))}

      {/* Totals row */}
      <View
        style={{
          flexDirection: "row",
          paddingVertical: 5,
          borderTopWidth: 1.5,
          borderTopColor: C.text,
          marginTop: 2,
        }}
      >
        <Text style={[colNo, { fontSize: 13, fontFamily: "Outfit_700Bold", color: C.text }]}>—</Text>
        <Text style={[colKg, { fontSize: 13, fontFamily: "Outfit_700Bold", color: C.text }]}>
          {formatWeight(totalKg)}
        </Text>
        <Text style={[colPcs, { fontSize: 13, fontFamily: "Outfit_700Bold", color: C.text }]}>
          {totalPcs}
        </Text>
        <Text style={[colTime, { fontSize: 12, fontFamily: "Outfit_600SemiBold", color: C.muted }]}>
          Total
        </Text>
      </View>
    </View>
  );
}

export function ReceiptView({ sale, farmName }: Props) {
  const m = sale.meta;
  const hasCull = (sale.cullRows?.length ?? 0) > 0;
  const cullRows = sale.cullRows ?? [];
  const cullTotalKg = cullRows.reduce((s, r) => s + r.weightKg, 0);
  const cullTotalPcs = cullRows.reduce((s, r) => s + (r.pcs ?? 0), 0);

  // Culled birds are a subset of the main weigh-in, so the stored
  // mainWeightKg is already net of cull — gross is the two added back.
  const grossKg = m
    ? m.mainWeightKg + m.cullWeightKg
    : sale.rows.reduce((s, r) => s + r.weightKg, 0);
  const totalBirds =
    m?.totalPcs ?? sale.rows.reduce((s, r) => s + (r.pcs ?? 0), 0);

  const mainAmount = m?.mainAmount ?? 0;
  const cullAmount = m?.cullAmount ?? 0;
  const cullSold = m?.isCullSold ?? false;
  const receivedAmount = m?.receivedAmount ?? 0;
  // The receipt is handed to the buyer, so it must not call a discount a debt.
  // The sale settles when it is recorded — no payment is taken after it.
  const discount = m ? Math.max(m.finalAmount - receivedAmount, 0) : 0;

  const shortId = sale.id.replace(/-/g, "").slice(0, 8).toUpperCase();

  return (
    <View style={{ backgroundColor: "#FFFFFF", paddingHorizontal: 20, paddingVertical: 26 }}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <View style={{ alignItems: "center", marginBottom: 16, gap: 4 }}>
        <Text
          style={{ fontSize: 22, fontFamily: "Outfit_700Bold", color: C.text, textAlign: "center" }}
          numberOfLines={2}
        >
          {farmName.trim() || "Poultry Farm"}
        </Text>
        <Text style={{ fontSize: 9, fontFamily: "Outfit_600SemiBold", color: C.muted, letterSpacing: 2.5 }}>
          SALE RECEIPT
        </Text>
        <Text style={{ fontSize: 12, fontFamily: "Outfit_400Regular", color: C.muted, marginTop: 2 }}>
          {formatDateTime(sale.createdAt)} · #{shortId}
        </Text>
        {!!m?.buyerName && (
          <Text style={{ fontSize: 15, fontFamily: "Outfit_600SemiBold", color: C.text, marginTop: 2 }}>
            Buyer: {m?.buyerName}
          </Text>
        )}
      </View>

      {/* ── Stats grid ──────────────────────────────────────────── */}
      <View
        style={{
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: 8,
          overflow: "hidden",
          marginBottom: 16,
        }}
      >
        <View style={{ flexDirection: "row" }}>
          <View style={{ flex: 1, padding: 12 }}>
            <Text style={{ fontSize: 17, fontFamily: "Outfit_700Bold", color: C.text }}>
              {formatWeight(grossKg)} KG
            </Text>
            <Text style={{ fontSize: 9, fontFamily: "Outfit_500Medium", color: C.muted, marginTop: 2, letterSpacing: 0.4 }}>
              GROSS WEIGHT
            </Text>
          </View>
          <View style={{ width: 1, backgroundColor: C.border }} />
          <View style={{ flex: 1, padding: 12 }}>
            <Text style={{ fontSize: 17, fontFamily: "Outfit_700Bold", color: C.text }}>
              {!sale.isPcsTracked ? "—" : totalBirds}
            </Text>
            <Text style={{ fontSize: 9, fontFamily: "Outfit_500Medium", color: C.muted, marginTop: 2, letterSpacing: 0.4 }}>
              TOTAL BIRDS
            </Text>
          </View>
        </View>
        {m && (
          <>
            <View style={{ height: 1, backgroundColor: C.border }} />
            <View style={{ flexDirection: "row" }}>
              <View style={{ flex: 1, padding: 12 }}>
                <Text style={{ fontSize: 17, fontFamily: "Outfit_700Bold", color: C.text }}>
                  {formatWeight(m.netWeightKg)} KG
                </Text>
                <Text style={{ fontSize: 9, fontFamily: "Outfit_500Medium", color: C.muted, marginTop: 2, letterSpacing: 0.4 }}>
                  NET WEIGHT
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: C.border }} />
              <View style={{ flex: 1, padding: 12 }}>
                <Text style={{ fontSize: 17, fontFamily: "Outfit_700Bold", color: C.text }}>
                  Tk {m.mainPrice.toFixed(2)}
                </Text>
                <Text style={{ fontSize: 9, fontFamily: "Outfit_500Medium", color: C.muted, marginTop: 2, letterSpacing: 0.4 }}>
                  PRICE / KG
                </Text>
              </View>
            </View>
          </>
        )}
      </View>

      {/* ── Calculation ─────────────────────────────────────────── */}
      {m && (() => {
        const base = m.mainWeightKg;
        const rawCrates = base / m.kgPerCrate;
        const crateNote = m.isFullCratesOnly
          ? `${formatWeight(base)} ÷ ${m.kgPerCrate} = ${rawCrates.toFixed(3)} → ${m.totalCrates} crates`
          : `${formatWeight(base)} ÷ ${m.kgPerCrate} = ${m.totalCrates.toFixed(3)} crates`;

        return (
          <>
            <SectionLabel label="Calculation Detail" />

            <CalcRow label="Gross weight" value={`${formatWeight(grossKg)} KG`} />

            {m.cullWeightKg > 0 ? (
              <>
                <CalcRow
                  label="Cull weight"
                  value={`−${formatWeight(m.cullWeightKg)} KG`}
                  valColor={C.red}
                />
                <CalcRow
                  label="Subtotal gross"
                  value={`${formatWeight(base)} KG`}
                />
              </>
            ) : (
              <CalcRow label="Cull weight" value="0 KG" />
            )}

            <CalcRow label={crateNote} indent />

            <CalcRow
              label={`${m.totalCrates} crates × ${m.deductionPerCrateG}g deduction`}
              value={`−${formatWeight(m.totalDeductionWtKg)} KG`}
              valColor={C.red}
            />

            {/* Net weight highlight */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: C.shade,
                borderRadius: 8,
                paddingVertical: 9,
                paddingHorizontal: 12,
                marginVertical: 4,
              }}
            >
              <Text style={{ fontSize: 15, fontFamily: "Outfit_700Bold", color: C.text }}>
                Net payable weight
              </Text>
              <Text style={{ fontSize: 16, fontFamily: "Outfit_700Bold", color: C.text }}>
                {formatWeight(m.netWeightKg)} KG
              </Text>
            </View>

            <CalcRow label={`× Tk ${m.mainPrice.toFixed(2)} / kg`} indent />
            <CalcRow label="Main amount" value={tk(mainAmount)} />

            {cullSold && cullAmount > 0 && (
              <CalcRow
                label={
                  m.cullSaleType === "weight"
                    ? `Cull: ${formatWeight(m.cullWeightKg)} kg × Tk ${m.cullPrice?.toFixed(2)}`
                    : `Cull: ${m.cullPcs} birds × Tk ${m.cullPrice?.toFixed(2)}`
                }
                value={`+ ${tk(cullAmount)}`}
                valColor={C.green}
              />
            )}

            {/* Total */}
            <View style={{ height: 2, backgroundColor: C.text, marginTop: 10 }} />
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingVertical: 8,
              }}
            >
              <Text style={{ fontSize: 16, fontFamily: "Outfit_700Bold", color: C.text, letterSpacing: 0.5 }}>
                TOTAL
              </Text>
              <Text style={{ fontSize: 22, fontFamily: "Outfit_700Bold", color: C.text }}>
                {tk(m.finalAmount)}
              </Text>
            </View>
            <View style={{ height: 2, backgroundColor: C.text, marginBottom: 8 }} />

            {receivedAmount != null && receivedAmount > 0 && (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingVertical: 4,
                }}
              >
                <Text style={{ fontSize: 14, fontFamily: "Outfit_400Regular", color: C.muted }}>
                  Amount received
                </Text>
                <Text style={{ fontSize: 14, fontFamily: "Outfit_600SemiBold", color: C.green }}>
                  − {tk(receivedAmount)}
                </Text>
              </View>
            )}

            {m && (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: discount > 0 ? C.amberBg : C.greenBg,
                  marginTop: 6,
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontFamily: "Outfit_700Bold",
                    color: discount > 0 ? C.amber : C.green,
                  }}
                >
                  {discount > 0 ? "DISCOUNT" : "FULLY PAID"}
                </Text>
                <Text
                  style={{
                    fontSize: 20,
                    fontFamily: "Outfit_700Bold",
                    color: discount > 0 ? C.amber : C.green,
                  }}
                >
                  {discount > 0 ? tk(discount) : tk(m.finalAmount)}
                </Text>
              </View>
            )}
          </>
        );
      })()}

      <HR />

      {/* ── Main session log ────────────────────────────────────── */}
      <SectionLabel label="Main Session Log" />
      <LogTable
        rows={sale.rows}
        title="MAIN SESSION"
        totalKg={grossKg}
        totalPcs={totalBirds}
      />

      {/* ── Cull session log ────────────────────────────────────── */}
      {hasCull && (
        <>
          <View style={{ height: 16 }} />
          <SectionLabel label="Cull Session Log" />
          <LogTable
            rows={cullRows}
            title="CULL SESSION"
            totalKg={cullTotalKg}
            totalPcs={cullTotalPcs}
          />
        </>
      )}

      {/* ── Footer ──────────────────────────────────────────────── */}
      <HR />
      <View style={{ alignItems: "center", gap: 3 }}>
        <Text style={{ fontSize: 11, fontFamily: "Outfit_400Regular", color: C.muted }}>
          Session ID: {shortId}
        </Text>
        <Text style={{ fontSize: 11, fontFamily: "Outfit_400Regular", color: C.muted }}>
          {formatDateTime(sale.createdAt)}
        </Text>
        <Text style={{ fontSize: 12, fontFamily: "Outfit_600SemiBold", color: C.text, marginTop: 3 }}>
          PoultryScale
        </Text>
      </View>
    </View>
  );
}

// Column widths for log table
const colNo: object = { width: 26 };
const colKg: object = { flex: 1, textAlign: "right" as const, paddingRight: 14 };
const colPcs: object = { width: 48, textAlign: "right" as const };
const colTime: object = { width: 66, textAlign: "right" as const };

const th: object = {
  fontSize: 11,
  fontFamily: "Outfit_700Bold",
  color: "#0F1B2D",
};

const td: object = {
  fontSize: 14,
  fontFamily: "Outfit_500Medium",
  color: "#0F1B2D",
};
