import { ITEM_SOURCE_INDEX, REFERENCE_SOURCES, COST_TRANSPARENCY_NOTE } from './items.js';

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
const REPORT_FORMAT_VERSION = 'inha-carbon-report.v2';

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
      types: new Set(),
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
    if (item.type) current.types.add(item.type);
    current.reasons.add(formatPlacementReason(item));
    const coord = formatCoordinates(item);
    if (coord) current.coordinates.add(coord);
    groups.set(key, current);
  }
  return [...groups.values()].sort((a, b) => b.saving - a.saving);
}

function metricTable(metrics = {}, citations) {
  const user = metrics.user || {};
  const baseline = metrics.baseline || {};
  const total = metrics.total || {};
  const factorRef = citations?.refs?.factor || '';
  const costRef = citations?.refs?.cost || '';
  const baselineRef = citations?.refs?.baseline || '';
  return [
    '| 항목 | 값 |',
    '|---|---:|',
    `| 신규 배치 절감량 ${factorRef} | ${formatKg(user.netSaving)} |`,
    `| 신규 에너지 효과 ${factorRef} | ${formatKwh(user.energyKwh)} |`,
    `| 사용 예산 ${costRef} | ${formatKrw(user.totalCost)} |`,
    `| 잔여 예산 | ${formatKrw(metrics.remainingBudget)} |`,
    `| 적용 연도 | ${metrics.designYear || '-'} |`,
    `| 효율 점수 | ${user.efficiencyScore || 0} kgCO2/백만원 |`,
    `| 기존 설비 베이스라인 ${baselineRef} | ${formatKg(baseline.netSaving)} |`,
    `| 총 절감량 ${factorRef} | ${formatKg(total.netSaving)} |`,
  ].join('\n');
}

function placementOverview(items = [], metrics = {}, citations) {
  if (!items.length) return '- 신규 배치 설비가 없습니다.';
  const user = metrics.user || {};
  const labels = uniqueLabels(items);
  const locations = countBy(items, formatPlacementLocation).slice(0, 3).map(([name]) => name);
  const topSaving = topItemBy(items, 'savingKgCO2PerYear');
  const topEfficiency = [...items].sort((a, b) => itemEfficiency(b) - itemEfficiency(a))[0];
  const locationText = locations.length ? locations.join(', ') : '일반 구역';
  const factorRef = citations?.refs?.factor || '';
  const topSavingRef = topSaving ? (citations?.refs?.item?.[topSaving.type] || factorRef) : factorRef;
  const topEfficiencyRef = topEfficiency ? (citations?.refs?.item?.[topEfficiency.type] || factorRef) : factorRef;
  const lines = [
    `- 신규 배치 ${items.length}개, 설비 유형 ${labels.length}종으로 구성했습니다. ${factorRef}`,
    `- 주요 배치 위치는 ${locationText}입니다.`,
    `- 신규 배치 총 절감량은 ${formatKg(user.netSaving)}, 에너지 효과는 ${formatKwh(user.energyKwh)}입니다. ${factorRef}`,
  ];
  if (topSaving) {
    lines.push(`- 최대 절감 기여 배치는 ${formatPlacementLocation(topSaving)}의 ${topSaving.label}입니다. ${topSavingRef}`);
  }
  if (topEfficiency && itemEfficiency(topEfficiency) > 0) {
    lines.push(`- 비용 대비 효율이 가장 높은 배치는 ${formatPlacementLocation(topEfficiency)}의 ${topEfficiency.label}입니다. ${topEfficiencyRef}`);
  }
  return lines.join('\n');
}

