/**
 * 배치 요소 정의
 *
 * cost: 설치 단위당 비용(KRW)
 * energyKwh: 설치 단위당 연간 생산/절감 전력량(kWh)
 * coeff: 단위당 연간 CO₂ 감축량 (kgCO₂eq/년)
 * source: 단위당 수치 산정의 공인 출처 (가이드라인·통계·표준)
 *
 * ※ 모든 단가·계수는 공인 가이드라인 기반 추정치이며, 실제 설치 시 현장조건에 따라 변동.
 *   인하대 실데이터 확보 후 보정 예정.
 *
 * model3d: 실제 3D 익스트루전 렌더링 정보
 *   shape, radius, height, onRoof, color, topColor, hasPole, poleColor (생략)
 */

export const OFFICIAL_FACTORS = {
  electricityEmissionFactorKgPerKwh: 0.4173,
  electricityEmissionFactorSource: '기후에너지환경부 보도자료(2025.12.18) — 2023년도 전력배출계수 0.4173 tCO₂eq/MWh',
  solarCapacityFactor: 0.15,
  solarCapacityFactorSource: '기후에너지환경부 K-Taxonomy 적합성판단 참고서 — 150kW 미만 태양광 이용률 15%',
  ledBeforeW: 29,
  ledAfterW: 11,
  ledHoursPerYear: 3650,
  ledSource: '기후에너지환경부 K-Taxonomy 적합성판단 참고서 — 형광등 29W, LED 11W, 연 3,650시간 예시',
  treeKgCO2PerYear: 10,
  treeSource: '국립산림과학원 주요 산림수종 표준 탄소흡수량 — 30~40년생 주요 수종 평균치 보수 적용',
};

const EF = OFFICIAL_FACTORS.electricityEmissionFactorKgPerKwh;
const SOLAR_KWH_PER_KW = Math.round(8760 * OFFICIAL_FACTORS.solarCapacityFactor);
const SOLAR_CO2_PER_KW = Math.round(SOLAR_KWH_PER_KW * EF);
const BIPV_DERATE = 0.85;
const BIPV_KWH_PER_KW = Math.round(SOLAR_KWH_PER_KW * BIPV_DERATE);
const BIPV_CO2_PER_KW = Math.round(BIPV_KWH_PER_KW * EF);
const LED_KWH_PER_UNIT = Math.round(((OFFICIAL_FACTORS.ledBeforeW - OFFICIAL_FACTORS.ledAfterW) * OFFICIAL_FACTORS.ledHoursPerYear) / 1000);
const LED_CO2_PER_UNIT = Math.round(LED_KWH_PER_UNIT * EF);

