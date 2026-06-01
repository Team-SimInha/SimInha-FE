/**
 * 기존 설치 설비 데이터셋
 *
 * 현재 값은 공개 지도와 캠퍼스 배치 기반 MVP 추정치입니다.
 * 실제 용량/연도 자료 확보 시 qty, installedYear, lng/lat만 교체하면 됩니다.
 */
export const PREINSTALLED_ITEMS = [
  {
    id: 'pre_solar_60th',
    type: 'solar_self',
    lng: 126.65435,
    lat: 37.45088,
    qty: 8,
    buildingId: 'bldg_60th',
    locationName: '60주년기념관 옥상',
    installedYear: 2023,
    locked: true,
    source: 'preinstalled',
    dataQuality: 'estimated',
  },
  {
    id: 'pre_solar_hitech',
    type: 'solar_self',
    lng: 126.65725,
    lat: 37.45065,
    qty: 8,
    buildingId: 'bldg_hitech',
    locationName: '하이테크센터 옥상',
    installedYear: 2022,
    locked: true,
    source: 'preinstalled',
    dataQuality: 'estimated',
  },
  {
    id: 'pre_solar_5',
    type: 'solar_self',
    lng: 126.65725,
    lat: 37.44850,
    qty: 4,
    buildingId: 'bldg_5',
    locationName: '5호관 옥상',
    installedYear: 2024,
    locked: true,
    source: 'preinstalled',
    dataQuality: 'estimated',
  },
  {
    id: 'pre_led_library',
    type: 'led',
    lng: 126.65252,
    lat: 37.44935,
    qty: 80,
    buildingId: 'bldg_lib',
    locationName: '정석학술정보관',
    installedYear: 2021,
    locked: true,
    source: 'preinstalled',
    dataQuality: 'estimated',
  },
  {
    id: 'pre_ev_gate',
    type: 'ev',
    lng: 126.65445,
    lat: 37.44805,
    qty: 4,
    buildingId: null,
    locationName: '정문 주차 구역',
    installedYear: 2023,
    locked: true,
    source: 'preinstalled',
    dataQuality: 'estimated',
  },
  {
    id: 'pre_greenroof_60th',
    type: 'greenroof',
    lng: 126.65443,
    lat: 37.45082,
    qty: 180,
    buildingId: 'bldg_60th',
    locationName: '60주년기념관 옥상녹화',
    installedYear: 2020,
    locked: true,
    source: 'preinstalled',
    dataQuality: 'estimated',
  },
];

export const PREINSTALLED_NOTE = '기존 설비 데이터는 공개 항공사진 + 캠퍼스 시설 안내 기반 추정치입니다. 인하대 시설팀 실데이터(설치 연도·용량) 확보 후 교체 예정 (확장 로드맵 참조).';

// 기존 설비 데이터 출처 (UI/AI 프롬프트용)
export const PREINSTALLED_SOURCE = {
  estimated: '공개 항공사진(카카오맵·OSM) + 인하대 시설 안내 페이지 기반 추정. 실측 확보 시 교체 예정.',
  measured: '인하대 시설팀 제공 실측 데이터.',
};

// ─── 옥상에 이미 점유 중인 비-친환경 설비 (실외기·물탱크·천창·안테나 등) ───
//
// 인하대 캠퍼스 공개 항공사진(카카오맵·네이버 지도·구글 어스) 관찰 기반 추정치.
// 일반 reserve ratio (zones.js ROOFTOP_RESERVE_BY_TYPE) 와 별도로,
// 항공사진에 시각적으로 확인되는 큰 점유 설비를 명시적으로 차감하기 위해 분리 관리.
// 실측 자료(시설팀 협조 공문) 확보 시 교체 예정 — 확장 로드맵 참조.
export const BUILDING_ROOFTOP_FIXTURES = [
  {
    buildingId: 'bldg_60th',
    name: '60주년기념관',
    source: '카카오맵 항공사진 (2024) — 기존 태양광/옥상녹화 영역 외 잔여 점유 관찰',
    fixtures: [
      { type: 'ac_condenser', label: '냉방 실외기 어레이', areaM2: 35 },
      { type: 'water_tank',   label: '옥상 물탱크',         areaM2: 18 },
      { type: 'antenna',      label: '통신 안테나',         areaM2: 5  },
    ],
  },
  {
    buildingId: 'bldg_hitech',
    name: '하이테크센터',
    source: '카카오맵·네이버 항공사진 (2024) — 클린룸 공조 다수 관찰',
    fixtures: [
      { type: 'ac_condenser', label: '클린룸 공조 실외기', areaM2: 80 },
      { type: 'water_tank',   label: '옥상 물탱크',         areaM2: 20 },
      { type: 'exhaust',      label: '배기 굴뚝',           areaM2: 12 },
    ],
  },
  {
    buildingId: 'bldg_5',
    name: '5호관',
    source: '카카오맵 항공사진 (2024) — ㄷ자형 대형 강의동, 옥상 산재 실외기',
    fixtures: [
      { type: 'ac_condenser', label: '냉방 실외기 (분산 배치)', areaM2: 100 },
      { type: 'water_tank',   label: '옥상 물탱크',           areaM2: 25 },
      { type: 'skylight',     label: '천창',                   areaM2: 30 },
    ],
  },
  {
    buildingId: 'bldg_lib',
    name: '정석학술정보관',
    source: '카카오맵 항공사진 (2024) — 도서관 항온항습 공조 대형',
    fixtures: [
      { type: 'ac_condenser', label: '항온항습 공조 (도서관)', areaM2: 60 },
      { type: 'water_tank',   label: '옥상 물탱크',           areaM2: 15 },
    ],
  },
  {
    buildingId: 'bldg_dorm',
    name: '비룡재 (기숙사)',
    source: '카카오맵·네이버 항공사진 (2024) — 14층 고층 기숙사 옥상',
    fixtures: [
      { type: 'ac_condenser', label: '냉방 실외기 (호실별)', areaM2: 70 },
      { type: 'water_tank',   label: '대형 옥상 물탱크',     areaM2: 35 },
      { type: 'antenna',      label: '통신 안테나',           areaM2: 6 },
    ],
  },
];

export const ROOFTOP_FIXTURES_NOTE =
  '본 데이터는 공개 항공사진(카카오맵·네이버 지도·구글 어스) 관찰 기반 추정치입니다. ' +
  '실측 자료(인하대 시설팀 협조) 확보 시 교체 예정 — 확장 로드맵 참조.';
