import type { SaleRecord, MeasurementRow } from "./types";

function fmt(kg: number) {
  return kg.toFixed(2);
}

function tk(n: number) {
  return `Tk ${n.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
}

function fmtTime(ts: number) {
  const d = new Date(ts);
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes().toString().padStart(2, "0");
  const ap = d.getHours() >= 12 ? "PM" : "AM";
  return `${h}:${m} ${ap}`;
}

function fmtDate(ts: number) {
  const d = new Date(ts);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function logTable(rows: MeasurementRow[]): string {
  const totalKg = rows.reduce((s, r) => s + r.weightKg, 0);
  const totalPcs = rows.reduce((s, r) => s + (r.pcs ?? 0), 0);
  const bodyRows = rows
    .map(
      (row, idx) => `
      <tr class="${idx % 2 === 1 ? "shaded" : ""}">
        <td>${rows.length - idx}</td>
        <td class="right">${fmt(row.weightKg)}</td>
        <td class="right">${row.pcs ?? "Unknown"}</td>
        <td class="right">${fmtTime(row.timestamp)}</td>
      </tr>`
    )
    .join("");

  return `
    <table class="log-table">
      <thead>
        <tr>
          <th>#</th>
          <th class="right">Weight (KG)</th>
          <th class="right">Birds</th>
          <th class="right">Time</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
      <tfoot>
        <tr>
          <td><strong>Total</strong></td>
          <td class="right"><strong>${fmt(totalKg)}</strong></td>
          <td class="right"><strong>${totalPcs}</strong></td>
          <td></td>
        </tr>
      </tfoot>
    </table>`;
}

export function generateReceiptHtml(
  sale: SaleRecord,
  farmName: string
): string {
  const { deduction } = sale;
  const shortId = sale.id.replace(/-/g, "").slice(0, 8).toUpperCase();
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

  const displayName = farmName.trim() || "Poultry Farm";

  // ── Page mini-header (used on pages 2+) ──────────────────────────────
  const miniHeader = `
    <div class="mini-header">
      <span class="mini-name">${displayName}</span>
      <span class="mini-id">Receipt #${shortId}</span>
    </div>`;

  // ── Page 1 ───────────────────────────────────────────────────────────
  const statsGrid = deduction
    ? `<div class="stats-grid">
        <div class="stat-cell"><div class="stat-val">${fmt(sale.totalWeightKg)} KG</div><div class="stat-key">Gross Weight</div></div>
        <div class="stat-cell stat-divider"><div class="stat-val">${sale.totalPcs}</div><div class="stat-key">Total Birds</div></div>
        <div class="stat-cell stat-top"><div class="stat-val">${fmt(deduction.net_weight)} KG</div><div class="stat-key">Net Weight</div></div>
        <div class="stat-cell stat-top stat-divider"><div class="stat-val">Tk ${deduction.price_per_kg.toFixed(2)}</div><div class="stat-key">Price / KG</div></div>
      </div>`
    : `<div class="stats-grid stats-grid-2">
        <div class="stat-cell"><div class="stat-val">${fmt(sale.totalWeightKg)} KG</div><div class="stat-key">Gross Weight</div></div>
        <div class="stat-cell stat-divider"><div class="stat-val">${sale.totalPcs}</div><div class="stat-key">Total Birds</div></div>
      </div>`;

  let calcHtml = "";
  if (deduction) {
    const base = deduction.gross_weight - deduction.cull_weight_kg;
    const rawCrates = base / deduction.kg_per_crate;
    const crateNote = deduction.full_crates_only
      ? `${fmt(base)} ÷ ${deduction.kg_per_crate} = ${rawCrates.toFixed(3)} → ${deduction.total_crates} crates`
      : `${fmt(base)} ÷ ${deduction.kg_per_crate} = ${deduction.total_crates.toFixed(3)} crates`;

    calcHtml = `
      <div class="section-label">Calculation Detail</div>
      <table class="calc-table">
        <tr><td>Gross weight</td><td class="cv">${fmt(deduction.gross_weight)} KG</td></tr>
        ${deduction.cull_weight_kg > 0 ? `
          <tr><td>Cull weight</td><td class="cv neg">−${fmt(deduction.cull_weight_kg)} KG</td></tr>
          <tr><td>Subtotal gross</td><td class="cv">${fmt(base)} KG</td></tr>
        ` : `<tr><td>Cull weight</td><td class="cv">0 KG</td></tr>`}
        <tr class="indent"><td>${crateNote}</td><td></td></tr>
        <tr>
          <td>${deduction.total_crates} crates × ${deduction.deduction_per_crate_g}g deduction</td>
          <td class="cv neg">−${fmt(deduction.total_deduction_kg)} KG</td>
        </tr>
        <tr class="net-row"><td>Net payable weight</td><td class="cv">${fmt(deduction.net_weight)} KG</td></tr>
        <tr class="indent"><td>× Tk ${deduction.price_per_kg.toFixed(2)} / kg</td><td></td></tr>
        <tr><td>Main amount</td><td class="cv">${tk(mainAmount)}</td></tr>
        ${cullSold && cullAmount > 0 ? `
          <tr>
            <td>${deduction.cull_pricing_mode === "per_kg"
              ? `Cull: ${fmt(deduction.cull_weight_kg)} kg × Tk ${deduction.cull_price?.toFixed(2)}`
              : `Cull: ${deduction.cull_pcs} birds × Tk ${deduction.cull_price?.toFixed(2)}`}</td>
            <td class="cv pos">+ ${tk(cullAmount)}</td>
          </tr>` : ""}
      </table>
      <div class="total-wrap">
        <div class="total-bar">
          <span class="total-lbl">TOTAL</span>
          <span class="total-amt">${tk(deduction.final_amount)}</span>
        </div>
        ${sale.receivedAmount != null && sale.receivedAmount > 0 ? `
          <div class="payment-row">
            <span>Amount received</span>
            <span class="pos">− ${tk(sale.receivedAmount)}</span>
          </div>` : ""}
        ${balanceDue !== null ? `
          <div class="balance-bar ${balanceDue > 0 ? "balance-due" : "balance-paid"}">
            <span>${balanceDue > 0 ? "BALANCE DUE" : "FULLY PAID"}</span>
            <span>${tk(Math.abs(balanceDue))}${balanceDue < 0 ? " (overpaid)" : ""}</span>
          </div>` : ""}
      </div>`;
  }

  // ── CSS ──────────────────────────────────────────────────────────────
  const css = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
      color: #0F1B2D;
      font-size: 11px;
      line-height: 1.55;
      background: #fff;
    }
    .page { padding: 28px 36px; }
    .page-break { page-break-before: always; }

    /* Receipts header */
    .header {
      text-align: center;
      padding-bottom: 14px;
      border-bottom: 2px solid #0F1B2D;
      margin-bottom: 14px;
    }
    .farm-name { font-size: 21px; font-weight: 800; letter-spacing: -0.3px; }
    .receipt-lbl {
      font-size: 9px; font-weight: 700; letter-spacing: 3px;
      color: #637381; margin-top: 3px; text-transform: uppercase;
    }
    .header-meta {
      display: flex; justify-content: center; gap: 18px;
      margin-top: 6px; color: #637381; font-size: 10px; flex-wrap: wrap;
    }
    .header-buyer {
      margin-top: 5px; font-size: 12px; font-weight: 700; color: #0F1B2D;
    }

    /* Stats grid */
    .stats-grid {
      display: grid; grid-template-columns: 1fr 1fr;
      border: 1px solid #D1D9E0; border-radius: 5px;
      overflow: hidden; margin-bottom: 14px;
    }
    .stats-grid-2 { grid-template-columns: 1fr 1fr; }
    .stat-cell { padding: 9px 12px; }
    .stat-divider { border-left: 1px solid #D1D9E0; }
    .stat-top { border-top: 1px solid #D1D9E0; }
    .stat-val { font-size: 14px; font-weight: 700; }
    .stat-key { font-size: 9px; color: #637381; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.4px; }

    /* Section label */
    .section-label {
      font-size: 9px; font-weight: 700; letter-spacing: 1.5px;
      color: #637381; text-transform: uppercase;
      padding-bottom: 5px; border-bottom: 1px solid #D1D9E0;
      margin-bottom: 8px;
    }

    /* Calc table */
    .calc-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    .calc-table td { padding: 3.5px 0; vertical-align: middle; }
    .calc-table td:first-child { color: #637381; }
    .calc-table td.cv { text-align: right; font-weight: 600; white-space: nowrap; padding-left: 12px; }
    .calc-table tr.indent td { padding-left: 14px; font-size: 10px; color: #637381; }
    .calc-table tr.net-row td { font-weight: 700; color: #0F1B2D !important; font-size: 12px; }
    .calc-table td.neg { color: #C0392B; }
    .calc-table td.pos { color: #1E8449; }

    /* Total area */
    .total-wrap { margin-top: 4px; }
    .total-bar {
      display: flex; justify-content: space-between; align-items: center;
      padding: 7px 0;
      border-top: 2px solid #0F1B2D;
      border-bottom: 2px solid #0F1B2D;
      margin-bottom: 6px;
    }
    .total-lbl { font-size: 14px; font-weight: 800; letter-spacing: 0.5px; }
    .total-amt { font-size: 18px; font-weight: 800; }
    .payment-row {
      display: flex; justify-content: space-between;
      padding: 3px 0; color: #637381;
    }
    .payment-row .pos { color: #1E8449; font-weight: 600; }
    .balance-bar {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 12px; border-radius: 4px;
      margin-top: 5px; font-weight: 700; font-size: 12px;
    }
    .balance-due { background: #FEF0EF; color: #C0392B; }
    .balance-paid { background: #F0FFF4; color: #1E8449; }

    /* Mini header (pages 2+) */
    .mini-header {
      display: flex; justify-content: space-between; align-items: center;
      padding-bottom: 8px; border-bottom: 2px solid #0F1B2D;
      margin-bottom: 12px;
    }
    .mini-name { font-size: 13px; font-weight: 800; }
    .mini-id { font-size: 10px; color: #637381; }

    /* Session title */
    .session-title {
      font-size: 11px; font-weight: 700; margin-bottom: 8px; letter-spacing: 0.3px;
    }
    .session-sub { font-size: 10px; color: #637381; font-weight: 400; margin-left: 6px; }

    /* Log table */
    .log-table { width: 100%; border-collapse: collapse; }
    .log-table thead tr { background: #0F1B2D; }
    .log-table th {
      color: #fff; padding: 6px 8px; font-size: 10px;
      font-weight: 700; letter-spacing: 0.4px;
    }
    .log-table th.right { text-align: right; }
    .log-table td { padding: 4.5px 8px; font-size: 11px; border-bottom: 1px solid #EDF2F7; }
    .log-table td.right { text-align: right; }
    .log-table tr.shaded td { background: #F7F9FC; }
    .log-table tfoot td {
      font-weight: 700; border-top: 2px solid #0F1B2D;
      border-bottom: none; padding-top: 6px; background: #fff;
    }

    /* Page footer */
    .page-footer {
      margin-top: 20px; padding-top: 10px;
      border-top: 1px solid #D1D9E0;
      display: flex; justify-content: space-between;
      color: #637381; font-size: 10px;
    }
    .footer-brand { font-weight: 700; color: #0F1B2D; }
  `;

  // ── Assemble pages ───────────────────────────────────────────────────
  const page1 = `
    <div class="page">
      <div class="header">
        <div class="farm-name">${displayName}</div>
        <div class="receipt-lbl">Sale Receipt</div>
        <div class="header-meta">
          <span>${fmtDate(sale.createdAt)}</span>
          <span>Receipt #${shortId}</span>
        </div>
        ${sale.buyerName ? `<div class="header-buyer">Buyer: ${sale.buyerName}</div>` : ""}
      </div>
      ${statsGrid}
      ${calcHtml}
      <div class="page-footer">
        <span>Session: ${shortId}</span>
        <span>${fmtDate(sale.createdAt)}</span>
        <span class="footer-brand">PoultryScale</span>
      </div>
    </div>`;

  const page2 = `
    <div class="page page-break">
      ${miniHeader}
      <div class="session-title">
        MAIN SESSION
        <span class="session-sub">${fmt(sale.totalWeightKg)} KG · ${sale.totalPcs} Birds</span>
      </div>
      ${logTable(sale.rows)}
      <div class="page-footer">
        <span>Session: ${shortId}</span>
        <span class="footer-brand">PoultryScale</span>
      </div>
    </div>`;

  const page3 =
    hasCull && cullRows.length > 0
      ? `<div class="page page-break">
          ${miniHeader}
          <div class="session-title">
            CULL SESSION
            <span class="session-sub">${fmt(cullTotalKg)} KG · ${cullTotalPcs} Birds</span>
          </div>
          ${logTable(cullRows)}
          <div class="page-footer">
            <span>Session: ${shortId}</span>
            <span class="footer-brand">PoultryScale</span>
          </div>
        </div>`
      : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>${css}</style>
</head>
<body>
${page1}
${page2}
${page3}
</body>
</html>`;
}
