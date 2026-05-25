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
