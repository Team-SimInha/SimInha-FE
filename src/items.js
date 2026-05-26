/**
 * 배치 요소 정의
 *
 * cost: 설치 단위당 비용(KRW)
 * energyKwh: 설치 단위당 연간 생산/절감 전력량(kWh)
 * coeff: 단위당 연간 CO₂ 감축량 (kgCO₂eq/년)
 * source: 단위당 수치 산정의 공인 출처 (가이드라인·통계·표준)
 *
 * ※ 모든 단가·계수는 공개 가이드라인 기반 추정치이며, 실제 설치 시 현장조건에 따라 변동.
 *   인하대 실데이터 확보 후 보정 예정 (확장 로드맵 참조).
 *
 * model3d: 실제 3D 익스트루전 렌더링 정보
 *   shape, radius, height, onRoof, color, topColor, hasPole, poleColor (생략)
 */

export const ITEM_TYPES = [
  // ── 에너지 생산 ──
  { id: 'solar_self', label: '자가소비 태양광', icon: '☀️', coeff: 460, unit: 'kW', color: '#f2cc60', group: '에너지 생산',
    cost: 1500000, energyKwh: 1200,
    desc: '옥상 설치, 자가소비 → Scope2 직접 감소',
    source: '한국에너지공단 「신재생에너지 보급통계」 (2023) · 한전 전력 배출계수 0.4663 kgCO₂/kWh',
    model3d: { shape: 'panel_array', radius: 0.00010, height: 0.8, onRoof: true,
               color: '#0d1a3a', topColor: '#2e4a8a', arrayRows: 2, arrayCols: 4 } },

  { id: 'solar_bipv', label: 'BIPV (건물일체형)', icon: '🏗️', coeff: 380, unit: 'kW', color: '#e0a830', group: '에너지 생산',
    cost: 3000000, energyKwh: 990,
    desc: '벽면·유리 통합, 효율 85% (자가소비 대비)',
    source: '한국태양광산업협회 BIPV 시장조사 · 산업통상자원부 R&D 보고서',
    model3d: { shape: 'panel_array', radius: 0.00009, height: 4, onRoof: true,
               color: '#5a4a1f', topColor: '#e0a830', arrayRows: 1, arrayCols: 5 } },

  { id: 'solar_lease', label: '부지대여 태양광', icon: '⚠️', coeff: 0, unit: 'kW', color: '#6e7681', group: '에너지 생산',
    cost: 0, energyKwh: 0,
    desc: '감축 실적 대학 귀속 불가 (현재 인하대 방식)',
    source: '산업통상자원부 RPS 운영지침 — 부지대여형은 운영사 실적으로 귀속',
    avoidsDoubleCounting: ['third_party_operator_claim'],
    model3d: { shape: 'panel_array', radius: 0.00010, height: 0.8, onRoof: false,
               color: '#1a1a1a', topColor: '#3a3a3a', arrayRows: 2, arrayCols: 4 } },

  // ── 에너지 절감 ──
  { id: 'led', label: 'LED 조명 교체', icon: '💡', coeff: 30, unit: '개', color: '#58a6ff', group: '에너지 절감',
    cost: 50000, energyKwh: 70,
    desc: '40W→18W, 연 3,200시간 기준',
    source: '환경부 「LED 조명 보급사업 효과분석」 · 한전 전력 배출계수 0.4663 kgCO₂/kWh',
    model3d: { shape: 'circle', radius: 0.00002, height: 0.4, onRoof: true,
               color: '#a5d8ff', topColor: '#ffeb70' } },

  { id: 'geothermal', label: '지열 히트펌프', icon: '🌡️', coeff: 1500, unit: 'RT', color: '#f78166', group: '에너지 절감',
    cost: 5000000, energyKwh: 3300,
    desc: '냉난방 동시, 기존 보일러 대비 60% 절감',
    source: '한국에너지공단 「신재생에너지 백서」 지열 부문 · 신재생에너지센터 보급통계',
    model3d: { shape: 'hex', radius: 0.000035, height: 1.5, onRoof: false,
               color: '#8c4a3a', topColor: '#c97052', hasPole: true, poleColor: '#5a3225', poleHeight: 0.3 } },

  { id: 'bems', label: 'BEMS (에너지관리)', icon: '📊', coeff: 15000, unit: '동', color: '#d2a8ff', group: '에너지 절감',
    cost: 80000000, energyKwh: 32000,
    desc: '건물 1동 기준 ~10-15% 에너지 절감 (LED와 연계 시 시너지 보너스 적용, 별도 산정 금지)',
    source: '한국에너지공단 「BEMS 보급사업 가이드」 (2022)',
    avoidsDoubleCounting: ['standalone_led_savings_if_bems_active'],
    model3d: { shape: 'square', radius: 0.00002, height: 2.5, onRoof: true,
               color: '#7c5fa8', topColor: '#d2a8ff' } },

  // ── 친환경 인프라 ──
  { id: 'ev', label: 'EV 충전소', icon: '🔌', coeff: 1200, unit: '기', color: '#a371f7', group: '친환경 인프라',
    cost: 7000000, energyKwh: 2600,
    desc: '7kW급 · 충전 인프라 설치 효과만 산정 (차량 이용량 별도 — 이중산정 방지)',
    source: '환경부 「전기자동차 보급 및 충전 인프라 구축계획」 · 자동차 온실가스 통계',
    avoidsDoubleCounting: ['scope3_vehicle_usage'],
    model3d: { shape: 'square', radius: 0.000018, height: 2.8, onRoof: false,
               color: '#5a3da3', topColor: '#a371f7' } },

  { id: 'rainwater', label: '빗물 저류 시스템', icon: '💧', coeff: 50, unit: '기', color: '#79c0ff', group: '친환경 인프라',
    cost: 12000000, energyKwh: 110,
    desc: '수자원 재활용 → 정수/하수 처리 전력 역산 (간접 절감)',
    source: '환경부 「빗물이용시설 설치·관리 매뉴얼」 · 한국수자원공사 수처리 전력 자료',
    model3d: { shape: 'circle', radius: 0.00004, height: 1.0, onRoof: false,
               color: '#1f4d7d', topColor: '#79c0ff' } },

  // ── 자연 기반 ──
  { id: 'greenroof', label: '그린루프 (옥상녹화)', icon: '🌿', coeff: 5, unit: '㎡', color: '#56d364', group: '자연 기반',
    cost: 180000, energyKwh: 11,
    desc: '단열효과 + 탄소흡수 (옥상 공조설비 면적 제외 적용)',
    source: '산림청 「도시숲 가이드라인」 · 환경부 「옥상녹화 효과분석」',
    model3d: { shape: 'square', radius: 0.00007, height: 0.5, onRoof: true,
               color: '#3a8b48', topColor: '#56d364' } },

  { id: 'tree', label: '수목 식재', icon: '🌳', coeff: 22, unit: '그루', color: '#3fb950', group: '자연 기반',
    cost: 300000, energyKwh: 0,
    desc: '단위면적당 흡수계수 (소나무·잣나무 평균 기준)',
    source: '국립산림과학원 「산림 탄소흡수계수」 (2019 개정)',
    model3d: { shape: 'hex', radius: 0.000035, height: 7, onRoof: false,
               color: '#3d7a40', topColor: '#56d364', hasPole: true, poleColor: '#5a3a1f', poleHeight: 1.5 } },
];

