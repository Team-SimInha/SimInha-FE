/**
 * 연도별 친환경 설비 단가 예측치 (학습곡선 기반)
 *
 * 기준연도(BASE_YEAR) 의 items.js 단가를 baseline 으로,
 * 연도별 단가 = baseCost × (1 − declineRate) ^ (year − BASE_YEAR)
 *
 * ── 근거 출처 ──
 * - 기후에너지환경부 「2026년도 재생에너지보급(건물지원) 사업 공고」 — 건물 태양광/BIPV 보급지원 기준
 * - IEA 「World Energy Outlook 2024」 — 기술별 LCOE / 자본단가 전망 (Net Zero 시나리오)
 * - IRENA 「Renewable Power Generation Costs in 2023」 — 학습곡선 분석
 * - 한국에너지경제연구원 「에너지수급전망 2023-2050」
 * - 산업통상자원부 「제10차 전력수급기본계획」 (2023) — 신재생 단가 추이
 * - IEA 「The Future of Heat Pumps」 (2022) — 히트펌프 단가 전망
 *
 * 모든 declineRate 는 위 자료의 평균치·중간값을 보수적으로 채택한 추정치.
 * 한국 시장 특성(보조금·인건비)에 따라 실측과 차이 있을 수 있음 → 인하대 실데이터 확보 시 보정 예정.
 */

export const BASE_YEAR = 2026;

// 연간 단가 하락률 (예: 0.06 = -6%/년)
export const COST_DECLINE_RATE = {
  solar_self:  0.06, // IEA WEO 평균 ~6%/년, IRENA 학습률 18~22%
  solar_bipv:  0.04, // 시장 작아 학습효과 완만, 4%/년 보수 추정
  solar_lease: 0.00, // 단가 무관 (귀속 X)
  led:         0.02, // 성숙 기술, 2%/년 (환경부 LED 보급사업 단가 추이)
  geothermal:  0.02, // IEA 히트펌프 보고서 ~2%/년 (학습곡선 완만)
  bems:        0.04, // 소프트웨어 비중 높아 BNEF 추정 ~4%/년
  ev:          0.04, // 배터리·인버터 가격 하락 영향 ~4%/년
  rainwater:   0.01, // civil 작업 위주, 인건비 영향 ~1%/년
  greenroof:   0.01, // 자재·식재 인건비, 인플레이션 상쇄 ~1%/년
  tree:        0.00, // 묘목·식재비 안정
};

export const COST_FORECAST_NOTE =
  `기준연도 ${BASE_YEAR}년 대비 기후에너지환경부·한국에너지공단 보급지원 기준과 IEA·IRENA·한국에너지경제연구원 전망을 보수 적용. ` +
  `보조금·인건비 변화로 실측과 차이 가능 — 시설팀 실데이터 확보 시 보정 예정.`;

export const COST_FORECAST_SOURCES = [
  '기후에너지환경부 「2026년도 재생에너지보급(건물지원) 사업 공고」',
  'IEA 「World Energy Outlook 2024」 (Net Zero 시나리오 자본단가 전망)',
  'IRENA 「Renewable Power Generation Costs in 2023」 (학습곡선 분석)',
  '한국에너지경제연구원 「에너지수급전망 2023-2050」',
  '산업통상자원부 「제10차 전력수급기본계획」 (2023) — 신재생 단가 추이',
  'IEA 「The Future of Heat Pumps」 (2022) — 지열·히트펌프 단가',
];

/**
 * 연도별 단가 배수 (1.0 = 변동 없음, 0.7 = 30% 하락)
 */
export function getCostMultiplier(itemType, year) {
  const rate = COST_DECLINE_RATE[itemType];
  if (typeof rate !== 'number') return 1.0;
  const yearDelta = (Number(year) || BASE_YEAR) - BASE_YEAR;
  if (yearDelta <= 0) return 1.0; // 과거 연도는 기준연도 단가 유지
  return Math.pow(1 - rate, yearDelta);
}

/**
 * 특정 연도의 단위당 단가(원)
 */
export function getEffectiveCost(itemType, year, baseCost) {
  const multiplier = getCostMultiplier(itemType, year);
  return Math.round(Number(baseCost || 0) * multiplier);
}
