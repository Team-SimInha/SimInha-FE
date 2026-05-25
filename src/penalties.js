/**
 * 현실적 탄소 절감 계산 엔진
 *
 * 1. 설치 탄소 (Embodied Carbon) — 제조·시공 시 발생하는 CO₂ (20년 상각)
 * 2. 수확체감 (Diminishing Returns) — 같은 유형 과다 설치 시 효율 저하
 * 3. 부정적 상호작용 (Negative Synergy) — 요소 간 간섭
 * 4. 규제 상한 (Regulatory Cap) — 법적·물리적 설치 한도
 * 5. 긍정적 시너지 (Positive Synergy) — 함께 설치하면 효과 증가
 */

import { DEFAULT_BUDGET, ITEM_MAP } from './items.js';
import { buildingRooftopAvailableArea, getBuildingZone, ROOFTOP_RESERVE_RATIO } from './zones.js';

const MILLION_KRW = 1000000;

function itemQty(item) {
  const qty = Number(item.qty ?? 1);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function itemUnitCoeff(item) {
  const meta = ITEM_MAP[item.type];
  return Number(item.effectiveCoeff ?? meta?.coeff ?? 0);
}

function sumItemField(items, field) {
  return items.reduce((sum, item) => {
    const meta = ITEM_MAP[item.type];
    return sum + Number(meta?.[field] ?? 0) * itemQty(item);
  }, 0);
}

function efficiencyPerMillion(netSaving, totalCost) {
  if (!totalCost) return netSaving > 0 ? Math.round(netSaving * 10) / 10 : 0;
  return Math.round((netSaving / (totalCost / MILLION_KRW)) * 10) / 10;
}

function formatQty(qty, type) {
  const unit = ITEM_MAP[type]?.unit || '개';
  return `${Number(qty.toFixed(2)).toLocaleString()}${unit}`;
}

// ─── 1. 설치 탄소 (kgCO₂, 제조+시공+운반, 20년 상각 → 연간 패널티) ───
const EMBODIED_CARBON = {
  solar_self:  { total: 1000, life: 20, note: '패널 제조(중국산 평균) + BOS + 설치' },
  solar_bipv:  { total: 1200, life: 20, note: 'BIPV 모듈 제조 + 외벽 시공' },
  solar_lease: { total: 0,    life: 20, note: '대학 부담 없음 (운영사 책임)' },
  led:         { total: 5,    life: 10, note: 'LED 조명기구 제조' },
  geothermal:  { total: 5000, life: 25, note: '시추(150m) + 히트펌프 + 배관' },
  bems:        { total: 200,  life: 15, note: '센서·서버·통신장비 제조' },
  ev:          { total: 500,  life: 15, note: '충전기 제조 + 전력 인프라' },
  rainwater:   { total: 2000, life: 30, note: '저류조 콘크리트 + 배관' },
  greenroof:   { total: 30,   life: 20, note: '방수층 + 토양 + 식재 (per ㎡)' },
  tree:        { total: -10,  life: 50, note: '묘목 탄소 < 식재 초기 흡수량 → 순이익' },
};

// ─── 2. 수확체감 — { threshold: 이 수 넘으면 감쇄 시작, decay: 추가 1개당 효율 감소% } ───
const DIMINISHING = {
  solar_self:  { threshold: 20, decay: 0.03, reason: '계통 역송 한계 — 자가소비율 하락' },
  solar_bipv:  { threshold: 15, decay: 0.04, reason: '적합 외벽 면적 소진' },
  led:         { threshold: 100, decay: 0.01, reason: '교체 대상 소진' },
  geothermal:  { threshold: 5,  decay: 0.08, reason: '지중 열간섭 — 보어홀 간 온도 경쟁' },
  bems:        { threshold: 3,  decay: 0.10, reason: '고효율 건물 먼저 적용, 남은 건물은 효과↓' },
  ev:          { threshold: 10, decay: 0.05, reason: '수전설비 용량 초과 → 증설비 탄소 발생' },
  tree:        { threshold: 50, decay: 0.02, reason: '밀식 시 광합성 경쟁, 개체별 흡수량↓' },
  greenroof:   { threshold: 200, decay: 0.005, reason: '적합 옥상 소진' },
  rainwater:   { threshold: 3,  decay: 0.15, reason: '집수 면적 대비 과잉 용량' },
};

// ─── 3. 부정적 상호작용 ───
const NEGATIVE_SYNERGY = [
  {
    items: ['solar_self', 'greenroof'],
    condition: 'same_zone',
    penalty: 0.15,
    reason: '☀️+🌿 태양광-그린루프 간섭: 패널 그림자가 식물 차광, 식물이 패널 효율 저하 (각 -15%)',
  },
  {
    items: ['solar_self', 'tree'],
    condition: 'nearby',      // 같은 구역 or 인접 구역
    radius: 0.0005,           // ~50m
    penalty: 0.20,
    affectedItem: 'solar_self',
    reason: '🌳→☀️ 수목 그림자: 인접 태양광 발전량 -20%',
  },
  {
    items: ['solar_bipv', 'tree'],
    condition: 'nearby',
    radius: 0.0004,
    penalty: 0.15,
    affectedItem: 'solar_bipv',
    reason: '🌳→🏗️ 수목 그림자: 인접 BIPV 효율 -15%',
  },
  {
    items: ['geothermal', 'geothermal'],
    condition: 'nearby',
    radius: 0.001,            // ~100m
    penalty: 0.10,
    reason: '🌡️×2 지열 열간섭: 보어홀 100m 이내 밀집 시 각 -10%',
  },
  {
    items: ['ev', 'ev'],
    condition: 'count',
    threshold: 10,
    penaltyPerExtra: 500,     // 추가 1기당 500 kgCO₂/년 (수전설비 증설 탄소)
    reason: '🔌 과밀: 10기 초과 시 수전설비 증설 필요 → 기당 +500 kgCO₂/년',
  },
];

// ─── 4. 긍정적 시너지 ───
const POSITIVE_SYNERGY = [
  {
    items: ['solar_self', 'ev'],
    condition: 'both_exist',
    bonus: 0.10,
    affectedItem: 'ev',
    reason: '☀️+🔌 태양광-EV 연계: 자가발전 직접충전 → EV 절감 +10%',
  },
  {
    items: ['solar_self', 'bems'],
    condition: 'both_exist',
    bonus: 0.08,
    affectedItem: 'solar_self',
    reason: '☀️+📊 태양광-BEMS 연계: 발전량 예측 최적화 → 태양광 효율 +8%',
  },
  {
    items: ['bems', 'led'],
    condition: 'both_exist',
    bonus: 0.12,
    affectedItem: 'led',
    reason: '📊+💡 BEMS-LED 연계: 재실감지 연동 → LED 절감 +12%',
  },
  {
    items: ['greenroof', 'rainwater'],
    condition: 'both_exist',
    bonus: 0.20,
    affectedItem: 'rainwater',
    reason: '🌿+💧 그린루프-빗물저류 연계: 관수 재활용 → 빗물 효과 +20%',
  },
];

// ─── 4-B. 옥상 가용면적 ── 단위당 옥상 점유면적 (㎡) ───
// solar_self: 1kW 패널 = 약 8㎡ (1m × 2m 모듈 × 4장 가정)
// greenroof: 1㎡ 단위 그대로
// 그 외 옥상 설치 아이템은 면적 경쟁 없음 (LED·BEMS = 실내, BIPV = 외벽)
const ROOFTOP_FOOTPRINT_PER_UNIT = {
  solar_self: 8,
  greenroof: 1,
};

// ─── 4-A. 녹지 훼손 트레이드오프 (kgCO₂/년 단위당 흡수량 손실) ───
// 산정 근거: 국립산림과학원 「산림 탄소흡수계수」 22 kgCO₂/그루 × 단위당 점유면적 × 녹지 식재밀도(0.1~0.2 그루/㎡)
// → 녹지 위 설치 시 그루터기·관목 훼손에 따른 흡수 손실. 효율 페널티(zones.js)와 별도로 절감량에서 직접 차감.
const GREEN_DAMAGE_PER_UNIT = {
  solar_self:  88,   // kW당 ~30㎡ 점유 × 0.13그루/㎡ × 22kg
  solar_bipv:  0,    // 외벽형 — 녹지 영향 없음
  ev:          66,   // 기당 ~15㎡ × 0.2그루/㎡ × 22kg
  geothermal:  44,   // RT당 ~2㎡ 시추 + 작업공간 훼손
  rainwater:   0,    // 빗물 저류는 녹지에 중립~긍정
  tree:        0,    // 수목 — 녹지에 추가 식재
  greenroof:   0,    // 옥상 전용
  bems:        0,    // 건물 전용
  led:         0,    // 건물 전용
};

// ─── 5. 규제 상한 ───
const REGULATORY_CAPS = {
  solar_self:  { max: 50,  reason: '캠퍼스 전체 옥상 면적 한계 + 소방법 보행통로 30% 확보' },
  solar_bipv:  { max: 30,  reason: '적합 외벽 면적 한계' },
  geothermal:  { max: 15,  reason: '캠퍼스 부지 면적 대비 시추 가능 수' },
  bems:        { max: 12,  reason: '캠퍼스 주요 건물 수' },
  ev:          { max: 30,  reason: '환경친화적자동차법 주차면수 비례 상한' },
  led:         { max: 500, reason: '캠퍼스 전체 교체 대상 조명 수 추정' },
  greenroof:   { max: 1000,reason: '적합 옥상 총 면적 (㎡)' },
  tree:        { max: 200, reason: '식재 가용 녹지 면적 한계' },
  rainwater:   { max: 5,   reason: '집수 면적 대비 경제적 최대 설치 수' },
};


// ─── 거리 계산 (경위도 → 근사 유클리드) ───
function dist(a, b) {
  const dlng = (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180);
  const dlat = a.lat - b.lat;
  return Math.sqrt(dlng * dlng + dlat * dlat);
}


/**
 * 전체 아이템 목록을 받아 현실적 절감량을 계산
 * @param {Array} items — [{ id, type, lng, lat, qty, zoneName, ... }]
 * @returns {{ grossSaving, embodiedPenalty, diminishingPenalty, synergyPenalty, synergyBonus, netSaving, warnings[], details[] }}
 */
export function calculateRealistic(items) {
  const warnings = [];
  const details = [];

  // 유형별 수량
  const counts = {};
  items.forEach((it) => {
    counts[it.type] = (counts[it.type] || 0) + itemQty(it);
  });

  // ── 규제 상한 체크 ──
  for (const [type, cap] of Object.entries(REGULATORY_CAPS)) {
    if ((counts[type] || 0) > cap.max) {
      warnings.push(`⚠️ ${ITEM_MAP[type]?.label} ${formatQty(counts[type], type)} → 상한 ${formatQty(cap.max, type)} 초과! (${cap.reason})`);
    }
  }

  // ── 개별 아이템 기본 절감량 ──
  let grossSaving = 0;
  const perItem = items.map((it, idx) => {
    const meta = ITEM_MAP[it.type];
    const qty = itemQty(it);
    const unitCoeff = itemUnitCoeff(it);
    const baseCoeff = unitCoeff * qty;
    grossSaving += baseCoeff;
    return { ...it, idx, qty, unitCoeff, baseCoeff, adjustedCoeff: baseCoeff };
  });

  // ── 1. 설치 탄소 (Embodied Carbon) ──
  let embodiedPenalty = 0;
  for (const it of perItem) {
    const ec = EMBODIED_CARBON[it.type];
    if (ec) {
      const annual = (ec.total / ec.life) * it.qty;
      embodiedPenalty += annual;
    }
  }

  // ── 2. 수확체감 ──
  let diminishingPenalty = 0;
  const typeGroups = {};
  perItem.forEach((it) => {
    if (!typeGroups[it.type]) typeGroups[it.type] = [];
    typeGroups[it.type].push(it);
  });

  for (const [type, group] of Object.entries(typeGroups)) {
    const dim = DIMINISHING[type];
    const totalQty = counts[type] || 0;
    if (!dim || totalQty <= dim.threshold) continue;

    let seenQty = 0;
    for (const item of group) {
      const beforeExcess = Math.max(0, seenQty - dim.threshold);
      const afterExcess = Math.max(0, seenQty + item.qty - dim.threshold);
      const excessQtyForItem = afterExcess - beforeExcess;
      seenQty += item.qty;

      if (excessQtyForItem <= 0) continue;
      const excessRatio = Math.min(excessQtyForItem / item.qty, 1);
      const avgExcessPosition = beforeExcess + excessQtyForItem / 2;
      const reductionRate = Math.min(dim.decay * avgExcessPosition, 0.8);
      const penalty = item.adjustedCoeff * excessRatio * reductionRate;
      item.adjustedCoeff -= penalty;
      diminishingPenalty += penalty;
    }

    const excess = totalQty - dim.threshold;
    details.push(`📉 ${ITEM_MAP[type]?.label} 수확체감: ${formatQty(dim.threshold, type)} 초과분 ${formatQty(excess, type)} 효율↓ (${dim.reason})`);
  }

  // ── 3. 부정적 상호작용 ──
  let synergyPenalty = 0;

  for (const rule of NEGATIVE_SYNERGY) {
    if (rule.condition === 'same_zone') {
      // 같은 구역에 두 유형이 공존
      const zonesA = new Set(perItem.filter((it) => it.type === rule.items[0]).map((it) => it.zoneName));
      const itemsB = perItem.filter((it) => it.type === rule.items[1] && zonesA.has(it.zoneName));
      const itemsA = perItem.filter((it) => it.type === rule.items[0] && zonesA.has(it.zoneName));
      if (itemsA.length > 0 && itemsB.length > 0) {
        const pen = [...itemsA, ...itemsB].reduce((s, it) => {
          const p = it.adjustedCoeff * rule.penalty;
          it.adjustedCoeff -= p;
          return s + p;
        }, 0);
        synergyPenalty += pen;
        details.push(rule.reason);
      }
    }

    if (rule.condition === 'nearby') {
      if (rule.items[0] === rule.items[1]) {
        // 같은 유형 근접 (지열 등)
        const group = perItem.filter((it) => it.type === rule.items[0]);
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            if (dist(group[i], group[j]) < rule.radius) {
              const p1 = group[i].adjustedCoeff * rule.penalty;
              const p2 = group[j].adjustedCoeff * rule.penalty;
              group[i].adjustedCoeff -= p1;
              group[j].adjustedCoeff -= p2;
              synergyPenalty += p1 + p2;
            }
          }
        }
        if (synergyPenalty > 0 && group.length > 1) {
          details.push(rule.reason);
        }
      } else {
        // 다른 유형 근접 (수목→태양광 등)
        const groupA = perItem.filter((it) => it.type === rule.items[0]);
        const groupB = perItem.filter((it) => it.type === rule.items[1]);
        const affected = rule.affectedItem === rule.items[0] ? groupA : groupB;
        const other = rule.affectedItem === rule.items[0] ? groupB : groupA;
        let hit = false;
        for (const a of affected) {
          for (const b of other) {
            if (dist(a, b) < rule.radius) {
              const p = a.adjustedCoeff * rule.penalty;
              a.adjustedCoeff -= p;
              synergyPenalty += p;
              hit = true;
            }
          }
        }
        if (hit) details.push(rule.reason);
      }
    }

    if (rule.condition === 'count') {
      const cnt = counts[rule.items[0]] || 0;
      if (cnt > rule.threshold) {
        const excess = cnt - rule.threshold;
        const pen = excess * rule.penaltyPerExtra;
        synergyPenalty += pen;
        details.push(`${rule.reason} (초과 ${formatQty(excess, rule.items[0])} → +${Math.round(pen).toLocaleString()} kgCO₂/년)`);
      }
    }
  }

  // ── 4-A. 녹지 훼손 트레이드오프 ──
  let greenSacrificePenalty = 0;
  const greenSacrificeBreakdown = [];
  for (const item of perItem) {
    if (item.zoneType !== 'green') continue;
    const lossPerUnit = GREEN_DAMAGE_PER_UNIT[item.type] || 0;
    if (lossPerUnit <= 0) continue;
    const loss = lossPerUnit * item.qty;
    item.adjustedCoeff = Math.max(0, item.adjustedCoeff - loss);
    greenSacrificePenalty += loss;
    greenSacrificeBreakdown.push({
      type: item.type,
      label: ITEM_MAP[item.type]?.label || item.type,
      zoneName: item.zoneName || '녹지',
      qty: item.qty,
      loss,
    });
  }
  if (greenSacrificePenalty > 0) {
    const items = greenSacrificeBreakdown
      .map((b) => `${b.label} ${formatQty(b.qty, b.type)} @ ${b.zoneName} (-${Math.round(b.loss).toLocaleString()} kgCO₂/년)`)
      .join(', ');
    details.push(`🌳 녹지 훼손 트레이드오프: ${items} → 합계 -${Math.round(greenSacrificePenalty).toLocaleString()} kgCO₂/년 (산림 흡수 손실)`);
  }

  // ── 4-C. 이중산정 방지 메타 (시그널) ──
  // items.js avoidsDoubleCounting 필드를 가진 설비를 추출해 details/AI 프롬프트에 노출
  const doubleCountGuards = [];
  const guardedTypes = new Set();
  for (const item of perItem) {
    const meta = ITEM_MAP[item.type];
    if (!meta?.avoidsDoubleCounting?.length) continue;
    if (guardedTypes.has(item.type)) continue;
    guardedTypes.add(item.type);
    doubleCountGuards.push({
      type: item.type,
      label: meta.label,
      avoidsDoubleCounting: meta.avoidsDoubleCounting,
    });
  }
  if (doubleCountGuards.length > 0) {
    const guardText = doubleCountGuards
      .map((g) => `${g.label} (보호 항목: ${g.avoidsDoubleCounting.join(', ')})`)
      .join('; ');
    details.push(`🔒 이중산정 방지: ${guardText} — 설치 인프라 효과만 카운트, 별도 사용량/제3자 실적과 합산 금지`);
  }

  // ── 4-B. 옥상 가용면적 (공조설비/통로 제외) ──
  const rooftopUsageByZone = {};
  for (const item of perItem) {
    const footprint = ROOFTOP_FOOTPRINT_PER_UNIT[item.type];
    if (!footprint || !item.zoneId) continue;
    const zone = getBuildingZone(item.zoneId);
    if (!zone) continue;
    if (!rooftopUsageByZone[item.zoneId]) {
      rooftopUsageByZone[item.zoneId] = {
        zoneName: zone.name || item.zoneId,
        usage: 0,
        available: buildingRooftopAvailableArea(item.zoneId),
        items: [],
      };
    }
    const used = footprint * item.qty;
    rooftopUsageByZone[item.zoneId].usage += used;
    rooftopUsageByZone[item.zoneId].items.push({
      type: item.type,
      label: ITEM_MAP[item.type]?.label || item.type,
      qty: item.qty,
      area: used,
    });
  }
  const rooftopReports = Object.values(rooftopUsageByZone);
  for (const r of rooftopReports) {
    if (r.available <= 0) continue;
    const ratio = r.usage / r.available;
    if (ratio > 1.0) {
      warnings.push(
        `⚠️ ${r.zoneName} 옥상 면적 초과: ${Math.round(r.usage).toLocaleString()}㎡ 필요 vs ${Math.round(r.available).toLocaleString()}㎡ 가용 (실측 footprint × ${Math.round((1 - ROOFTOP_RESERVE_RATIO) * 100)}%, 공조설비·승강기·통로 ${Math.round(ROOFTOP_RESERVE_RATIO * 100)}% 제외)`
      );
    } else if (ratio > 0.85) {
      details.push(
        `🏢 ${r.zoneName} 옥상 사용률 ${Math.round(ratio * 100)}% (${Math.round(r.usage).toLocaleString()}/${Math.round(r.available).toLocaleString()}㎡) — 추가 설치 시 공조설비 충돌 위험`
      );
    }
  }

  // ── 4. 긍정적 시너지 ──
  let synergyBonus = 0;

  for (const rule of POSITIVE_SYNERGY) {
    const hasA = (counts[rule.items[0]] || 0) > 0;
    const hasB = (counts[rule.items[1]] || 0) > 0;
    if (hasA && hasB) {
      const affected = perItem.filter((it) => it.type === rule.affectedItem);
      const bonus = affected.reduce((s, it) => {
        const b = it.adjustedCoeff * rule.bonus;
        it.adjustedCoeff += b;
        return s + b;
      }, 0);
      synergyBonus += bonus;
      details.push(`✅ ${rule.reason}`);
    }
  }

  // ── 최종 합산 ──
  const adjustedSaving = perItem.reduce((s, it) => s + it.adjustedCoeff, 0);
  const netSaving = Math.round(adjustedSaving - embodiedPenalty);
  const totalCost = Math.round(sumItemField(items, 'cost'));
  const energyKwh = Math.round(sumItemField(items, 'energyKwh'));
  const efficiencyScore = efficiencyPerMillion(netSaving, totalCost);
  const carbonScore = Math.max(0, netSaving);

  return {
    grossSaving: Math.round(grossSaving),
    embodiedPenalty: Math.round(embodiedPenalty),
    diminishingPenalty: Math.round(diminishingPenalty),
    synergyPenalty: Math.round(synergyPenalty),
    synergyBonus: Math.round(synergyBonus),
    greenSacrificePenalty: Math.round(greenSacrificePenalty),
    greenSacrificeBreakdown,
    rooftopUsage: rooftopReports,
    doubleCountGuards,
    netSaving,
    carbonScore,
    energyKwh,
    totalCost,
    efficiencyScore,
    warnings,
    details,
    perItem,
  };
}

export function calculateDashboardMetrics(items = [], baselineItems = [], budget = DEFAULT_BUDGET) {
  const user = calculateRealistic(items);
  const baseline = calculateRealistic(baselineItems);
  const total = calculateRealistic([...baselineItems, ...items]);
  const usedBudget = user.totalCost;

  return {
    budget,
    usedBudget,
    remainingBudget: budget - usedBudget,
    isOverBudget: usedBudget > budget,
    user,
    baseline,
    total,
    itemCount: items.length,
    baselineItemCount: baselineItems.length,
  };
}