export const ITEM_TYPES = [
  // ── 에너지 생산 ──
  { id: 'solar_self', label: '자가소비 태양광', icon: '☀️', coeff: SOLAR_CO2_PER_KW, unit: 'kW', color: '#f2cc60', group: '에너지 생산',
    cost: 1500000, energyKwh: SOLAR_KWH_PER_KW,
    desc: '옥상 설치, 자가소비 → Scope2 직접 감소',
    source: `${OFFICIAL_FACTORS.solarCapacityFactorSource} · ${OFFICIAL_FACTORS.electricityEmissionFactorSource}`,
    model3d: { shape: 'panel_array', radius: 0.00010, height: 0.8, onRoof: true,
               color: '#0d1a3a', topColor: '#2e4a8a', arrayRows: 2, arrayCols: 4 } },

  { id: 'solar_bipv', label: 'BIPV (건물일체형)', icon: '🏗️', coeff: BIPV_CO2_PER_KW, unit: 'kW', color: '#e0a830', group: '에너지 생산',
    cost: 3000000, energyKwh: BIPV_KWH_PER_KW,
    desc: '벽면·유리 통합, 일반 옥상 PV 대비 보수계수 85% 적용',
    source: `기후에너지환경부 K-Taxonomy 태양광 산식 · 산업통상자원부 BIPV 산업생태계 활성화 방안 · KS C 8577 BIPV 성능평가 기준 · ${OFFICIAL_FACTORS.electricityEmissionFactorSource}`,
    model3d: { shape: 'panel_array', radius: 0.00009, height: 4, onRoof: true,
               color: '#5a4a1f', topColor: '#e0a830', arrayRows: 1, arrayCols: 5 } },

  { id: 'solar_lease', label: '부지대여 태양광', icon: '⚠️', coeff: 0, unit: 'kW', color: '#6e7681', group: '에너지 생산',
    cost: 0, energyKwh: 0,
    desc: '감축 실적 대학 귀속 불가 (현재 인하대 방식)',
    source: '신재생에너지 공급의무화제도 및 연료 혼합의무화제도 관리·운영지침 — REC/감축실적 귀속 주체 확인 필요',
    avoidsDoubleCounting: ['third_party_operator_claim'],
    model3d: { shape: 'panel_array', radius: 0.00010, height: 0.8, onRoof: false,
               color: '#1a1a1a', topColor: '#3a3a3a', arrayRows: 2, arrayCols: 4 } },

  // ── 에너지 절감 ──
  { id: 'led', label: 'LED 조명 교체', icon: '💡', coeff: LED_CO2_PER_UNIT, unit: '개', color: '#58a6ff', group: '에너지 절감',
    cost: 50000, energyKwh: LED_KWH_PER_UNIT,
    desc: '형광등 29W→LED 11W, 연 3,650시간 기준',
    source: `${OFFICIAL_FACTORS.ledSource} · ${OFFICIAL_FACTORS.electricityEmissionFactorSource}`,
    model3d: { shape: 'circle', radius: 0.00002, height: 0.4, onRoof: true,
               color: '#a5d8ff', topColor: '#ffeb70' } },

  { id: 'geothermal', label: '지열 히트펌프', icon: '🌡️', coeff: Math.round(3300 * EF), unit: 'RT', color: '#f78166', group: '에너지 절감',
    cost: 5000000, energyKwh: 3300,
    desc: '냉난방 동시, 기존 보일러 대비 60% 절감',
    source: `한국에너지공단 신재생에너지 보급사업 지열 설비 기준 · ${OFFICIAL_FACTORS.electricityEmissionFactorSource}`,
    model3d: { shape: 'hex', radius: 0.000035, height: 1.5, onRoof: false,
               color: '#8c4a3a', topColor: '#c97052', hasPole: true, poleColor: '#5a3225', poleHeight: 0.3 } },

  { id: 'bems', label: 'BEMS (에너지관리)', icon: '📊', coeff: Math.round(32000 * EF), unit: '동', color: '#d2a8ff', group: '에너지 절감',
    cost: 80000000, energyKwh: 32000,
    desc: '건물 1동 운영 에너지 관리, LED와 연계 시 이중산정 방지',
    source: `한국에너지공단 BEMS 설치확인·제로에너지건축물 인증 기준 · 한국에너지공단 에너지진단제도(EMS 구축 사업장 4% 이상 절감 기준) · ${OFFICIAL_FACTORS.electricityEmissionFactorSource}`,
    avoidsDoubleCounting: ['standalone_led_savings_if_bems_active'],
    model3d: { shape: 'square', radius: 0.00002, height: 2.5, onRoof: true,
               color: '#7c5fa8', topColor: '#d2a8ff' } },

  // ── 친환경 인프라 ──
  { id: 'ev', label: 'EV 충전소', icon: '🔌', coeff: Math.round(2600 * EF), unit: '기', color: '#a371f7', group: '친환경 인프라',
    cost: 7000000, energyKwh: 2600,
    desc: '7kW급 · 충전 인프라 설치 효과만 산정 (차량 이용량 별도 — 이중산정 방지)',
    source: `기후에너지환경부 무공해차·충전인프라 보급 정책 · K-Taxonomy 수송부문 무공해차 기준 · ${OFFICIAL_FACTORS.electricityEmissionFactorSource}`,
    avoidsDoubleCounting: ['scope3_vehicle_usage'],
    model3d: { shape: 'square', radius: 0.000018, height: 2.8, onRoof: false,
               color: '#5a3da3', topColor: '#a371f7' } },

  { id: 'rainwater', label: '빗물 저류 시스템', icon: '💧', coeff: Math.round(110 * EF), unit: '기', color: '#79c0ff', group: '친환경 인프라',
    cost: 12000000, energyKwh: 110,
    desc: '수자원 재활용 → 정수/하수 처리 전력 역산 (간접 절감)',
    source: `환경부 물순환·빗물이용시설 정책자료 · 한국환경산업기술원 환경성적표지 물 사용 배출계수 · ${OFFICIAL_FACTORS.electricityEmissionFactorSource}`,
    model3d: { shape: 'circle', radius: 0.00004, height: 1.0, onRoof: false,
               color: '#1f4d7d', topColor: '#79c0ff' } },

  // ── 자연 기반 ──
  { id: 'greenroof', label: '그린루프 (옥상녹화)', icon: '🌿', coeff: 5, unit: '㎡', color: '#56d364', group: '자연 기반',
    cost: 180000, energyKwh: 11,
    desc: '단열효과 + 탄소흡수 (옥상 공조설비 면적 제외 적용)',
    source: `기후에너지환경부 K-Taxonomy 녹색건축·재생에너지 기준 · 공공부문 옥상녹화 에너지절감 모니터링 사례 · ${OFFICIAL_FACTORS.electricityEmissionFactorSource}`,
    model3d: { shape: 'square', radius: 0.00007, height: 0.5, onRoof: true,
               color: '#3a8b48', topColor: '#56d364' } },

  { id: 'tree', label: '수목 식재', icon: '🌳', coeff: OFFICIAL_FACTORS.treeKgCO2PerYear, unit: '그루', color: '#3fb950', group: '자연 기반',
    cost: 300000, energyKwh: 0,
    desc: '주요 수종 30~40년생 평균 흡수량 보수 적용',
    source: OFFICIAL_FACTORS.treeSource,
    model3d: { shape: 'hex', radius: 0.000035, height: 7, onRoof: false,
               color: '#3d7a40', topColor: '#56d364', hasPole: true, poleColor: '#5a3a1f', poleHeight: 1.5 } },
];

