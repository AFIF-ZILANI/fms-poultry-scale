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
  const { deduction } = sale;
  const hasCull = (sale.cullRows?.length ?? 0) > 0;
  const cullRows = sale.cullRows ?? [];
  const cullTotalKg = cullRows.reduce((s, r) => s + r.weightKg, 0);
  const cullTotalPcs = cullRows.reduce((s, r) => s + (r.pcs ?? 0), 0);

  const mainAmount =
    deduction?.main_amount ?? (deduction ? deduction.net_weight * deduction.price_per_kg : 0);
  const cullAmount = deduction?.cull_amount ?? 0;
  const cullSold = deduction?.cull_sold ?? false;
  const balanceDue =
    sale.receivedAmount != null && deduction
      ? deduction.final_amount - sale.receivedAmount
      : null;

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
        {!!sale.buyerName && (
          <Text style={{ fontSize: 15, fontFamily: "Outfit_600SemiBold", color: C.text, marginTop: 2 }}>
            Buyer: {sale.buyerName}
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
              {formatWeight(sale.totalWeightKg)} KG
            </Text>
            <Text style={{ fontSize: 9, fontFamily: "Outfit_500Medium", color: C.muted, marginTop: 2, letterSpacing: 0.4 }}>
              GROSS WEIGHT
            </Text>
          </View>
          <View style={{ width: 1, backgroundColor: C.border }} />
          <View style={{ flex: 1, padding: 12 }}>
            <Text style={{ fontSize: 17, fontFamily: "Outfit_700Bold", color: C.text }}>
              {sale.pcsTracked === false ? "—" : sale.totalPcs}
            </Text>
            <Text style={{ fontSize: 9, fontFamily: "Outfit_500Medium", color: C.muted, marginTop: 2, letterSpacing: 0.4 }}>
              TOTAL BIRDS
            </Text>
          </View>
        </View>
        {deduction && (
          <>
            <View style={{ height: 1, backgroundColor: C.border }} />
            <View style={{ flexDirection: "row" }}>
              <View style={{ flex: 1, padding: 12 }}>
                <Text style={{ fontSize: 17, fontFamily: "Outfit_700Bold", color: C.text }}>
                  {formatWeight(deduction.net_weight)} KG
                </Text>
                <Text style={{ fontSize: 9, fontFamily: "Outfit_500Medium", color: C.muted, marginTop: 2, letterSpacing: 0.4 }}>
                  NET WEIGHT
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: C.border }} />
              <View style={{ flex: 1, padding: 12 }}>
                <Text style={{ fontSize: 17, fontFamily: "Outfit_700Bold", color: C.text }}>
                  Tk {deduction.price_per_kg.toFixed(2)}
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
      {deduction && (() => {
        const base = deduction.gross_weight - deduction.cull_weight_kg;
        const rawCrates = base / deduction.kg_per_crate;
        const crateNote = deduction.full_crates_only
          ? `${formatWeight(base)} ÷ ${deduction.kg_per_crate} = ${rawCrates.toFixed(3)} → ${deduction.total_crates} crates`
          : `${formatWeight(base)} ÷ ${deduction.kg_per_crate} = ${deduction.total_crates.toFixed(3)} crates`;

        return (
          <>
            <SectionLabel label="Calculation Detail" />

            <CalcRow label="Gross weight" value={`${formatWeight(deduction.gross_weight)} KG`} />

            {deduction.cull_weight_kg > 0 ? (
              <>
                <CalcRow
                  label="Cull weight"
                  value={`−${formatWeight(deduction.cull_weight_kg)} KG`}
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
              label={`${deduction.total_crates} crates × ${deduction.deduction_per_crate_g}g deduction`}
              value={`−${formatWeight(deduction.total_deduction_kg)} KG`}
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
                {formatWeight(deduction.net_weight)} KG
              </Text>
            </View>

            <CalcRow label={`× Tk ${deduction.price_per_kg.toFixed(2)} / kg`} indent />
            <CalcRow label="Main amount" value={tk(mainAmount)} />

            {cullSold && cullAmount > 0 && (
              <CalcRow
                label={
                  deduction.cull_pricing_mode === "per_kg"
                    ? `Cull: ${formatWeight(deduction.cull_weight_kg)} kg × Tk ${deduction.cull_price?.toFixed(2)}`
                    : `Cull: ${deduction.cull_pcs} birds × Tk ${deduction.cull_price?.toFixed(2)}`
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
                {tk(deduction.final_amount)}
              </Text>
            </View>
            <View style={{ height: 2, backgroundColor: C.text, marginBottom: 8 }} />

            {sale.receivedAmount != null && sale.receivedAmount > 0 && (
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
                  − {tk(sale.receivedAmount)}
                </Text>
              </View>
            )}

            {balanceDue !== null && (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: balanceDue > 0 ? C.redBg : C.greenBg,
                  marginTop: 6,
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontFamily: "Outfit_700Bold",
                    color: balanceDue > 0 ? C.red : C.green,
                  }}
                >
                  {balanceDue > 0 ? "BALANCE DUE" : "FULLY PAID"}
                </Text>
                <Text
                  style={{
                    fontSize: 20,
                    fontFamily: "Outfit_700Bold",
                    color: balanceDue > 0 ? C.red : C.green,
                  }}
                >
                  {tk(Math.abs(balanceDue))}
                  {balanceDue < 0 ? " ✓" : ""}
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
        totalKg={sale.totalWeightKg}
        totalPcs={sale.totalPcs}
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
