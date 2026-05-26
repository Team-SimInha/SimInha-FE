const REPORT_FORMAT_VERSION = 'inha-carbon-report.v1';
const DEFAULT_MODEL = 'solar-pro3';

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function list(value, fallback = []) {
  if (!Array.isArray(value)) return fallback;
  const normalized = value
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim())
    .slice(0, 3);
  return normalized.length ? normalized : fallback;
}

function formatLocation(item) {
  return text(item.locationName || item.zoneName, '일반 구역');
}

function compactReason(item) {
  return text(item.placementReason || item.zoneReason || item.zoneNote, '기본 설치 조건')
    .replace(/[✅⚠️❌📉🌳☀️🔌💡📊🌿💧🏗️🌡️]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function summarizePlacements(items) {
  const labels = [...new Set(items.map((item) => item.label).filter(Boolean))];
  const locations = countBy(items, formatLocation).slice(0, 5).map(([name, count]) => ({ name, count }));
  const rows = new Map();
  for (const item of items) {
    const location = formatLocation(item);
    const label = text(item.label, item.type || '설비');
    const key = `${location}::${label}`;
    const current = rows.get(key) || {
      location,
      label,
      qty: 0,
      unit: item.unit || '개',
      savingKgCO2PerYear: 0,
      costKrw: 0,
      reason: compactReason(item),
    };
    current.qty += number(item.qty || 1);
    current.savingKgCO2PerYear += number(item.savingKgCO2PerYear);
    current.costKrw += number(item.costKrw);
    rows.set(key, current);
  }
  return {
    itemCount: items.length,
    typeCount: labels.length,
    labels,
    mainLocations: locations,
    compactRows: [...rows.values()].sort((a, b) => b.savingKgCO2PerYear - a.savingKgCO2PerYear).slice(0, 8),
  };
}

function compactConstraints(metrics) {
  const c = metrics?.constraintSignals || {};
  return {
    greenSacrificePenaltyKgCO2: number(c.greenSacrificePenalty),
    greenSacrificeBreakdown: Array.isArray(c.greenSacrificeBreakdown)
      ? c.greenSacrificeBreakdown.slice(0, 8).map((b) => ({
        type: b.type,
        label: b.label,
        zoneName: b.zoneName,
        qty: number(b.qty),
        lossKgCO2: number(b.loss),
      }))
      : [],
    rooftopUsage: Array.isArray(c.rooftopUsage)
      ? c.rooftopUsage.slice(0, 10).map((r) => ({
        zoneName: r.zoneName,
        zoneType: r.zoneType || null,
        usageM2: Math.round(number(r.usage)),
        availableM2: Math.round(number(r.available)),
        utilizationPct: r.available > 0 ? Math.round((number(r.usage) / number(r.available)) * 100) : 0,
        reservePct: r.reserveRatio ? Math.round(r.reserveRatio * 100) : 30,
        reserveNote: r.reserveNote || '',
        fixtureAreaM2: Math.round(number(r.fixtureAreaM2 || 0)),
        fixtures: Array.isArray(r.fixtures) ? r.fixtures.slice(0, 6).map((f) => ({
          type: f.type, label: f.label, areaM2: Math.round(number(f.areaM2 || 0)),
        })) : [],
        fixturesSource: r.fixturesSource || '',
        items: Array.isArray(r.items) ? r.items.slice(0, 5) : [],
      }))
      : [],
    doubleCountGuards: Array.isArray(c.doubleCountGuards) ? c.doubleCountGuards : [],
    embodiedPenaltyKgCO2: number(c.embodiedPenalty),
    diminishingPenaltyKgCO2: number(c.diminishingPenalty),
    synergyPenaltyKgCO2: number(c.synergyPenalty),
    synergyBonusKgCO2: number(c.synergyBonus),
  };
}

function buildDensitySummary(items) {
  const byZone = {};
  for (const it of items) {
    const k = formatLocation(it);
    if (!byZone[k]) byZone[k] = { zoneName: k, count: 0, types: new Set() };
    byZone[k].count += number(it.qty || 1);
    byZone[k].types.add(it.label || it.type);
  }
  return Object.values(byZone)
    .map((z) => ({ zoneName: z.zoneName, count: z.count, typeCount: z.types.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function compactScenario(payload) {
  const metrics = payload?.metrics || {};
  const user = metrics.user || {};
  const baseline = metrics.baseline || {};
  const total = metrics.total || {};
  const budget = number(metrics.budget);
  const usedBudget = number(metrics.usedBudget || user.totalCost);
  const items = Array.isArray(payload?.items)
    ? payload.items.slice(0, 50).map((item) => ({
      type: item.type,
      label: item.label || item.type,
      qty: number(item.qty || 1),
      unit: item.unit || '개',
      locationName: formatLocation(item),
      zoneName: item.zoneName || '',
      zoneId: item.zoneId || '',
      zoneType: item.zoneType || '',
      zoneYear: item.zoneYear || null,
      zoneFloors: item.zoneFloors || null,
      zoneNote: item.zoneNote || '',
      placementReason: compactReason(item),
      lng: number(item.lng),
      lat: number(item.lat),
      efficiencyRate: number(item.efficiencyRate || 100),
      costKrw: number(item.costKrw),
      savingKgCO2PerYear: number(item.savingKgCO2PerYear),
      energyKwhPerYear: number(item.energyKwhPerYear),
    }))
    : [];

  return {
    scenario: {
      nickname: text(payload?.nickname, '사용자'),
      budgetKrw: budget,
      usedBudgetKrw: usedBudget,
      remainingBudgetKrw: number(metrics.remainingBudget || budget - usedBudget),
    },
    metrics: {
      newPlacement: {
        netSavingKgCO2PerYear: number(user.netSaving),
        energyKwhPerYear: number(user.energyKwh),
        totalCostKrw: number(user.totalCost),
        efficiencyKgCO2PerMillionKrw: number(user.efficiencyScore),
      },
      baseline: {
        netSavingKgCO2PerYear: number(baseline.netSaving),
        energyKwhPerYear: number(baseline.energyKwh),
      },
      total: {
        netSavingKgCO2PerYear: number(total.netSaving),
        energyKwhPerYear: number(total.energyKwh),
      },
    },
    placementSummary: summarizePlacements(items),
    densitySummary: buildDensitySummary(items),
    constraintSignals: compactConstraints(metrics),
    items,
    analysisSignals: payload?.analysisSignals || {},
  };
}

function promptFor(input) {
  return [
    '너는 대학 캠퍼스 탄소중립 정책 시뮬레이션을 검토하는 에너지 정책 컨설턴트다.',
    '대상 독자는 시설팀·ESG 추진단·경진대회 심사위원이며, 학생 개인 행동 분석이 아닌 인프라 의사결정 보조가 목적이다.',
    '아래 JSON 데이터만 근거로 사용해 한국어 분석 내용을 작성하라.',
    '',
    '반드시 JSON 객체만 반환한다. Markdown 문서 전체를 만들지 않는다.',
    '반환 필드는 정확히 다음 형태를 따른다:',
    JSON.stringify({
      formatVersion: REPORT_FORMAT_VERSION,
      summary: '한 문단 요약',
      strengths: ['잘한 점 1', '잘한 점 2'],
      warnings: ['주의할 점 1', '주의할 점 2'],
      recommendations: ['개선 제안 1', '개선 제안 2', '개선 제안 3'],
      notes: ['유의 사항 1'],
    }, null, 2),
    '',
    '기본 규칙:',
    '- newPlacement 값은 사용자 신규 배치 성과다.',
    '- baseline 값은 기존 설비 성과다.',
    '- total 값을 신규 배치 성과처럼 말하지 않는다.',
    '- summary 첫 문장에는 반드시 "신규 배치", "기존 설비", "총 절감량"을 각각 분리해서 쓴다.',
    '- items의 locationName, placementReason, efficiencyRate를 반영해 어디에 무엇을 배치했는지 구체적으로 언급한다.',
    '- 배치가 달라지면 문장도 달라져야 한다. 숫자만 바꾼 일반론을 쓰지 않는다.',
    '- placementSummary.compactRows를 우선 참고해 핵심 배치 1~3개를 짚는다.',
    '- 설비 수량은 입력의 unit을 붙여 표현한다. 예: 태양광 5 kW, LED 20 개.',
    '- 숫자는 kgCO2/년, kWh/년, 원 단위를 유지한다.',
    '- 추정 데이터는 확정 사실처럼 말하지 않는다.',
    '- strengths, warnings, recommendations, notes는 각각 1~3개로 제한한다.',
    '',
    '제약 / 트레이드오프 / 밀집도 규칙 (constraintSignals 와 densitySummary 활용):',
    '- constraintSignals.greenSacrificePenaltyKgCO2 > 0 이면 녹지 훼손 트레이드오프를 warnings 또는 recommendations 에 반드시 명시한다. greenSacrificeBreakdown 의 zoneName 과 lossKgCO2 를 인용한다.',
    '- constraintSignals.rooftopUsage 에서 utilizationPct >= 100 인 건물은 옥상 면적 초과로 warnings 에 강하게 언급한다 (각 항목의 reservePct·reserveNote 와 fixtureAreaM2·fixtures 를 인용해 노후/신축/의료 등 건물 유형별 점유율 차등 근거 [건축법 §119, 한국에너지공단 태양광 가이드, 소방기본법 §7] + 항공사진 관찰 fixture[실외기·물탱크·헬리포트 등]를 함께 명시). utilizationPct 85~99 는 주의 수준으로 언급한다.',
    '- constraintSignals.doubleCountGuards 에 항목이 있으면 notes 에 "설치 인프라 효과만 카운트, 사용량/제3자 실적과 합산 금지" 라는 취지를 한 문장으로 포함한다 (특히 부지대여형 태양광, BEMS-LED 시너지).',
    '- constraintSignals.embodiedPenaltyKgCO2 와 diminishingPenaltyKgCO2 가 grossSaving 의 25% 를 넘으면 warnings 에 "설치 탄소·수확체감으로 인한 효과 감쇄" 를 명시한다.',
    '- densitySummary 의 상위 zoneName 1~2 곳을 인용해 배치 밀집·분산 패턴을 strengths 또는 recommendations 에 반영한다.',
    '- 모든 수치는 공인 가이드라인(한국에너지공단·한전 배출계수·산림과학원·환경부 등) 기반 추정치임을 한 번 이상 notes 에 명시한다.',
    '- 학생 개인 실천(영수증·교통수단·생활 행동)에 대한 권고는 만들지 않는다. 정책·시설 의사결정 권고만 작성한다.',
    '',
    '입력 JSON:',
    JSON.stringify(input, null, 2),
  ].join('\n');
}

function parseModelJson(content) {
  const raw = text(content);
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON object in model response');
  return JSON.parse(candidate.slice(start, end + 1));
}

function fallback(input) {
  const nickname = input.scenario.nickname || '사용자';
  return {
    formatVersion: REPORT_FORMAT_VERSION,
    summary: `${nickname} 시나리오는 신규 배치와 기존 설비 베이스라인을 분리해 해석해야 합니다.`,
    strengths: ['계산 지표를 기준으로 신규 배치 성과를 확인할 수 있습니다.'],
    warnings: ['일부 데이터는 MVP 추정값이므로 실제 자료로 보정이 필요합니다.'],
    recommendations: ['비용 대비 절감 효율이 높은 설비를 우선 확대하세요.'],
    notes: ['본 리포트는 시뮬레이션 데이터를 기준으로 생성되었습니다.'],
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.UPSTAGE_API_KEY;
  if (!apiKey) {
    sendJson(res, 500, { error: 'UPSTAGE_API_KEY is not configured' });
    return;
  }

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const input = compactScenario(payload || {});
    const model = process.env.UPSTAGE_MODEL || DEFAULT_MODEL;
    const response = await fetch('https://api.upstage.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You return strict JSON only. Do not wrap JSON in markdown fences.' },
          { role: 'user', content: promptFor(input) },
        ],
        temperature: 0.2,
        stream: false,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      sendJson(res, response.status, {
        error: 'Upstage request failed',
        detail: data?.error?.message || data?.message || 'Unknown upstream error',
      });
      return;
    }

    const parsed = parseModelJson(data?.choices?.[0]?.message?.content || '');
    const defaults = fallback(input);
    sendJson(res, 200, {
      formatVersion: REPORT_FORMAT_VERSION,
      summary: text(parsed.summary, defaults.summary),
      strengths: list(parsed.strengths, defaults.strengths),
      warnings: list(parsed.warnings, defaults.warnings),
      recommendations: list(parsed.recommendations, defaults.recommendations),
      notes: list(parsed.notes, defaults.notes),
      createdAt: new Date().toISOString(),
      model,
    });
  } catch (error) {
    sendJson(res, 500, {
      error: 'Report generation failed',
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
