function formatKg(value) {
  return `${Math.round(value || 0).toLocaleString()} kgCO2/년`;
}

function formatKwh(value) {
  return `${Math.round(value || 0).toLocaleString()} kWh/년`;
}

function formatKrw(value) {
  return `${Math.round(value || 0).toLocaleString()}원`;
}

const REPORT_MODE = import.meta.env.VITE_REPORT_MODE || 'local';
const REPORT_API_PATH = import.meta.env.VITE_REPORT_API_PATH || '/api/report';
const REPORT_FORMAT_VERSION = 'inha-carbon-report.v1';

function safeDateStamp(dateValue = new Date()) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function sanitizeFileName(value) {
  return String(value || 'scenario')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'scenario';
}

function normalizeListItems(value, fallback = []) {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .filter((it) => typeof it === 'string' && it.trim())
    .map((it) => it.trim())
    .slice(0, 5);
  return items.length ? items : fallback;
}

function markdownList(items, ordered = false) {
  if (!items.length) return '- 해당 없음';
  return items.map((item, index) => `${ordered ? `${index + 1}.` : '-'} ${item}`).join('\n');
}

function sanitizeMarkdownCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatPlacementLocation(item = {}) {
  return item.locationName || item.zoneName || '일반 구역';
}

function formatCoordinates(item = {}) {
  const lng = Number(item.lng);
  const lat = Number(item.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return '';
  return `${lng.toFixed(5)}, ${lat.toFixed(5)}`;
}

function formatPlacementReason(item = {}) {
  const reason = compactSignalText(item.placementReason || item.zoneReason || item.zoneNote || '');
  const rate = Number(item.efficiencyRate || 0);
  const rateText = rate && rate !== 100 ? `효율 ${rate}%` : '';
  return [reason, rateText].filter(Boolean).join(' · ') || '기본 설치 조건';
}

function countBy(items = [], keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function aggregatePlacementRows(items = []) {
  const groups = new Map();
  for (const item of items) {
    const location = formatPlacementLocation(item);
    const label = item.label || item.type || '설비';
    const key = `${location}::${label}`;
    const current = groups.get(key) || {
      location,
      label,
      qty: 0,
      unit: item.unit || '개',
      saving: 0,
      energy: 0,
      cost: 0,
      reasons: new Set(),
      coordinates: new Set(),
    };
    current.qty += Number(item.qty || 1);
    current.saving += Number(item.savingKgCO2PerYear || 0);
    current.energy += Number(item.energyKwhPerYear || 0);
    current.cost += Number(item.costKrw || 0);
    current.reasons.add(formatPlacementReason(item));
    const coord = formatCoordinates(item);
    if (coord) current.coordinates.add(coord);
    groups.set(key, current);
  }
  return [...groups.values()].sort((a, b) => b.saving - a.saving);
}

function metricTable(metrics = {}) {
  const user = metrics.user || {};
  const baseline = metrics.baseline || {};
  const total = metrics.total || {};
  return [
    '| 항목 | 값 |',
    '|---|---:|',
    `| 신규 배치 절감량 | ${formatKg(user.netSaving)} |`,
    `| 신규 에너지 효과 | ${formatKwh(user.energyKwh)} |`,
    `| 사용 예산 | ${formatKrw(user.totalCost)} |`,
    `| 잔여 예산 | ${formatKrw(metrics.remainingBudget)} |`,
    `| 효율 점수 | ${user.efficiencyScore || 0} kgCO2/백만원 |`,
    `| 기존 설비 베이스라인 | ${formatKg(baseline.netSaving)} |`,
    `| 총 절감량 | ${formatKg(total.netSaving)} |`,
  ].join('\n');
}

function placementOverview(items = [], metrics = {}) {
  if (!items.length) return '- 신규 배치 설비가 없습니다.';
  const user = metrics.user || {};
  const labels = uniqueLabels(items);
  const locations = countBy(items, formatPlacementLocation).slice(0, 3).map(([name]) => name);
  const topSaving = topItemBy(items, 'savingKgCO2PerYear');
  const topEfficiency = [...items].sort((a, b) => itemEfficiency(b) - itemEfficiency(a))[0];
  const locationText = locations.length ? locations.join(', ') : '일반 구역';
  const lines = [
    `- 신규 배치 ${items.length}개, 설비 유형 ${labels.length}종으로 구성했습니다.`,
    `- 주요 배치 위치는 ${locationText}입니다.`,
    `- 신규 배치 총 절감량은 ${formatKg(user.netSaving)}, 에너지 효과는 ${formatKwh(user.energyKwh)}입니다.`,
  ];
  if (topSaving) {
    lines.push(`- 최대 절감 기여 배치는 ${formatPlacementLocation(topSaving)}의 ${topSaving.label}입니다.`);
  }
  if (topEfficiency && itemEfficiency(topEfficiency) > 0) {
    lines.push(`- 비용 대비 효율이 가장 높은 배치는 ${formatPlacementLocation(topEfficiency)}의 ${topEfficiency.label}입니다.`);
  }
  return lines.join('\n');
}

function placementTable(items = []) {
  const rows = aggregatePlacementRows(items);
  if (!rows.length) return '신규 배치 설비가 없습니다.';
  const visibleRows = rows.slice(0, 8);
  const table = [
    '| 위치/구역 | 설비 | 수량 | 절감량 | 에너지 | 비용 | 위치 판단 |',
    '|---|---|---:|---:|---:|---:|---|',
    ...visibleRows.map((row) => {
      const reason = [...row.reasons][0] || '기본 설치 조건';
      return [
        sanitizeMarkdownCell(row.location),
        sanitizeMarkdownCell(row.label),
        sanitizeMarkdownCell(`${row.qty.toLocaleString()} ${row.unit}`),
        sanitizeMarkdownCell(formatKg(row.saving)),
        sanitizeMarkdownCell(formatKwh(row.energy)),
        sanitizeMarkdownCell(formatKrw(row.cost)),
        sanitizeMarkdownCell(reason),
      ].join(' | ');
    }).map((row) => `| ${row} |`),
  ];
  if (rows.length > visibleRows.length) {
    table.push(`| 외 ${rows.length - visibleRows.length}개 묶음 | - | - | - | - | - | 상세 데이터는 앱 저장 시나리오에서 확인 |`);
  }
  return [
    ...table,
  ].join('\n');
}

function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function uniqueLabels(items = []) {
  return [...new Set(items.map((item) => item.label || item.type).filter(Boolean))];
}

function topItemBy(items = [], field) {
  return [...items].sort((a, b) => Number(b[field] || 0) - Number(a[field] || 0))[0];
}

function itemEfficiency(item) {
  const costMillion = Number(item.costKrw || 0) / 1000000;
  if (!costMillion) return 0;
  return Number(item.savingKgCO2PerYear || 0) / costMillion;
}

function compactSignalText(text) {
  return String(text || '')
    .replace(/[✅⚠️📉🌳☀️🔌💡📊🌿💧🏗️🌡️]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildLocalInsights({ nickname, reportItems = [], metrics = {}, analysisSignals = {} }) {
  const user = metrics.user || {};
  const baseline = metrics.baseline || {};
  const total = metrics.total || {};
  const budget = Number(metrics.budget || 0);
  const usedBudget = Number(user.totalCost || metrics.usedBudget || 0);
  const budgetRate = percent(usedBudget, budget);
  const labels = uniqueLabels(reportItems);
  const topSaving = topItemBy(reportItems, 'savingKgCO2PerYear');
  const topCost = topItemBy(reportItems, 'costKrw');
  const topEfficiency = [...reportItems].sort((a, b) => itemEfficiency(b) - itemEfficiency(a))[0];
  const signalWarnings = (analysisSignals.warnings || []).map(compactSignalText).filter(Boolean).slice(0, 2);
  const signalDetails = (analysisSignals.details || []).map(compactSignalText).filter(Boolean).slice(0, 2);
  const hasSolar = reportItems.some((item) => item.type?.startsWith('solar'));
  const hasTreeOrGreen = reportItems.some((item) => item.type === 'tree' || item.type === 'greenroof');
  const hasControl = reportItems.some((item) => item.type === 'bems' || item.type === 'led');
  const displayName = nickname?.trim() || '사용자';
  const locationCounts = countBy(reportItems, formatPlacementLocation);
  const mainLocations = locationCounts.slice(0, 3).map(([name]) => name);

  const strengths = [];
  if (topSaving) {
    strengths.push(`${formatPlacementLocation(topSaving)}의 ${topSaving.label}이 신규 절감량 중 약 ${percent(topSaving.savingKgCO2PerYear, user.netSaving)}%를 담당합니다.`);
  }
  if (labels.length >= 3) {
    strengths.push(`${labels.slice(0, 3).join(', ')} 등 ${labels.length}종 설비를 조합해 단일 설비 의존도를 낮췄습니다.`);
  } else if (labels.length > 0) {
    strengths.push(`${labels.join(', ')} 중심의 단순한 구성이라 예산과 효과를 비교하기 쉽습니다.`);
  }
  if (mainLocations.length >= 2) {
    strengths.push(`${mainLocations.join(', ')} 등 여러 구역에 분산 배치해 한 위치에 성과가 몰리는 문제를 줄였습니다.`);
  }
  if (hasControl) {
    strengths.push('LED/BEMS 계열 설비가 포함되어 운영 효율 개선 효과를 기대할 수 있습니다.');
  }
  if (!strengths.length) {
    strengths.push('아직 신규 배치가 없어 예산을 자유롭게 재설계할 수 있습니다.');
  }

  const warnings = [];
  if (!reportItems.length) {
    warnings.push('신규 배치 설비가 없어 리더보드 제출과 성과 비교가 제한됩니다.');
  }
  if (budgetRate > 0 && budgetRate < 10) {
    warnings.push(`현재 예산 사용률은 약 ${budgetRate}%로 낮아, 남은 예산을 활용한 추가 절감 여지가 큽니다.`);
  }
  if (budgetRate > 85) {
    warnings.push(`현재 예산 사용률은 약 ${budgetRate}%로 높아, 추가 배치 전 비용 효율을 우선 확인해야 합니다.`);
  }
  if (topCost && topSaving && topCost.type !== topSaving.type) {
    warnings.push(`가장 비용이 큰 배치는 ${formatPlacementLocation(topCost)}의 ${topCost.label}이지만, 최대 절감 기여 배치는 ${formatPlacementLocation(topSaving)}의 ${topSaving.label}입니다.`);
  }
  if (baseline.netSaving > user.netSaving) {
    warnings.push('기존 설비 베이스라인이 신규 배치 성과보다 커서, 총 절감량만 보면 사용자 신규 성과가 과대해 보일 수 있습니다.');
  }
  warnings.push(...signalWarnings);
  if (!warnings.length) {
    warnings.push('현재 계산상 큰 경고는 없지만, 실제 설치 전 현장 조건 검토가 필요합니다.');
  }

  const recommendations = [];
  if (topEfficiency && itemEfficiency(topEfficiency) > 0) {
    recommendations.push(`${formatPlacementLocation(topEfficiency)}의 ${topEfficiency.label}처럼 비용 대비 절감 효율이 높은 배치를 우선 확대하세요.`);
  }
  if (hasSolar && hasTreeOrGreen) {
    recommendations.push('태양광 주변에는 수목과 그린루프 배치를 분리해 그림자와 옥상 면적 간섭을 줄이세요.');
  }
  if (budgetRate < 50) {
    recommendations.push('남은 예산 일부를 LED/BEMS 같은 운영 효율 개선 설비에 배분해 안정적인 절감 효과를 확보하세요.');
  }
  if (signalDetails.length) {
    recommendations.push(`상세 분석의 "${signalDetails[0]}" 항목을 우선 검토해 배치 품질을 높이세요.`);
  }
  while (recommendations.length < 3) {
    const fallback = [
      '기존 설비 데이터의 실제 설치 연도와 용량을 확인해 베이스라인 정확도를 높이세요.',
      '절감량뿐 아니라 비용, 유지관리 난이도, 설치 가능 구역을 함께 비교하세요.',
      '저장한 시나리오를 여러 개 만들어 예산 사용률별 대안을 비교하세요.',
    ].find((item) => !recommendations.includes(item));
    if (!fallback) break;
    recommendations.push(fallback);
  }

  const notes = [
    '본 리포트는 MVP 시뮬레이션 데이터를 기준으로 생성되었습니다.',
    `총 절감량 ${formatKg(total.netSaving)}에는 기존 설비 베이스라인이 포함됩니다.`,
  ];
  if (budgetRate) notes.push(`${displayName} 시나리오의 예산 사용률은 약 ${budgetRate}%입니다.`);
  if (mainLocations.length) notes.push(`주요 배치 위치: ${mainLocations.join(', ')}.`);

  return {
    summary: `${displayName} 시나리오는 ${mainLocations.length ? mainLocations.join(', ') : '일반 구역'}에 ${labels.length ? labels.join(', ') : '신규 설비 없음'}을 배치해 ${formatKg(user.netSaving)}을 추가 절감하며, 예산 ${formatKrw(usedBudget)}을 사용합니다. 기존 설비 베이스라인 ${formatKg(baseline.netSaving)}과 합산한 총 절감량은 ${formatKg(total.netSaving)}입니다.`,
    strengths: strengths.slice(0, 3),
    warnings: warnings.slice(0, 3),
    recommendations: recommendations.slice(0, 3),
    notes: notes.slice(0, 3),
  };
}

export function buildReportFileName(report = {}, context = {}) {
  const baseName = sanitizeFileName(context.nickname || report.title || 'inha-carbon-report');
  return `${safeDateStamp(report.createdAt)}-${baseName}.md`;
}

export function composeFixedMarkdown(report = {}, context = {}) {
  const title = report.title || '탄소중립 시나리오 리포트';
  const summary = report.summary || '시나리오 요약을 생성하지 못했습니다.';
  const strengths = normalizeListItems(report.strengths);
  const warnings = normalizeListItems(report.warnings);
  const recommendations = normalizeListItems(report.recommendations);
  const notes = normalizeListItems(report.notes, [
    '일부 데이터는 MVP 추정값입니다.',
    '실제 설치 전 구조 안전성, 전기 용량, 규제 조건 검토가 필요합니다.',
  ]);

  return [
    `# ${title}`,
    '',
    '## 1. 요약',
    '',
    summary,
    '',
    '## 2. 핵심 지표',
    '',
    metricTable(context.metrics),
    '',
    '## 3. 배치 구성 요약',
    '',
    placementOverview(context.reportItems || [], context.metrics),
    '',
    placementTable(context.reportItems || []),
    '',
    '## 4. 분석',
    '',
    '### 4-1. 잘한 점',
    '',
    markdownList(strengths),
    '',
    '### 4-2. 주의할 점',
    '',
    markdownList(warnings),
    '',
    '## 5. 개선 제안',
    '',
    markdownList(recommendations, true),
    '',
    '## 6. 유의 사항',
    '',
    markdownList(notes),
    '',
  ].join('\n');
}

export function normalizeReportResponse(raw, fallbackContext = {}) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const fallback = buildFallbackReport(fallbackContext);
  const createdAt = data.createdAt || new Date().toISOString();
  const report = {
    formatVersion: data.formatVersion || REPORT_FORMAT_VERSION,
    title: '탄소중립 시나리오 리포트',
    summary: typeof data.summary === 'string' && data.summary.trim() ? data.summary.trim() : fallback.summary,
    strengths: normalizeListItems(data.strengths, fallback.strengths),
    warnings: normalizeListItems(data.warnings, fallback.warnings),
    recommendations: normalizeListItems(data.recommendations, fallback.recommendations),
    notes: normalizeListItems(data.notes, fallback.notes),
    highlights: normalizeListItems(data.highlights, fallback.highlights).slice(0, 4),
    createdAt,
    model: data.model,
  };

  return {
    ...report,
    markdown: composeFixedMarkdown(report, fallbackContext),
    fileName: buildReportFileName({ title: report.title, createdAt }, fallbackContext),
  };
}

export function buildFallbackReport({ nickname, reportItems = [], metrics, analysisSignals = {} }) {
  const user = metrics?.user || {};
  const baseline = metrics?.baseline || {};
  const total = metrics?.total || {};
  const createdAt = new Date().toISOString();
  const insights = buildLocalInsights({ nickname, reportItems, metrics, analysisSignals });
  const report = {
    formatVersion: REPORT_FORMAT_VERSION,
    title: '탄소중립 시나리오 리포트',
    summary: insights.summary,
    strengths: insights.strengths,
    warnings: insights.warnings,
    recommendations: insights.recommendations,
    notes: insights.notes,
    highlights: [
      `신규 절감 ${formatKg(user.netSaving)}`,
      `에너지 ${formatKwh(user.energyKwh)}`,
      `예산 ${formatKrw(user.totalCost)}`,
    ],
    createdAt,
  };

  return {
    ...report,
    markdown: composeFixedMarkdown(report, { nickname, reportItems, metrics }),
    fileName: buildReportFileName({ title: report.title, createdAt }, { nickname }),
  };
}

export function buildReportMarkdown(report = {}) {
  const markdown = typeof report.markdown === 'string' ? report.markdown.trim() : '';
  if (!markdown) return `# ${report.title || '탄소중립 리포트'}\n`;
  return markdown.endsWith('\n') ? markdown : `${markdown}\n`;
}

export async function requestScenarioReport(payload) {
  if (REPORT_MODE === 'local') {
    return { ...buildFallbackReport(payload), source: 'local' };
  }

  try {
    const res = await fetch(REPORT_API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`report request failed: ${res.status}`);
    const data = await res.json();
    return { ...normalizeReportResponse(data, payload), source: 'api' };
  } catch (error) {
    return { ...buildFallbackReport(payload), source: 'fallback', error };
  }
}