function placementTable(items = [], citations) {
  const rows = aggregatePlacementRows(items);
  if (!rows.length) return '신규 배치 설비가 없습니다.';
  const visibleRows = rows.slice(0, 8);
  const table = [
    '| 위치/구역 | 설비 | 수량 | 절감량 | 에너지 | 비용 | 위치 판단 |',
    '|---|---|---:|---:|---:|---:|---|',
    ...visibleRows.map((row) => {
      const reason = [...row.reasons][0] || '기본 설치 조건';
      const ref = firstItemRefForTypes([...row.types], citations);
      return [
        sanitizeMarkdownCell(row.location),
        sanitizeMarkdownCell(row.label),
        sanitizeMarkdownCell(`${row.qty.toLocaleString()} ${row.unit}`),
        sanitizeMarkdownCell(formatKg(row.saving)),
        sanitizeMarkdownCell(formatKwh(row.energy)),
        sanitizeMarkdownCell(formatKrw(row.cost)),
        sanitizeMarkdownCell(`${reason} ${ref}`),
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

function hashString(value) {
  const text = String(value || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function pickVariant(options, seed, offset = 0) {
  if (!options.length) return '';
  return options[(seed + offset) % options.length];
}

function uniquePush(list, value) {
  if (value && !list.includes(value)) list.push(value);
}

function rotateTake(values, count, seed) {
  const unique = [...new Set(values.filter(Boolean))];
  if (unique.length <= count) return unique;
  const start = seed % unique.length;
  return [...unique.slice(start), ...unique.slice(0, start)].slice(0, count);
}

function scenarioSignature({ reportItems = [], metrics = {}, nickname = '', createdAt = '' }) {
  const compactItems = reportItems.map((item) => ({
    type: item.type,
    location: formatPlacementLocation(item),
    qty: Number(item.qty || 1),
    saving: Math.round(Number(item.savingKgCO2PerYear || 0)),
    cost: Math.round(Number(item.costKrw || 0)),
    rate: Math.round(Number(item.efficiencyRate || 0)),
  }));
  const user = metrics.user || {};
  const total = metrics.total || {};
  return JSON.stringify({
    nickname,
    createdAt,
    items: compactItems,
    budget: Math.round(Number(metrics.budget || 0) / 1000000),
    used: Math.round(Number(user.totalCost || 0) / 1000000),
    saving: Math.round(Number(user.netSaving || 0)),
    total: Math.round(Number(total.netSaving || 0)),
  });
}

function makeCitationRegistry(reportItems = []) {
  const entries = [];
  const byKey = new Map();
  const usedTypes = [...new Set(reportItems.map((item) => item.type).filter(Boolean))];
  const add = (label, source) => {
    const cleanSource = String(source || '').trim();
    if (!cleanSource) return '';
    const key = `${label}::${cleanSource}`;
    if (byKey.has(key)) return `[${byKey.get(key).id}]`;
    const entry = { id: entries.length + 1, label, source: cleanSource };
    entries.push(entry);
    byKey.set(key, entry);
    return `[${entry.id}]`;
  };

  const refs = {
    factor: add('감축계수 산정', `${REFERENCE_SOURCES[0]} · ${REFERENCE_SOURCES[2]}`),
    cost: add('단가·예산 가정', `${COST_TRANSPARENCY_NOTE} · ${REFERENCE_SOURCES[4] || ''}`),
    constraint: add('설치 제약', `${REFERENCE_SOURCES[10]} · ${REFERENCE_SOURCES[11]} · 한국에너지공단 태양광 설치 원칙`),
    baseline: add('기존 설비 보정', '인하대 시설팀 실측자료 확보 전 MVP 추정치로 분리, 감축계수는 공인 산식 적용'),
    item: {},
  };

  for (const type of usedTypes) {
    refs.item[type] = add(type, ITEM_SOURCE_INDEX[type]);
  }

  return {
    refs,
    entries,
    byId: Object.fromEntries(entries.map((entry) => [entry.id, entry])),
  };
}

function appendCitation(text, ref) {
  const clean = String(text || '').trim();
  if (!clean || !ref || clean.includes(ref)) return clean;
  return `${clean} ${ref}`;
}

function firstItemRefForTypes(types = [], citations) {
  for (const type of types) {
    const ref = citations?.refs?.item?.[type];
    if (ref) return ref;
  }
  return citations?.refs?.factor || '';
}

function compactSignalText(text) {
  return String(text || '')
    .replace(/[✅⚠️📉🌳☀️🔌💡📊🌿💧🏗️🌡️]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function typeCounts(items = []) {
  return items.reduce((acc, item) => {
    acc[item.type] = (acc[item.type] || 0) + Number(item.qty || 1);
    return acc;
  }, {});
}

function describeScenarioProfile(items = []) {
  const counts = typeCounts(items);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (!total) {
    return {
      id: 'empty',
      label: '미배치 검토안',
      narrative: '아직 신규 설비가 없어 예산 배분 방향을 먼저 정해야 하는 상태입니다.',
      question: '어떤 감축축부터 예산을 배분할 것인가?',
      nextComparison: 'LED/BEMS 중심의 저위험안과 태양광 중심의 고효과안을 먼저 비교하세요.',
      tone: '기획 초기 검토',
    };
  }

  const solarQty = Number(counts.solar_self || 0) + Number(counts.solar_bipv || 0);
  const controlQty = Number(counts.led || 0) + Number(counts.bems || 0);
  const natureQty = Number(counts.tree || 0) + Number(counts.greenroof || 0) + Number(counts.rainwater || 0);
  const mobilityQty = Number(counts.ev || 0);
  const max = Math.max(solarQty, controlQty, natureQty, mobilityQty);

  if (solarQty === max && solarQty > 0) {
    return {
      id: 'solar',
      label: '옥상 발전 중심안',
      narrative: '전력 대체 효과가 큰 대신 옥상 가용면적, 음영, 구조안전 검토가 핵심 리스크입니다.',
      question: '옥상 공간을 발전량 중심으로 쓸 만큼 구조·피난 여유가 있는가?',
      nextComparison: '같은 예산으로 BEMS를 섞은 피크관리형 대안과 비교하세요.',
      tone: '공간 제약 검토',
    };
  }
  if (controlQty === max && controlQty > 0) {
    return {
      id: 'control',
      label: '운영 효율 개선안',
      narrative: '기존 건물 운영 데이터를 활용해 조명·공조 효율을 끌어올리는 안정형 감축안입니다.',
      question: '기존 건물 운영 데이터를 확보해 절감 효과를 검증할 수 있는가?',
      nextComparison: '절감 안정성은 유지하되 태양광 1~2개 구역을 더한 혼합안을 비교하세요.',
      tone: '운영 개선 검토',
    };
  }
  if (natureQty === max && natureQty > 0) {
    return {
      id: 'nature',
      label: '자연기반 보완안',
      narrative: '직접 감축량은 작을 수 있지만 열섬·물순환·캠퍼스 환경 개선 효과를 함께 기대하는 구성입니다.',
      question: '탄소 수치 외에 열섬·물순환·교육 효과까지 정책 목표에 포함할 것인가?',
      nextComparison: '자연기반 설비는 유지하되 고효율 LED/BEMS를 더한 보완안을 비교하세요.',
      tone: '부가효과 검토',
    };
  }
  return {
    id: 'mobility',
    label: '충전 인프라 연계안',
    narrative: '탄소 감축량 자체보다 무공해차 전환을 가능하게 하는 기반 인프라 성격이 강합니다.',
    question: '충전 접근성이 실제 이용 전환으로 이어질 만큼 좋은 위치인가?',
    nextComparison: 'EV 충전소를 태양광 또는 BEMS와 묶은 자가소비형 대안을 비교하세요.',
    tone: '이용 전환 검토',
  };
}

function highestRooftopRisk(constraintSignals = {}) {
  const rows = Array.isArray(constraintSignals.rooftopUsage) ? constraintSignals.rooftopUsage : [];
  return [...rows]
    .filter((row) => Number(row.available || 0) > 0)
    .map((row) => ({
      ...row,
      utilization: Number(row.usage || 0) / Number(row.available || 1),
    }))
    .sort((a, b) => b.utilization - a.utilization)[0];
}

function strongestModifier(items = []) {
  const entries = [];
  for (const item of items) {
    const modifiers = Array.isArray(item.placementModifiers) ? item.placementModifiers : [];
    for (const modifier of modifiers) {
      const effect = Math.abs(Number(modifier.effectMultiplier || 1) - 1);
      const cost = Math.abs(Number(modifier.costMultiplier || 1) - 1);
      entries.push({ item, modifier, weight: effect + cost });
    }
  }
  return entries.sort((a, b) => b.weight - a.weight)[0];
}

function buildReportVoice({ report = {}, context = {} }) {
  const reportItems = context.reportItems || [];
  const metrics = context.metrics || {};
  const profile = describeScenarioProfile(reportItems);
  const user = metrics.user || {};
  const baseline = metrics.baseline || {};
  const total = metrics.total || {};
  const budget = Number(metrics.budget || 0);
  const usedBudget = Number(user.totalCost || metrics.usedBudget || 0);
  const budgetRate = percent(usedBudget, budget);
  const topSaving = topItemBy(reportItems, 'savingKgCO2PerYear');
  const topEfficiency = [...reportItems].sort((a, b) => itemEfficiency(b) - itemEfficiency(a))[0];
  const locations = countBy(reportItems, formatPlacementLocation).slice(0, 3).map(([name]) => name);
  const labels = uniqueLabels(reportItems);
  const rooftopRisk = highestRooftopRisk(metrics.constraintSignals || {});
  const greenLoss = Number(metrics.constraintSignals?.greenSacrificePenalty || 0);
  const seed = hashString(scenarioSignature({
    reportItems,
    metrics,
    nickname: context.nickname,
    createdAt: report.createdAt,
  }));
  const locationText = locations.length ? locations.join(', ') : '일반 구역';
  const topSavingText = topSaving ? `${formatPlacementLocation(topSaving)} ${topSaving.label}` : '신규 배치 없음';
  const topEfficiencyText = topEfficiency ? `${formatPlacementLocation(topEfficiency)} ${topEfficiency.label}` : topSavingText;
  const riskLabel =
    rooftopRisk?.utilization >= 1 ? `${rooftopRisk.zoneName} 옥상 초과` :
    rooftopRisk?.utilization >= 0.85 ? `${rooftopRisk.zoneName} 옥상 임박` :
    greenLoss > 0 ? '녹지 훼손 손실 반영' :
    budgetRate > 85 ? '예산 소진 임박' :
    budgetRate < 10 && reportItems.length ? '예산 활용 낮음' :
    '중대 제약 낮음';

  const titleMap = {
    solar: [
      '옥상 발전 배치 검토 리포트',
      '태양광 중심 탄소중립 시나리오',
      '캠퍼스 발전공간 활용 진단',
    ],
    control: [
      '건물 운영 효율화 검토 리포트',
      'BEMS·LED 중심 감축 시나리오',
      '운영 개선형 탄소중립 진단',
    ],
    nature: [
      '자연기반 보완 시나리오 리포트',
      '녹지·물순환 중심 캠퍼스 진단',
      '캠퍼스 환경개선형 감축 검토',
    ],
    mobility: [
      'EV 인프라 연계 시나리오 리포트',
      '충전 접근성 기반 감축 검토',
      '무공해 이동 전환 지원안',
    ],
    empty: [
      '탄소중립 초기 배치 검토',
      '예산 배분 전 사전 진단',
      '신규 설비 미배치 리포트',
    ],
  };

  const headlineOptions = [
    `${profile.label}으로 읽히며, 핵심 검토 지점은 ${riskLabel}입니다.`,
    `${locationText} 배치가 시나리오의 성격을 만들고 있습니다.`,
    `${topSavingText}이 성과 해석의 중심이고, 다음 단계는 실행 가능성 확인입니다.`,
  ];
  const memoOptions = [
    `${topSavingText}부터 현장 확인 우선순위를 잡고, ${riskLabel} 항목은 회의 전 별도 메모로 분리하세요.`,
    `${profile.tone} 관점에서는 ${topEfficiencyText}의 비용 대비 효과를 먼저 검증하는 편이 좋습니다.`,
    `${locationText}의 배치 밀집도를 확인한 뒤 같은 예산으로 분산 배치안을 하나 더 저장해 비교하세요.`,
  ];
  const takeawayOptions = [
    '이 안은 "얼마나 줄였는가"보다 "어디에 설치할 수 있는가"를 같이 봐야 설득력이 생깁니다.',
    `성과 숫자는 충분히 의미가 있지만, 발표에서는 ${riskLabel}을 먼저 설명해야 방어가 쉽습니다.`,
    `담당자 관점에서는 절감량, 예산, 설치 제약이 한 번에 연결되는지 확인하는 안입니다.`,
  ];
  const layoutOptions = ['decision-first', 'risk-first', 'implementation-first'];
  const headingSets = [
    {
      summary: '판단 요약',
      metrics: '숫자로 보는 효과',
      placement: '배치가 만든 차이',
      analysis: '검토 의견',
      strength: '살릴 부분',
      warning: '걸리는 부분',
      action: '다음 액션',
      note: '전제',
    },
    {
      summary: '이번 안의 성격',
      metrics: '예산·절감 스냅샷',
      placement: '현장 배치 근거',
      analysis: '의사결정 포인트',
      strength: '강점',
      warning: '확인 필요',
      action: '보완 방향',
      note: '계산 조건',
    },
    {
      summary: '검토 메모',
      metrics: '핵심 수치',
      placement: '설치안 요약',
      analysis: '정책 해석',
      strength: '긍정 신호',
      warning: '리스크 신호',
      action: '비교할 대안',
      note: '주의 사항',
    },
  ];

  return {
    seed,
    profile,
    layout: pickVariant(layoutOptions, seed, 1),
    headings: pickVariant(headingSets, seed, 2),
    title: report.title || pickVariant(titleMap[profile.id] || titleMap.empty, seed),
    headline: report.headline || pickVariant(headlineOptions, seed, 3),
    decisionQuestion: report.decisionQuestion || profile.question,
    readerTakeaway: report.readerTakeaway || pickVariant(takeawayOptions, seed, 4),
    implementationMemo: report.implementationMemo || pickVariant(memoOptions, seed, 5),
    nextComparison: report.nextComparison || profile.nextComparison,
    focusTags: rotateTake([
      profile.label,
      riskLabel,
      topSaving ? `최대기여: ${topSaving.label}` : '',
      topEfficiency ? `효율우선: ${topEfficiency.label}` : '',
      budgetRate ? `예산 ${budgetRate}%` : '',
      baseline.netSaving > user.netSaving ? '기존설비 영향 큼' : '',
      total.netSaving ? `총 ${formatKg(total.netSaving)}` : '',
    ], 4, seed),
  };
}

function buildScenarioVisualSummary({ reportItems = [], metrics = {}, voice }) {
  const user = metrics.user || {};
  const baseline = metrics.baseline || {};
  const total = metrics.total || {};
  const budget = Number(metrics.budget || 0);
  const usedBudget = Number(user.totalCost || metrics.usedBudget || 0);
  const budgetRate = percent(usedBudget, budget);
  const labels = uniqueLabels(reportItems);
  const locations = countBy(reportItems, formatPlacementLocation).slice(0, 3).map(([name]) => name);
  const topSaving = topItemBy(reportItems, 'savingKgCO2PerYear');
  const rooftopRisk = highestRooftopRisk(metrics.constraintSignals || {});
  const greenLoss = Number(metrics.constraintSignals?.greenSacrificePenalty || 0);
  const placementRows = aggregatePlacementRows(reportItems).slice(0, 5);
  const totalMix = Math.max(Number(total.netSaving || 0), 1);
  const riskText =
    rooftopRisk?.utilization >= 1 ? `${rooftopRisk.zoneName} 옥상 초과` :
    rooftopRisk?.utilization >= 0.85 ? `${rooftopRisk.zoneName} 옥상 임박` :
    greenLoss > 0 ? `녹지 손실 ${formatKg(greenLoss)}` :
    budgetRate > 85 ? `예산 사용률 ${budgetRate}%` :
    '큰 제약 없음';

  return {
    type: voice.profile.label,
    metricCards: [
      { label: '신규 절감', value: formatKg(user.netSaving), tone: 'good' },
      { label: '예산 사용', value: budgetRate ? `${budgetRate}%` : '0%', sub: formatKrw(usedBudget), tone: budgetRate > 85 ? 'warn' : 'neutral' },
      { label: '주요 위치', value: locations[0] || '미배치', sub: locations.slice(1).join(', '), tone: 'neutral' },
      { label: '최대 기여', value: topSaving?.label || '없음', sub: topSaving ? formatPlacementLocation(topSaving) : '', tone: 'good' },
    ],
    flow: [
      { label: '1. 설비 조합', value: labels.length ? labels.slice(0, 3).join(', ') : '신규 설비 없음' },
      { label: '2. 배치 초점', value: locations.length ? locations.join(' / ') : '위치 선택 전' },
      { label: '3. 검토 신호', value: riskText },
      { label: '4. 다음 비교', value: voice.nextComparison },
    ],
    mix: [
      { label: '신규 배치', value: formatKg(user.netSaving), pct: percent(user.netSaving, totalMix) },
      { label: '기존 설비', value: formatKg(baseline.netSaving), pct: percent(baseline.netSaving, totalMix) },
      { label: '총 절감', value: formatKg(total.netSaving), pct: 100 },
    ],
    placementCards: placementRows.map((row, index) => ({
      rank: index + 1,
      location: row.location,
      label: row.label,
      qty: `${row.qty.toLocaleString()} ${row.unit}`,
      saving: formatKg(row.saving),
      energy: formatKwh(row.energy),
      cost: formatKrw(row.cost),
      reason: [...row.reasons][0] || '기본 설치 조건',
    })),
    sourcePattern: [
      '숫자 카드는 의사결정용 스냅샷으로 먼저 읽습니다.',
      '관찰 카드는 LLM이 매번 배치 맥락에 맞춰 자유롭게 작성합니다.',
      '본문의 [1], [2]는 마우스를 올려 근거를 확인합니다.',
    ],
  };
}

function normalizeReportSections(value, fallback = []) {
  if (!Array.isArray(value)) return fallback;
  const sections = value
    .filter((section) => section && typeof section === 'object')
    .map((section, index) => ({
      heading: String(section.heading || section.title || `관찰 ${index + 1}`).trim(),
      body: String(section.body || section.summary || '').trim(),
      evidence: String(section.evidence || '').trim(),
      action: String(section.action || '').trim(),
      tone: String(section.tone || section.type || 'neutral').trim(),
    }))
    .filter((section) => section.heading && section.body)
    .slice(0, 5);
  return sections.length ? sections : fallback;
}

function buildSectionsFromInsights(insights = {}, seed = 0) {
  const strength = rotateTake(insights.strengths || [], 2, seed);
  const warning = rotateTake(insights.warnings || [], 2, seed + 1);
  const action = rotateTake(insights.recommendations || [], 2, seed + 2);
  const sections = [];
  if (strength[0]) {
    sections.push({
      heading: pickVariant(['성과가 나온 지점', '이번 배치에서 살릴 부분', '설득에 쓸 수 있는 근거'], seed),
      body: strength[0],
      evidence: strength[1] || '',
      action: insights.nextComparison || '',
      tone: 'good',
    });
  }
  if (warning[0]) {
    sections.push({
      heading: pickVariant(['먼저 확인할 위험', '발표 전에 방어할 지점', '현장 검토가 필요한 부분'], seed, 1),
      body: warning[0],
      evidence: warning[1] || '',
      action: action[0] || '',
      tone: 'warn',
    });
  }
  if (action[0]) {
    sections.push({
      heading: pickVariant(['다음 비교안', '바로 바꿔볼 실험', '의사결정 전 추가 검토'], seed, 2),
      body: action[0],
      evidence: insights.readerTakeaway || '',
      action: action[1] || insights.implementationMemo || '',
      tone: 'action',
    });
  }
  sections.push({
    heading: pickVariant(['근거와 전제 확인', '숫자를 읽을 때의 기준', '검토 전에 남는 질문'], seed, 3),
    body: insights.notes?.[0] || '감축량과 비용은 공식 계수와 앱 내부 보수 가정을 조합한 정책 검토용 값입니다.',
    evidence: insights.notes?.[1] || insights.reportType || '',
    action: insights.implementationMemo || insights.nextComparison || '',
    tone: 'neutral',
  });
  return sections;
}

function buildLocalInsights({ nickname, reportItems = [], metrics = {}, analysisSignals = {}, createdAt = '' }) {
  const user = metrics.user || {};
  const baseline = metrics.baseline || {};
  const total = metrics.total || {};
  const constraintSignals = metrics.constraintSignals || {};
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
  const hasEv = reportItems.some((item) => item.type === 'ev');
  const hasBems = reportItems.some((item) => item.type === 'bems');
  const hasTreeOrGreen = reportItems.some((item) => item.type === 'tree' || item.type === 'greenroof');
  const hasControl = reportItems.some((item) => item.type === 'bems' || item.type === 'led');
  const displayName = nickname?.trim() || '사용자';
  const locationCounts = countBy(reportItems, formatPlacementLocation);
  const mainLocations = locationCounts.slice(0, 3).map(([name]) => name);
  const profile = describeScenarioProfile(reportItems);
  const rooftopRisk = highestRooftopRisk(constraintSignals);
  const greenLoss = Number(constraintSignals.greenSacrificePenalty || 0);
  const modifierSignal = strongestModifier(reportItems);
  const voice = buildReportVoice({ report: { createdAt }, context: { nickname, reportItems, metrics } });
  const seed = voice.seed;

  const strengths = [];
  uniquePush(strengths, pickVariant([
    `${profile.label}: ${profile.narrative}`,
    `${profile.tone} 관점에서 보면 ${profile.narrative}`,
    `이번 안의 중심축은 ${profile.label}입니다. ${profile.narrative}`,
  ], seed));
  if (topSaving) {
    uniquePush(strengths, pickVariant([
      `${formatPlacementLocation(topSaving)}의 ${topSaving.label}이 신규 절감량 중 약 ${percent(topSaving.savingKgCO2PerYear, user.netSaving)}%를 담당합니다.`,
      `성과의 무게중심은 ${formatPlacementLocation(topSaving)}에 둔 ${topSaving.label}입니다. 신규 감축의 약 ${percent(topSaving.savingKgCO2PerYear, user.netSaving)}%를 차지합니다.`,
      `${topSaving.label} 배치가 가장 큰 감축 축입니다. 위치는 ${formatPlacementLocation(topSaving)}이며, 다른 설비는 이를 보완하는 역할입니다.`,
    ], seed, 1));
  }
  if (labels.length >= 3) {
    uniquePush(strengths, pickVariant([
      `${labels.slice(0, 3).join(', ')} 등 ${labels.length}종 설비를 조합해 단일 설비 의존도를 낮췄습니다.`,
      `${labels.length}종 설비를 섞어 발전·절감·보완 효과를 나눠 담은 구성입니다.`,
      `한 가지 설비에 몰지 않고 ${labels.slice(0, 3).join(', ')}를 함께 배치한 점이 강점입니다.`,
    ], seed, 2));
  } else if (labels.length > 0) {
    uniquePush(strengths, pickVariant([
      `${labels.join(', ')} 중심의 단순한 구성이라 예산과 효과를 비교하기 쉽습니다.`,
      `설비 종류를 좁혀 ${labels.join(', ')}의 효과를 직접 확인하기 좋은 안입니다.`,
      `구성이 단순해 시설팀 검토 시 비용·위치·효과의 관계를 설명하기 쉽습니다.`,
    ], seed, 3));
  }
  if (mainLocations.length >= 2) {
    uniquePush(strengths, pickVariant([
      `${mainLocations.join(', ')} 등 여러 구역에 분산 배치해 한 위치에 성과가 몰리는 문제를 줄였습니다.`,
      `배치가 ${mainLocations.join(', ')}로 나뉘어 있어 한 건물 의존도가 비교적 낮습니다.`,
      `여러 위치를 활용한 덕분에 특정 구역의 설치 제약에 리스크가 집중되지 않습니다.`,
    ], seed, 4));
  }
  if (modifierSignal) {
    uniquePush(strengths, pickVariant([
      `${formatPlacementLocation(modifierSignal.item)}의 ${modifierSignal.item.label}에는 ${modifierSignal.modifier.label}이 반영되어 위치 특성이 점수와 비용에 함께 반영되었습니다.`,
      `${modifierSignal.modifier.label}이 적용된 배치가 있어 단순 수량 계산보다 현장 조건을 더 잘 드러냅니다.`,
      `${formatPlacementLocation(modifierSignal.item)} 배치는 위치 보정이 들어가므로 발표 시 "왜 이 장소인가"를 설명하기 좋습니다.`,
    ], seed, 5));
  } else if (hasControl) {
    uniquePush(strengths, pickVariant([
      'LED/BEMS 계열 설비가 포함되어 운영 효율 개선 효과를 기대할 수 있습니다.',
      '운영 효율 계열 설비가 들어가 있어 현장 데이터 확보 후 검증하기 쉬운 편입니다.',
      '조명·관리 설비 중심의 절감은 설치 후 모니터링 지표를 잡기 좋습니다.',
    ], seed, 6));
  }
  if (!strengths.length) {
    uniquePush(strengths, '아직 신규 배치가 없어 예산을 자유롭게 재설계할 수 있습니다.');
  }

  const warnings = [];
  if (!reportItems.length) {
    uniquePush(warnings, '신규 배치 설비가 없어 시나리오 간 성과 비교가 제한됩니다.');
  }
  if (budgetRate > 0 && budgetRate < 10) {
    uniquePush(warnings, pickVariant([
      `현재 예산 사용률은 약 ${budgetRate}%로 낮아, 남은 예산을 활용한 추가 절감 여지가 큽니다.`,
      `예산을 거의 쓰지 않은 안입니다. ${budgetRate}% 사용률만으로는 정책안의 우선순위를 판단하기 어렵습니다.`,
      `남은 예산이 큰 편이라, 지금 결과는 최종안보다 탐색안에 가깝습니다.`,
    ], seed, 7));
  }
  if (budgetRate > 85) {
    uniquePush(warnings, pickVariant([
      `현재 예산 사용률은 약 ${budgetRate}%로 높아, 추가 배치 전 비용 효율을 우선 확인해야 합니다.`,
      `예산 여유가 작습니다. 다음 수정은 신규 추가보다 저효율 배치 교체가 먼저입니다.`,
      `예산을 거의 채운 구성이라, 설치 난이도가 높은 항목은 대체 후보를 함께 준비해야 합니다.`,
    ], seed, 8));
  }
  if (topCost && topSaving && topCost.type !== topSaving.type) {
    uniquePush(warnings, pickVariant([
      `가장 비용이 큰 배치는 ${formatPlacementLocation(topCost)}의 ${topCost.label}이지만, 최대 절감 기여 배치는 ${formatPlacementLocation(topSaving)}의 ${topSaving.label}입니다.`,
      `비용 중심 항목과 감축 중심 항목이 다릅니다. ${topCost.label}의 목적을 감축량 외 가치로 설명할 필요가 있습니다.`,
      `${topCost.label}에 예산이 크게 들어가지만 감축 기여 1위는 ${topSaving.label}입니다. 비용 대비 효과를 따로 비교하세요.`,
    ], seed, 9));
  }
  if (rooftopRisk && rooftopRisk.utilization >= 1) {
    warnings.push(`${rooftopRisk.zoneName} 옥상 사용률이 ${Math.round(rooftopRisk.utilization * 100)}%로 가용면적을 초과합니다. 같은 유형 설비를 다른 건물로 분산해야 합니다.`);
  } else if (rooftopRisk && rooftopRisk.utilization >= 0.85) {
    warnings.push(`${rooftopRisk.zoneName} 옥상 사용률이 ${Math.round(rooftopRisk.utilization * 100)}%로 높아 추가 배치 전 공조·피난공간 검토가 필요합니다.`);
  }
  if (greenLoss > 0) {
    warnings.push(`녹지 위 설치로 산림 흡수 손실 ${formatKg(greenLoss)}이 차감되었습니다. 탄소 절감 설비라도 녹지 훼손과 함께 비교해야 합니다.`);
  }
  if (baseline.netSaving > user.netSaving) {
    uniquePush(warnings, pickVariant([
      '기존 설비 베이스라인이 신규 배치 성과보다 커서, 총 절감량만 보면 사용자 신규 성과가 과대해 보일 수 있습니다.',
      '총 절감량에서 기존 설비 영향이 큽니다. 발표에서는 신규 배치 성과를 따로 분리해 말해야 합니다.',
      '베이스라인 비중이 커서 "이번에 새로 바꾼 효과"와 "이미 있던 효과"를 구분해야 합니다.',
    ], seed, 10));
  }
  warnings.push(...signalWarnings);
  if (!warnings.length) {
    uniquePush(warnings, pickVariant([
      '현재 계산상 큰 경고는 없지만, 실제 설치 전 현장 조건 검토가 필요합니다.',
      '시뮬레이션상 위험 신호는 작지만, 구조·전기·유지관리 검토는 별도로 남아 있습니다.',
      '큰 제약은 드러나지 않았으나, 실제 견적과 현장 실측이 들어오면 우선순위가 달라질 수 있습니다.',
    ], seed, 11));
  }

  const recommendations = [];
  if (topEfficiency && itemEfficiency(topEfficiency) > 0) {
    uniquePush(recommendations, pickVariant([
      `${formatPlacementLocation(topEfficiency)}의 ${topEfficiency.label}처럼 비용 대비 절감 효율이 높은 배치를 우선 확대하세요.`,
      `다음 비교안에서는 ${topEfficiency.label}을 1단계 우선 설치 항목으로 두고 예산 배분을 다시 계산하세요.`,
      `효율 기준으로는 ${formatPlacementLocation(topEfficiency)}의 ${topEfficiency.label}을 확대 후보로 보는 것이 자연스럽습니다.`,
    ], seed, 12));
  }
  if (rooftopRisk && rooftopRisk.utilization >= 0.85) {
    recommendations.push(`${rooftopRisk.zoneName}의 옥상 추가 배치는 보류하고, 신축/태양광 설치 건물 중 가용면적이 남는 후보를 비교하세요.`);
  }
  if (hasSolar && hasTreeOrGreen) {
    uniquePush(recommendations, pickVariant([
      '태양광 주변에는 수목과 그린루프 배치를 분리해 그림자와 옥상 면적 간섭을 줄이세요.',
      '발전 설비와 자연기반 설비가 서로 간섭하지 않도록 그림자·옥상 동선을 따로 검토하세요.',
      '태양광은 일사 조건을, 자연기반 설비는 체류·열섬 효과를 기준으로 위치를 분리해보세요.',
    ], seed, 13));
  }
  if (hasEv && !hasSolar) {
    recommendations.push('EV 충전소는 태양광 또는 BEMS와 묶어 자가소비·피크관리 시나리오로 검토하면 정책 설명력이 높아집니다.');
  }
  if (hasSolar && !hasBems) {
    recommendations.push('태양광 발전량 예측과 건물 부하 관리를 위해 BEMS를 함께 배치한 대안을 비교하세요.');
  }
  if (budgetRate < 50) {
    recommendations.push('남은 예산 일부를 LED/BEMS 같은 운영 효율 개선 설비에 배분해 안정적인 절감 효과를 확보하세요.');
  }
  if (signalDetails.length) {
    recommendations.push(`상세 분석의 "${signalDetails[0]}" 항목을 우선 검토해 배치 품질을 높이세요.`);
  }
  while (recommendations.length < 3) {
    const fallback = rotateTake([
      '기존 설비 데이터의 실제 설치 연도와 용량을 확인해 베이스라인 정확도를 높이세요.',
      '절감량뿐 아니라 비용, 유지관리 난이도, 설치 가능 구역을 함께 비교하세요.',
      '저장한 시나리오를 여러 개 만들어 예산 사용률별 대안을 비교하세요.',
      '같은 예산으로 고효율안과 저위험안을 각각 만들어 차이를 보여주세요.',
      '담당자 검토용으로 구조안전, 전기 인입, 유지관리 항목을 별도 체크리스트로 분리하세요.',
    ], 5, seed).find((item) => !recommendations.includes(item));
    if (!fallback) break;
    recommendations.push(fallback);
  }

  const notes = [
    pickVariant([
      '본 리포트는 공인 가이드라인 기반 산식과 앱 내부 보수 가정을 조합한 정책 검토용 시뮬레이션입니다.',
      '계산값은 공식 계수를 기반으로 한 검토용 추정치이며, 실제 설계 단계에서는 현장 실측 보정이 필요합니다.',
      '감축량은 공인 계수 기반 추정값이고, 단가·위치 보정은 정책 비교를 위한 보수 가정입니다.',
    ], seed, 14),
    pickVariant([
      `총 절감량 ${formatKg(total.netSaving)}에는 기존 설비 베이스라인이 포함됩니다.`,
      `기존 설비 효과 ${formatKg(baseline.netSaving)}와 신규 배치 효과 ${formatKg(user.netSaving)}는 분리해서 해석해야 합니다.`,
      `총량 지표만 보지 말고 신규 배치분 ${formatKg(user.netSaving)}을 별도로 비교하세요.`,
    ], seed, 15),
  ];
  if (budgetRate) notes.push(`${displayName} 시나리오의 예산 사용률은 약 ${budgetRate}%입니다.`);
  if (mainLocations.length) notes.push(`주요 배치 위치: ${mainLocations.join(', ')}.`);

  const summaryOptions = [
    `${displayName} 시나리오는 ${profile.label}으로 분류됩니다. 신규 배치 ${labels.length ? labels.join(', ') : '없음'}은 ${mainLocations.length ? mainLocations.join(', ') : '일반 구역'}에 집중되어 ${formatKg(user.netSaving)}을 추가 절감하고, 기존 설비 ${formatKg(baseline.netSaving)}와 합산한 총 절감량은 ${formatKg(total.netSaving)}입니다. ${profile.narrative} 예산은 ${formatKrw(usedBudget)}을 사용했습니다.`,
    `${displayName} 안은 ${mainLocations.length ? mainLocations.join(', ') : '일반 구역'}을 중심으로 ${labels.length ? labels.join(', ') : '신규 설비 없음'}을 배치한 ${profile.label}입니다. 신규 배치 효과는 ${formatKg(user.netSaving)}, 기존 설비 효과는 ${formatKg(baseline.netSaving)}, 총 절감량은 ${formatKg(total.netSaving)}로 나뉘어 해석됩니다. 이번 검토의 질문은 "${voice.decisionQuestion}"입니다.`,
    `이번 리포트는 ${profile.tone} 관점으로 읽는 것이 적합합니다. 신규 배치는 ${formatKg(user.netSaving)}을 만들고, 기존 설비 베이스라인 ${formatKg(baseline.netSaving)}와 합산하면 총 ${formatKg(total.netSaving)}입니다. 예산 ${formatKrw(usedBudget)}을 쓴 만큼, 다음 단계에서는 ${voice.nextComparison}`,
  ];

  const baseInsights = {
    title: voice.title,
    headline: voice.headline,
    reportType: profile.label,
    decisionQuestion: voice.decisionQuestion,
    readerTakeaway: voice.readerTakeaway,
    implementationMemo: voice.implementationMemo,
    nextComparison: voice.nextComparison,
    focusTags: voice.focusTags,
    summary: pickVariant(summaryOptions, seed, 16),
    strengths: strengths.slice(0, 3),
    warnings: warnings.slice(0, 3),
    recommendations: recommendations.slice(0, 3),
    notes: notes.slice(0, 3),
  };
  return {
    ...baseInsights,
    sections: buildSectionsFromInsights(baseInsights, seed),
  };
}

export function buildReportFileName(report = {}, context = {}) {
  const baseName = sanitizeFileName(context.nickname || report.title || 'inha-carbon-report');
  return `${safeDateStamp(report.createdAt)}-${baseName}.md`;
}

export function composeFixedMarkdown(report = {}, context = {}) {
  const voice = buildReportVoice({ report, context });
  const citations = report.citations?.entries ? report.citations : makeCitationRegistry(context.reportItems || []);
  const title = voice.title || '탄소중립 시나리오 리포트';
  const summary = appendCitation(report.summary || '시나리오 요약을 생성하지 못했습니다.', citations.refs.factor);
  const strengths = normalizeListItems(report.strengths);
  const warnings = normalizeListItems(report.warnings);
  const recommendations = normalizeListItems(report.recommendations);
  const notes = normalizeListItems(report.notes, [
    '일부 데이터는 MVP 추정값입니다.',
    '실제 설치 전 구조 안전성, 전기 용량, 규제 조건 검토가 필요합니다.',
  ]);
  const h = voice.headings;
  const focusTags = normalizeListItems(report.focusTags, voice.focusTags).slice(0, 4);
  const defaultSections = buildSectionsFromInsights({
    strengths,
    warnings,
    recommendations,
    readerTakeaway: report.readerTakeaway || voice.readerTakeaway,
    implementationMemo: report.implementationMemo || voice.implementationMemo,
    nextComparison: report.nextComparison || voice.nextComparison,
  }, voice.seed);
  const sections = normalizeReportSections(report.sections, defaultSections);
  const sectionMarkdown = sections.map((section) => [
    `### ${section.heading}`,
    '',
    appendCitation(section.body, section.tone === 'warn' ? citations.refs.constraint : citations.refs.factor),
    section.evidence ? '' : null,
    section.evidence ? appendCitation(`근거: ${section.evidence}`, citations.refs.factor) : null,
    section.action ? '' : null,
    section.action ? appendCitation(`다음: ${section.action}`, section.tone === 'action' ? citations.refs.cost : citations.refs.constraint) : null,
  ].filter((line) => line !== null).join('\n')).join('\n\n');
  const decisionBlock = [
    `- 리포트 관점: ${report.reportType || voice.profile.label} ${citations.refs.factor}`,
    `- 핵심 질문: ${report.decisionQuestion || voice.decisionQuestion} ${citations.refs.constraint}`,
    `- 한 줄 판단: ${report.readerTakeaway || voice.readerTakeaway} ${citations.refs.factor}`,
  ].join('\n');
  const nextBlock = [
    appendCitation(report.implementationMemo || voice.implementationMemo, citations.refs.constraint),
    '',
    markdownList([
      appendCitation(report.nextComparison || voice.nextComparison, citations.refs.cost),
      ...recommendations,
    ].slice(0, 3), true),
  ].join('\n');
  const noteBlock = markdownList(notes.map((note, index) => appendCitation(
    note,
    index === 0 ? citations.refs.factor : citations.refs.baseline,
  )));

  const commonOpening = [
    `# ${title}`,
    '',
    voice.headline,
    '',
    focusTags.length ? `- ${focusTags.join('\n- ')}` : '',
    '',
  ].filter(Boolean);

  if (voice.layout === 'risk-first') {
    return [
      ...commonOpening,
      `## 1. ${h.summary}`,
      '',
      summary,
      '',
      decisionBlock,
      '',
      `## 2. ${h.analysis}`,
      '',
      sectionMarkdown,
      '',
      `## 3. ${h.action}`,
      '',
      nextBlock,
      '',
      `## 4. ${h.metrics}`,
      '',
      metricTable(context.metrics, citations),
      '',
      `## 5. ${h.placement}`,
      '',
      placementOverview(context.reportItems || [], context.metrics, citations),
      '',
      placementTable(context.reportItems || [], citations),
      '',
      `## 6. ${h.note}`,
      '',
      noteBlock,
      '',
      ...buildConstraintSection(context.metrics?.constraintSignals, citations),
    ].join('\n');
  }

  if (voice.layout === 'implementation-first') {
    return [
      ...commonOpening,
      `## 1. ${h.summary}`,
      '',
      summary,
      '',
      `## 2. ${h.action}`,
      '',
      nextBlock,
      '',
      `## 3. ${h.placement}`,
      '',
      placementOverview(context.reportItems || [], context.metrics, citations),
      '',
      placementTable(context.reportItems || [], citations),
      '',
      `## 4. ${h.metrics}`,
      '',
      metricTable(context.metrics, citations),
      '',
      `## 5. ${h.analysis}`,
      '',
      sectionMarkdown,
      '',
      `## 6. ${h.note}`,
      '',
      decisionBlock,
      '',
      noteBlock,
      '',
      ...buildConstraintSection(context.metrics?.constraintSignals, citations),
    ].join('\n');
  }

  return [
    ...commonOpening,
    `## 1. ${h.summary}`,
    '',
    summary,
    '',
    decisionBlock,
    '',
    `## 2. ${h.metrics}`,
    '',
    metricTable(context.metrics, citations),
    '',
    `## 3. ${h.placement}`,
    '',
    placementOverview(context.reportItems || [], context.metrics, citations),
    '',
    placementTable(context.reportItems || [], citations),
    '',
    `## 4. ${h.analysis}`,
    '',
    sectionMarkdown,
    '',
    `## 5. ${h.action}`,
    '',
    nextBlock,
    '',
    `## 6. ${h.note}`,
    '',
    noteBlock,
    '',
    ...buildConstraintSection(context.metrics?.constraintSignals, citations),
  ].join('\n');
}

function buildConstraintSection(constraintSignals, citations) {
  if (!constraintSignals) return [];
  const lines = [];
  const greenLoss = Number(constraintSignals.greenSacrificePenalty || 0);
  const rooftopUsage = Array.isArray(constraintSignals.rooftopUsage) ? constraintSignals.rooftopUsage : [];
  const doubleGuards = Array.isArray(constraintSignals.doubleCountGuards) ? constraintSignals.doubleCountGuards : [];
  const factorRef = citations?.refs?.factor || '';
  const constraintRef = citations?.refs?.constraint || '';

  if (greenLoss > 0 || rooftopUsage.length > 0 || doubleGuards.length > 0) {
    lines.push('## 6-A. 제약·트레이드오프 현황', '');
    if (greenLoss > 0) {
      lines.push(`- **녹지 훼손 손실**: -${Math.round(greenLoss).toLocaleString()} kgCO₂/년 (산림과학원 흡수계수 기준) ${factorRef}`);
      const breakdown = constraintSignals.greenSacrificeBreakdown || [];
      for (const b of breakdown.slice(0, 5)) {
        lines.push(`  - ${b.label} ${b.qty} 단위 @ ${b.zoneName} → -${Math.round(b.loss).toLocaleString()} kgCO₂/년 ${factorRef}`);
      }
    }
    if (rooftopUsage.length > 0) {
      lines.push(`- **옥상 가용면적 (건물 유형별 reserve 기준)**: ${constraintRef}`);
      lines.push(`  근거: 건축법 §119, 한국에너지공단 태양광 설치 원칙, 소방기본법 §7, 건물 유형별 설비·피난공간 확보 원칙 ${constraintRef}`);
      for (const r of rooftopUsage.slice(0, 8)) {
        const ratio = r.available > 0 ? Math.round((r.usage / r.available) * 100) : 0;
        const reservePct = r.reserveRatio ? Math.round(r.reserveRatio * 100) : 30;
        const flag = ratio > 100 ? ' ❌ 초과' : ratio >= 85 ? ' ⚠️ 임박' : '';
        lines.push(`  - ${r.zoneName}: ${Math.round(r.usage).toLocaleString()}/${Math.round(r.available).toLocaleString()}㎡ (사용률 ${ratio}%, reserve ${reservePct}%)${flag} ${constraintRef}`);
        if (r.reserveNote) lines.push(`    · 유형 근거: ${r.reserveNote}`);
        if (r.fixtureAreaM2 > 0) {
          const fxList = (r.fixtures || []).map((f) => `${f.label} ${Math.round(f.areaM2)}㎡`).join(', ');
          lines.push(`    · 공식/시설팀 확인 fixture: ${fxList} (합계 ${Math.round(r.fixtureAreaM2)}㎡) ${constraintRef}`);
          if (r.fixturesSource) lines.push(`    · fixture 출처: ${r.fixturesSource}`);
        }
      }
    }
    if (doubleGuards.length > 0) {
      const labels = doubleGuards.map((g) => g.label).join(', ');
      lines.push(`- **이중산정 방지 적용**: ${labels} — 설치 인프라 효과만 카운트, 사용량/제3자 실적과 합산 금지 ${factorRef}`);
    }
    lines.push('');
  }
  return lines;
}

export function normalizeReportResponse(raw, fallbackContext = {}) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const fallback = buildFallbackReport(fallbackContext);
  const createdAt = data.createdAt || new Date().toISOString();
  const citations = makeCitationRegistry(fallbackContext.reportItems || []);
  const report = {
    formatVersion: data.formatVersion || REPORT_FORMAT_VERSION,
    title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : fallback.title,
    headline: typeof data.headline === 'string' && data.headline.trim() ? data.headline.trim() : fallback.headline,
    reportType: typeof data.reportType === 'string' && data.reportType.trim() ? data.reportType.trim() : fallback.reportType,
    decisionQuestion: typeof data.decisionQuestion === 'string' && data.decisionQuestion.trim() ? data.decisionQuestion.trim() : fallback.decisionQuestion,
    readerTakeaway: typeof data.readerTakeaway === 'string' && data.readerTakeaway.trim() ? data.readerTakeaway.trim() : fallback.readerTakeaway,
    implementationMemo: typeof data.implementationMemo === 'string' && data.implementationMemo.trim() ? data.implementationMemo.trim() : fallback.implementationMemo,
    nextComparison: typeof data.nextComparison === 'string' && data.nextComparison.trim() ? data.nextComparison.trim() : fallback.nextComparison,
    summary: typeof data.summary === 'string' && data.summary.trim() ? data.summary.trim() : fallback.summary,
    strengths: normalizeListItems(data.strengths, fallback.strengths),
    warnings: normalizeListItems(data.warnings, fallback.warnings),
    recommendations: normalizeListItems(data.recommendations, fallback.recommendations),
    notes: normalizeListItems(data.notes, fallback.notes),
    sections: normalizeReportSections(data.sections, fallback.sections),
    focusTags: normalizeListItems(data.focusTags, fallback.focusTags).slice(0, 4),
    highlights: normalizeListItems(data.highlights, fallback.highlights).slice(0, 4),
    citations,
    createdAt,
    model: data.model,
  };
  const voice = buildReportVoice({ report, context: fallbackContext });
  report.visualSummary = buildScenarioVisualSummary({
    reportItems: fallbackContext.reportItems || [],
    metrics: fallbackContext.metrics || {},
    voice,
  });

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
  const insights = buildLocalInsights({ nickname, reportItems, metrics, analysisSignals, createdAt });
  const citations = makeCitationRegistry(reportItems);
  const report = {
    formatVersion: REPORT_FORMAT_VERSION,
    title: insights.title,
    headline: insights.headline,
    reportType: insights.reportType,
    decisionQuestion: insights.decisionQuestion,
    readerTakeaway: insights.readerTakeaway,
    implementationMemo: insights.implementationMemo,
    nextComparison: insights.nextComparison,
    summary: insights.summary,
    strengths: insights.strengths,
    warnings: insights.warnings,
    recommendations: insights.recommendations,
    notes: insights.notes,
    sections: insights.sections,
    focusTags: insights.focusTags,
    highlights: [
      insights.reportType,
      `신규 절감 ${formatKg(user.netSaving)}`,
      `예산 ${formatKrw(user.totalCost)}`,
      `에너지 ${formatKwh(user.energyKwh)}`,
    ],
    citations,
    createdAt,
  };
  const voice = buildReportVoice({ report, context: { nickname, reportItems, metrics } });
  report.visualSummary = buildScenarioVisualSummary({ reportItems, metrics, voice });

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
