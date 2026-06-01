/**
 * 개인 탄소중립 실천 활동 카탈로그
 *
 * 각 활동의 kgCO2eq 감축량은 공개된 환경부 / 한국전력 배출계수 / 학술 LCA 자료를
 * 참고한 추정치이며, 학기·캠퍼스 환경에 따라 실제 값은 달라질 수 있습니다.
 * 모든 수치는 표기된 출처(source)를 기반으로 산정되었습니다.
 * (연구실 자문: 임의 수치 지양 → 공인 가이드라인 기반)
 */

export const PRACTICE_CATEGORIES = [
  { id: 'food',      label: '식생활',     icon: '🍱', color: '#f2cc60' },
  { id: 'transport', label: '이동',       icon: '🚲', color: '#79c0ff' },
  { id: 'energy',    label: '에너지',     icon: '💡', color: '#a371f7' },
  { id: 'waste',     label: '자원순환',   icon: '♻️', color: '#56d364' },
  { id: 'water',     label: '물 절약',    icon: '💧', color: '#7ee0e8' },
];

export const PRACTICES = [
  // ── 식생활 ──
  { id: 'tumbler', category: 'food', label: '텀블러/머그컵 사용', icon: '☕',
    co2PerUnit: 0.05, unit: '회',
    desc: '일회용 종이컵 1개 대체 시 약 0.05 kgCO₂eq',
    source: '환경부 「일회용품 사용 줄이기」 안내자료 (2021)' },

  { id: 'no_leftover', category: 'food', label: '잔반 없이 식사', icon: '🍚',
    co2PerUnit: 0.4, unit: '끼',
    desc: '음식물 쓰레기 약 130g 감소 시 약 0.4 kgCO₂eq',
    source: '국립환경과학원 음식물쓰레기 LCA (2018)' },

  { id: 'veggie_meal', category: 'food', label: '채식 한 끼', icon: '🥗',
    co2PerUnit: 1.8, unit: '끼',
    desc: '육류 한 끼 대비 약 1.8 kgCO₂eq 절감',
    source: 'Poore & Nemecek, Science (2018) 식품 LCA' },

  // ── 이동 ──
  { id: 'transit', category: 'transport', label: '대중교통 이용', icon: '🚌',
    co2PerUnit: 1.5, unit: '회',
    desc: '편도 5km 자차 대체 시 약 1.5 kgCO₂eq',
    source: '국토교통부 「교통수단별 온실가스 배출계수」' },

  { id: 'walk_bike', category: 'transport', label: '도보·자전거 통학', icon: '🚲',
    co2PerUnit: 2.0, unit: '회',
    desc: '편도 5km 자차 대체 시 약 2.0 kgCO₂eq (배출 없음)',
    source: '국토교통부 「교통수단별 온실가스 배출계수」' },

  { id: 'carpool', category: 'transport', label: '카풀·합승', icon: '🚗',
    co2PerUnit: 0.9, unit: '회',
    desc: '2인 카풀 시 1인 기준 약 0.9 kgCO₂eq 절감',
    source: '국토교통부 「교통수단별 온실가스 배출계수」' },

  // ── 에너지 ──
  { id: 'stairs', category: 'energy', label: '계단 이용 (엘리베이터 X)', icon: '🪜',
    co2PerUnit: 0.05, unit: '회',
    desc: '5층 엘리베이터 1회 대체 시 약 0.05 kgCO₂eq',
    source: '한국전력 전력 배출계수 0.4663 kgCO₂/kWh (2022) 기반' },

  { id: 'lights_off', category: 'energy', label: '소등 인증 (자리 비울 때)', icon: '🔌',
    co2PerUnit: 0.03, unit: '회',
    desc: '강의실 LED 등 1시간 소등 기준 약 0.03 kgCO₂eq',
    source: '한국전력 전력 배출계수 0.4663 kgCO₂/kWh 기반' },

  { id: 'ac_setpoint', category: 'energy', label: '냉방 1℃ 높이기', icon: '❄️',
    co2PerUnit: 0.2, unit: '시간',
    desc: '대형 강의실 냉방 1℃ 상향 시 시간당 약 0.2 kgCO₂eq',
    source: '에너지공단 「여름철 에너지절약 가이드」' },

  // ── 자원순환 ──
  { id: 'recycle', category: 'waste', label: '분리수거 인증', icon: '♻️',
    co2PerUnit: 0.1, unit: '회',
    desc: '캔/페트병 1회 분리 시 약 0.1 kgCO₂eq',
    source: '환경부 「자원순환 통계」 (2022)' },

  { id: 'reuse_paper', category: 'waste', label: '이면지 사용', icon: '📄',
    co2PerUnit: 0.02, unit: 'A4 10매',
    desc: 'A4 10매 재사용 시 약 0.02 kgCO₂eq',
    source: '한국제지연합회 종이 LCA 자료' },

  // ── 물 절약 ──
  { id: 'tap_water', category: 'water', label: '양치·세수 물 잠그기', icon: '🚰',
    co2PerUnit: 0.02, unit: '회',
    desc: '양치 1회 절수 약 6L, 수처리 전력 환산 약 0.02 kgCO₂eq',
    source: '한국수자원공사 수처리 전력 사용량 자료' },
];

export const PRACTICE_MAP = Object.fromEntries(PRACTICES.map((p) => [p.id, p]));
