import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { THEME_COLORS, THEME_STATUS_COLORS, THEME_STATUS_BG_COLORS, THEME_STATUS_TEXT_COLORS } from '@/constants/theme';
import { CONDITION_LABELS, CONTEXT_LABELS } from '@/constants';
import { AGP_BAND_LABELS, AGP_BAND_STATUS, agpHeadline, type VisitSummary } from '@/utils/visitSummary';
import { formatDateTime, formatGlucose, formatGlucoseAmount, formatRange, mgToMmol } from '@/utils/helpers';
import type { ChartDataPoint, GlucoseUnit, PatientProfile } from '@/types';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// A hand-built static SVG line chart — expo-print renders HTML, not the RN
// component tree, so react-native-gifted-charts can't be embedded directly.
// Inline SVG is a real static image (non-interactive), matching the same
// visual language as the on-screen chart: primary-colored line + area fill,
// status-colored data points, dashed high/low reference lines.
function buildChartSvg(chartData: ChartDataPoint[], targetLow: number, targetHigh: number, unit: GlucoseUnit): string {
  if (chartData.length < 2) {
    return `<div class="empty-chart">Log at least 2 readings to see the chart</div>`;
  }

  const toDisplay = (mgDl: number) => (unit === 'mmol/L' ? mgToMmol(mgDl) : mgDl);
  const step = unit === 'mmol/L' ? 1 : 20;
  const headroom = unit === 'mmol/L' ? 2 : 40;
  const floor = unit === 'mmol/L' ? 11 : 200;

  const values = chartData.map((d) => toDisplay(d.value));
  const maxVal = Math.ceil(Math.max(...values, toDisplay(targetHigh) + headroom, floor) / step) * step;

  const W = 560, H = 200, padL = 34, padR = 10, padT = 10, padB = 22;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const xFor = (i: number) => padL + (chartData.length === 1 ? plotW / 2 : (i / (chartData.length - 1)) * plotW);
  const yFor = (v: number) => padT + plotH - (v / maxVal) * plotH;

  const points = chartData.map((d, i) => ({
    x: xFor(i), y: yFor(toDisplay(d.value)),
    color: THEME_STATUS_COLORS[d.status], label: d.label,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padT + plotH).toFixed(1)} `
    + `L ${points[0].x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;

  const refHighY = yFor(toDisplay(targetHigh));
  const refLowY = yFor(toDisplay(targetLow));

  const dots = points.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${p.color}" />`).join('');

  // Same label-thinning rule as the on-screen chart: show every label when
  // there are 7 or fewer points, otherwise every ceil(n/5)th plus first/last.
  const showEvery = chartData.length <= 7 ? 1 : Math.ceil(chartData.length / 5);
  const labels = points.map((p, i) => (
    (chartData.length <= 7 || i === 0 || i === chartData.length - 1 || i % showEvery === 0)
      ? `<text x="${p.x.toFixed(1)}" y="${H - 4}" font-size="9" fill="${THEME_COLORS.textTertiary}" text-anchor="middle">${escapeHtml(p.label)}</text>`
      : ''
  )).join('');

  return `
    <svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <line x1="${padL}" y1="${refHighY.toFixed(1)}" x2="${W - padR}" y2="${refHighY.toFixed(1)}" stroke="${THEME_COLORS.elevated}" stroke-width="1" stroke-dasharray="4,3" />
      <line x1="${padL}" y1="${refLowY.toFixed(1)}" x2="${W - padR}" y2="${refLowY.toFixed(1)}" stroke="${THEME_COLORS.normal}" stroke-width="1" stroke-dasharray="4,3" />
      <path d="${areaPath}" fill="${THEME_COLORS.primaryTint}" opacity="0.6" />
      <path d="${linePath}" fill="none" stroke="${THEME_COLORS.primary}" stroke-width="2" />
      ${dots}
      ${labels}
    </svg>
  `;
}

function buildAgpBar(summary: VisitSummary): string {
  const segments = summary.agpBands
    .filter((b) => b.pct > 0)
    .map((b) => {
      const color = THEME_STATUS_COLORS[AGP_BAND_STATUS[b.band]];
      const showLabel = b.pct >= 8;
      return `<div style="flex: ${b.pct} 0 0; background: ${color}; display: flex; align-items: center; justify-content: center;">`
        + (showLabel ? `<span style="color: ${THEME_COLORS.textInverse}; font-size: 11px; font-weight: 700;">${b.pct}%</span>` : '')
        + `</div>`;
    })
    .join('');

  const legend = summary.agpBands.map((b) => {
    const color = THEME_STATUS_COLORS[AGP_BAND_STATUS[b.band]];
    return `<div class="legend-item"><span class="legend-dot" style="background:${color}"></span>${AGP_BAND_LABELS[b.band]} ${b.pct}%</div>`;
  }).join('');

  return `<div class="agp-bar">${segments}</div><div class="legend-row">${legend}</div>`;
}

export function buildVisitSummaryHtml(
  patient: PatientProfile,
  summary: VisitSummary,
  unit: GlucoseUnit,
  windowLabel: string
): string {
  const { stats, hba1cEstimate, chartData, contextInsights, patternFlags, notableReadings, targetRanges, hypoCount } = summary;
  const toDisplay = (mgDl: number) => (unit === 'mmol/L' ? mgToMmol(mgDl) : mgDl);

  const tirColor = stats.timeInRange >= 70 ? THEME_COLORS.normal : stats.timeInRange >= 50 ? THEME_COLORS.elevated : THEME_COLORS.high;
  const hypoColor = hypoCount > 0 ? THEME_COLORS.high : THEME_COLORS.normal;

  const synthesisRows = patternFlags.map((f) => `
    <div class="synthesis-row">
      <span class="synthesis-icon" style="color:${f.severity === 'good' ? THEME_COLORS.normal : THEME_COLORS.primary}">${f.severity === 'good' ? '&#10003;' : '!'}</span>
      <span class="synthesis-text">${escapeHtml(f.render(unit))}</span>
    </div>
  `).join('');

  const notableRows = notableReadings.length > 0
    ? notableReadings.map((r) => `
      <div class="row">
        <span class="dot" style="background:${THEME_STATUS_COLORS[r.status]}"></span>
        <div class="row-left">
          <div class="row-value">${escapeHtml(formatGlucose(r.value, unit))}</div>
          <div class="row-meta">${escapeHtml(CONTEXT_LABELS[r.context])} &middot; ${escapeHtml(formatDateTime(r.recordedAt))}</div>
        </div>
        <div class="row-deviation" style="color:${THEME_STATUS_TEXT_COLORS[r.status]}">
          ${r.deviationMgDl < 0
            ? escapeHtml(formatGlucoseAmount(Math.abs(r.deviationMgDl), unit)) + ' below target'
            : '+' + escapeHtml(formatGlucoseAmount(r.deviationMgDl, unit)) + ' above target'}
        </div>
      </div>
    `).join('')
    : `<div class="all-good">All readings within target range this period.</div>`;

  const contextRows = contextInsights.map((c) => `
    <div class="row">
      <div class="row-left">
        <div class="ctx-label">${escapeHtml(CONTEXT_LABELS[c.context])}</div>
        <div class="row-meta">${c.count} reading${c.count !== 1 ? 's' : ''} &middot; ${c.inRangePct}% in range</div>
      </div>
      <div class="badge" style="background:${THEME_STATUS_BG_COLORS[c.status]}; color:${THEME_STATUS_TEXT_COLORS[c.status]}">${escapeHtml(formatGlucose(c.avg, unit))}</div>
    </div>
  `).join('');

  const targetRows = [
    { label: 'Fasting', low: targetRanges.fasting.low, high: targetRanges.fasting.high },
    { label: 'After meal', low: targetRanges.postMeal.low, high: targetRanges.postMeal.high },
    { label: 'Bedtime', low: targetRanges.bedtime.low, high: targetRanges.bedtime.high },
  ].map((r) => `
    <div class="row">
      <div class="range-label">${escapeHtml(r.label)}</div>
      <div class="range-value">${escapeHtml(formatRange(r.low, r.high, unit))}</div>
    </div>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { margin: 28px; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: ${THEME_COLORS.textPrimary}; background: ${THEME_COLORS.background}; margin: 0; padding: 24px; }
  .brand { font-size: 13px; font-weight: 700; letter-spacing: 0.5px; color: ${THEME_COLORS.primary}; text-transform: uppercase; margin-bottom: 4px; }
  .title { font-size: 22px; font-weight: 700; color: ${THEME_COLORS.textPrimary}; }
  .subtitle { font-size: 13px; color: ${THEME_COLORS.textSecondary}; margin-top: 2px; }
  .identity { margin: 16px 0 20px; }
  .identity-name { font-size: 17px; font-weight: 600; }
  .identity-meta { font-size: 13px; color: ${THEME_COLORS.textSecondary}; margin-top: 2px; }

  .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: ${THEME_COLORS.textPrimary}; margin: 20px 0 10px; }
  .card { background: ${THEME_COLORS.surface}; border: 1px solid ${THEME_COLORS.border}; border-radius: 12px; padding: 16px; }

  .metrics-grid { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
  .metric-card { flex: 1 1 45%; background: ${THEME_COLORS.surface}; border: 1px solid ${THEME_COLORS.border}; border-radius: 10px; padding: 14px; }
  .metric-label { font-size: 11px; color: ${THEME_COLORS.textSecondary}; }
  .metric-value { font-size: 26px; font-weight: 700; margin-top: 3px; font-variant-numeric: tabular-nums; }
  .metric-sub { font-size: 10px; color: ${THEME_COLORS.textTertiary}; margin-top: 2px; }

  .synthesis-card { background: ${THEME_COLORS.primaryTint}; border-radius: 10px; padding: 14px; margin-top: 14px; }
  .synthesis-row { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px; }
  .synthesis-row:last-child { margin-bottom: 0; }
  .synthesis-icon { font-weight: 700; width: 14px; font-size: 13px; }
  .synthesis-text { flex: 1; font-size: 12px; color: ${THEME_COLORS.primary}; line-height: 1.4; }

  .agp-headline { font-size: 14px; font-weight: 600; margin-bottom: 10px; }
  .agp-bar { display: flex; height: 20px; border-radius: 8px; overflow: hidden; background: ${THEME_COLORS.border}; }
  .legend-row { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 10px; }
  .legend-item { display: flex; align-items: center; gap: 5px; font-size: 10px; color: ${THEME_COLORS.textSecondary}; }
  .legend-dot { width: 7px; height: 7px; border-radius: 4px; display: inline-block; }

  .empty-chart { text-align: center; color: ${THEME_COLORS.textTertiary}; font-size: 13px; padding: 30px 0; }

  .row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid ${THEME_COLORS.border}; }
  .row:last-child { border-bottom: none; }
  .row-left { flex: 1; }
  .row-value { font-size: 14px; font-weight: 600; }
  .row-meta { font-size: 10px; color: ${THEME_COLORS.textSecondary}; margin-top: 1px; }
  .row-deviation { font-size: 12px; font-weight: 600; }
  .dot { width: 7px; height: 7px; border-radius: 4px; flex-shrink: 0; display: inline-block; }
  .all-good { text-align: center; color: ${THEME_COLORS.textSecondary}; font-size: 13px; padding: 6px 0; }

  .ctx-label { font-size: 13px; font-weight: 500; }
  .badge { padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }

  .range-label { font-size: 13px; }
  .range-value { font-size: 13px; font-weight: 600; color: ${THEME_COLORS.primary}; }

  .disclaimer { text-align: center; font-size: 10px; color: ${THEME_COLORS.textTertiary}; line-height: 1.4; margin-top: 20px; padding: 0 4px; }
</style>
</head>
<body>
  <div class="brand">GlucoLens</div>
  <div class="title">Visit Summary</div>
  <div class="subtitle">${escapeHtml(windowLabel)}</div>

  <div class="identity">
    <div class="identity-name">${escapeHtml(patient.name)}</div>
    <div class="identity-meta">${patient.age} yrs &middot; ${escapeHtml(patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1))} &middot; ${escapeHtml(CONDITION_LABELS[patient.condition])}</div>
  </div>

  <div class="metrics-grid">
    <div class="metric-card">
      <div class="metric-label">Est. HbA1c</div>
      <div class="metric-value" style="color:${THEME_COLORS.textPrimary}">${hba1cEstimate ? `${hba1cEstimate}%` : '&mdash;'}</div>
      <div class="metric-sub">estimated</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Time in range</div>
      <div class="metric-value" style="color:${tirColor}">${stats.timeInRange}%</div>
      <div class="metric-sub">target &ge;70%</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Average</div>
      <div class="metric-value" style="color:${THEME_COLORS.textPrimary}">${toDisplay(stats.average)}</div>
      <div class="metric-sub">${unit}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Hypo events</div>
      <div class="metric-value" style="color:${hypoColor}">${hypoCount}</div>
      <div class="metric-sub">${hypoCount > 0 ? 'below range' : 'none recorded'}</div>
    </div>
  </div>

  <div class="synthesis-card">${synthesisRows}</div>

  <div class="section-title">Time in Range</div>
  <div class="card">
    <div class="agp-headline">${escapeHtml(agpHeadline(summary.agpBands))}</div>
    ${buildAgpBar(summary)}
  </div>

  <div class="section-title">Glucose over time</div>
  <div class="card">${buildChartSvg(chartData, targetRanges.fasting.low, targetRanges.fasting.high, unit)}</div>

  <div class="section-title">Notable readings</div>
  <div class="card">${notableRows}</div>

  ${contextInsights.length > 0 ? `
  <div class="section-title">Breakdown by context</div>
  <div class="card">${contextRows}</div>
  ` : ''}

  <div class="section-title">Target ranges</div>
  <div class="card">${targetRows}</div>

  <div class="disclaimer">
    Self-reported fingerstick readings, not continuous glucose monitoring. Ranges per ADA Standards of Medical Care 2024. Values shown in ${unit}.
  </div>
</body>
</html>
  `;
}

export async function exportVisitSummaryPdf(
  patient: PatientProfile,
  summary: VisitSummary,
  unit: GlucoseUnit,
  windowLabel: string
): Promise<void> {
  const html = buildVisitSummaryHtml(patient, summary, unit, windowLabel);
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Share Visit Summary',
    UTI: 'com.adobe.pdf',
  });
}