// ─── 단가 정확도 안내 (시설팀 견적 확보 전 한계) ───
//
// 본 단가들은 출처 기관의 공개 통계·보급사업 기준·공공 보고서 기반의 평균 추정치이며,
// 페이지 단위 직접 인용이 아닌 통계 범위 내의 평균값을 채택했습니다.
// 실제 견적은 프로젝트 규모·시점·업체·옵션 사양에 따라 약 ±30% 변동 가능합니다.
// 정확한 값은 인하대 시설팀 RFP 단가 자료 확보 후 보정 예정.
export const COST_TRANSPARENCY_NOTE =
  '본 단가는 출처 기관의 공개 통계·보급사업 기준 기반 평균 추정치입니다. ' +
  '프로젝트 규모·시점·업체에 따라 실제 견적은 ±30% 변동 가능. ' +
  '정확 값은 시설팀 RFP 단가 확보 후 보정 예정.';

// ─── 출처 메타데이터 (UI 및 AI 프롬프트용 합본) ───
export const ITEM_SOURCE_INDEX = ITEM_TYPES.reduce((acc, item) => {
  acc[item.id] = item.source;
  return acc;
}, {});

// 출처 통합 인용 목록 (Dashboard 푸터/Report 참고문헌용)
export const REFERENCE_SOURCES = [
  '기후에너지환경부 보도자료(2025.12.18) 「전력배출계수 갱신 주기 3년에서 1년으로 단축」 — 2023년도 전력배출계수 0.4173 tCO₂eq/MWh',
  '온실가스종합정보센터 「2024년 승인 국가 온실가스 배출계수_전력배출계수」 — 소비단 0.4541 tCO₂eq/MWh',
  '기후에너지환경부 「한국형 녹색분류체계(K-Taxonomy) 적합성판단 참고서」 — 태양광 이용률 15%, LED 감축량 산정 예시',
  '기후에너지환경부 「한국형 녹색분류체계 가이드라인(2024.12.)」 — 재생에너지·히트펌프·ICT 녹색경제활동 기준',
  '기후에너지환경부 「2026년도 재생에너지보급(건물지원) 사업 공고」 — 건물 태양광/BIPV 보급지원 기준',
  '한국에너지공단 제로에너지건축물 인증제도·BEMS 설치확인 기준',
  '한국에너지공단 에너지진단제도 — 에너지관리시스템 구축 사업장 4% 이상 절감 기준',
  '국립산림과학원 「주요 산림수종의 표준 탄소흡수량」',
  '한국환경산업기술원 환경성적표지 평가계수 — 상수·물 사용 배출계수',
  '신재생에너지 공급의무화제도 및 연료 혼합의무화제도 관리·운영지침',
  '건축법 시행령 §119 (옥탑·승강기탑·계단탑 건축면적 제외 1/8 규정)',
  '소방기본법 시행규칙 §7 (옥상 피난·활동공간 확보)',
  'ISO 14064-1 : 조직 단위 온실가스 인벤토리',
];