// ─── 출처 메타데이터 (UI 및 AI 프롬프트용 합본) ───
export const ITEM_SOURCE_INDEX = ITEM_TYPES.reduce((acc, item) => {
  acc[item.id] = item.source;
  return acc;
}, {});

// 출처 통합 인용 목록 (Dashboard 푸터/Report 참고문헌용)
export const REFERENCE_SOURCES = [
  '한국에너지공단 「신재생에너지 보급통계」 (2023)',
  '한국에너지공단 「신재생에너지 백서」 · 「BEMS 보급사업 가이드」 (2022)',
  '한국전력공사 전력 배출계수 0.4663 kgCO₂/kWh (2022 기준)',
  '환경부 「LED 조명 보급사업 효과분석」 · 「전기자동차 보급 및 충전 인프라 구축계획」',
  '환경부 「빗물이용시설 설치·관리 매뉴얼」 · 「옥상녹화 효과분석」',
  '환경부·기획재정부 「대학 온실가스 인벤토리 보고제도」',
  '산림청 「도시숲 가이드라인」 · 국립산림과학원 「산림 탄소흡수계수」 (2019 개정)',
  '산업통상자원부 RPS 운영지침 (부지대여형 실적 귀속 조항)',
  '건축법 시행령 §119 (옥탑·승강기탑·계단탑 건축면적 제외 1/8 규정)',
  '소방기본법 시행규칙 §7 (옥상 피난·활동공간 확보)',
  '한국에너지공단 「태양광발전 설치 가이드」 (옥상 가용면적 산정: 음영·통로·기타설비율 20~40% 제외)',
  '한국건설기술연구원 「옥상녹화 적용가능면적 산정 사례」 (건물 유형별 옥상 점유율 차등)',
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