export const ITEM_MAP = Object.fromEntries(ITEM_TYPES.map((t) => [t.id, t]));
export const GROUPS = [...new Set(ITEM_TYPES.map((t) => t.group))];
export const DEFAULT_BUDGET = 500000000;


// ─── 3D 폴리곤 생성 헬퍼 ───
// 점 좌표 + 모델 → 실제 폴리곤 좌표 배열
// panel_array 는 여러 개의 폴리곤 배열 반환 (배열 형식 = 다중 패널)
export function buildItemPolygon(item, baseHeight = 0) {
  const m = ITEM_MAP[item.type]?.model3d;
  if (!m) return null;

  const lng = item.lng;
  const lat = item.lat;
  const r = m.radius;
  const latRatio = 1 / Math.cos((lat * Math.PI) / 180);
  const rx = r * latRatio;
  const ry = r;

  if (m.shape === 'panel_array') {
    // 여러 개의 작은 패널을 격자로 배치 (진짜 솔라 어레이처럼)
    const rows = m.arrayRows || 2;
    const cols = m.arrayCols || 4;
    const panelWLng = (rx * 1.8) / cols;  // 한 패널 가로
    const panelHLat = ry / rows;            // 한 패널 세로
    const gap = 0.1;                        // 패널 사이 간격 비율
    const totalW = rx * 1.8;
    const totalH = ry;
    const startLng = lng - totalW / 2;
    const startLat = lat - totalH / 2;
    const rings = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const panelLng = startLng + col * panelWLng + (panelWLng * gap);
        const panelLat = startLat + row * panelHLat + (panelHLat * gap);
        const w = panelWLng * (1 - gap * 2);
        const h = panelHLat * (1 - gap * 2);
        const ring = [
          [panelLng, panelLat],
          [panelLng + w, panelLat],
          [panelLng + w, panelLat + h],
          [panelLng, panelLat + h],
          [panelLng, panelLat],
        ];
        rings.push(ring);
      }
    }
    return rings;  // 배열 반환 — Map.jsx 에서 다중 feature 처리
  }

  let ring = [];
  if (m.shape === 'square') {
    ring = [
      [lng - rx, lat - ry], [lng + rx, lat - ry],
      [lng + rx, lat + ry], [lng - rx, lat + ry],
    ];
  } else if (m.shape === 'panel') {
    const rxLong = rx * 1.8;
    ring = [
      [lng - rxLong, lat - ry], [lng + rxLong, lat - ry],
      [lng + rxLong, lat + ry], [lng - rxLong, lat + ry],
    ];
  } else if (m.shape === 'circle') {
    const sides = 16;
    for (let s = 0; s < sides; s++) {
      const angle = (s / sides) * Math.PI * 2;
      ring.push([lng + Math.cos(angle) * rx, lat + Math.sin(angle) * ry]);
    }
  } else if (m.shape === 'hex') {
    const sides = 6;
    for (let s = 0; s < sides; s++) {
      const angle = (s / sides) * Math.PI * 2 + Math.PI / 6;
      ring.push([lng + Math.cos(angle) * rx, lat + Math.sin(angle) * ry]);
    }
  }
  ring.push(ring[0]);

  return ring;
}

// 기둥/폴 폴리곤 (얇은 사각형)
export function buildPolePolygon(item) {
  const m = ITEM_MAP[item.type]?.model3d;
  if (!m || !m.hasPole) return null;
  const lng = item.lng;
  const lat = item.lat;
  const r = m.radius * 0.25;  // 기둥은 본체보다 가늘게
  const latRatio = 1 / Math.cos((lat * Math.PI) / 180);
  const rx = r * latRatio;
  const ry = r;
  const ring = [
    [lng - rx, lat - ry], [lng + rx, lat - ry],
    [lng + rx, lat + ry], [lng - rx, lat + ry],
    [lng - rx, lat - ry],
  ];
  return ring;
}
