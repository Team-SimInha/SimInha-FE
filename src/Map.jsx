import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ITEM_MAP, buildItemPolygon, buildPolePolygon } from './items.js';
import { CAMPUS_ZONES, DECORATIVE_TREES, WALKWAYS, CAMPUS_ROAD_CENTERLINES } from './zones.js';
import { CAMPUS_POLYS, INHA_BUILDINGS } from './inha_buildings.js';

// 캠퍼스 건물의 OSM way ID — OSM 배경 레이어에서 이 ID들은 제외해서 z-fighting 방지
const CAMPUS_OSM_IDS = INHA_BUILDINGS.map((b) => b.osm_id).filter(Boolean);

// OpenFreeMap 무료 벡터 타일 사용 — 토큰 불필요
// (Mapbox 토큰이 있어도 maplibre는 mapbox:// 내부 URL을 해결 못해서 무조건 OpenFreeMap 사용)
const INHA_CENTER = [126.6555, 37.4493];

const CAMERA_PRESETS = {
  flat: { label: '평면', zoom: 16.8, pitch: 0, bearing: 0 },
  iso: { label: '아이소', zoom: 17.05, pitch: 48, bearing: -32 },
  threeD: { label: '3D', zoom: 17.25, pitch: 66, bearing: -25 },
};

const ZONE_STYLE = {
  old_building:   { ground: '#d8dee822', line: '#aeb7c2', roof: '#cfd6df', wall: '#aeb8c3' },
  new_building:   { ground: '#e6edf322', line: '#b7c3cc', roof: '#e5ebf0', wall: '#c8d2dc' },
  solar_building: { ground: '#f2cc6030', line: '#d2a641', roof: '#ead38a', wall: '#cbb36b' },
  hospital:       { ground: '#efd8d022', line: '#d8aaa0', roof: '#efd8d0', wall: '#d3b2aa' },
  auxiliary:      { ground: '#d8dee822', line: '#aeb7c2', roof: '#d8dee8', wall: '#b9c3ce' },
  main_road:      { ground: '#c8cfd844', line: '#9fa8b3' },
  parking:        { ground: '#ccd3dc33', line: '#a6b0bd' },
  green:          { ground: '#7fbf8f44', line: '#6ea57b' },
  plaza:          { ground: '#d8dee833', line: '#b7c0ca' },
  sports:         { ground: '#8bb8d033', line: '#77a4bc' },
  water:          { ground: '#4d86a6', line: '#8fc3dc' },
};

const BUILDING_TYPES = ['old_building', 'new_building', 'solar_building', 'hospital', 'auxiliary'];

// 폴리곤 좌표를 GeoJSON 좌표로 변환 (outer + 선택적 hole)
function toGeoJSONCoords(z) {
  const outer = [...z.polygon, z.polygon[0]];
  if (z.hole) {
    return [outer, [...z.hole, z.hole[0]]];
  }
  return [outer];
}

function zonesToGeoJSON() {
  return {
    type: 'FeatureCollection',
    features: CAMPUS_ZONES.map((z) => ({
      type: 'Feature',
      properties: {
        id: z.id, name: z.name, zoneType: z.type, note: z.note || '',
        height: z.height || 0, floors: z.floors || 0,
        isBuilding: BUILDING_TYPES.includes(z.type),
      },
      geometry: { type: 'Polygon', coordinates: toGeoJSONCoords(z) },
    })),
  };
}

function buildingsGeoJSON() {
  return {
    type: 'FeatureCollection',
    features: CAMPUS_ZONES
      .filter((z) => BUILDING_TYPES.includes(z.type) && z.height)
      .map((z) => ({
        type: 'Feature',
        properties: { id: z.id, name: z.name, zoneType: z.type, height: z.height, floors: z.floors },
        geometry: { type: 'Polygon', coordinates: toGeoJSONCoords(z) },
      })),
  };
}

// 점이 폴리곤 안에 있는지 (hole 고려)
function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInZone(lng, lat, zone) {
  if (!pointInRing(lng, lat, zone.polygon)) return false;
  if (zone.hole && pointInRing(lng, lat, zone.hole)) return false;
  return true;
}

function findBuildingHeight(lng, lat) {
  const z = CAMPUS_ZONES.find(
    (z) => BUILDING_TYPES.includes(z.type) && pointInZone(lng, lat, z)
  );
  return z?.height || 0;
}

// 배치된 아이템들을 3D 폴리곤 GeoJSON으로 변환
function placedItemsGeoJSON(items) {
  const features = [];
  for (const it of items) {
    const meta = ITEM_MAP[it.type];
    if (!meta?.model3d) continue;
    const m = meta.model3d;
    const baseHeight = m.onRoof ? findBuildingHeight(it.lng, it.lat) : 0;

    // 본체 — buildItemPolygon 은 단일 ring 또는 ring 배열 반환
    const result = buildItemPolygon(it);
    if (result) {
      // panel_array → result = [ring1, ring2, ...] (ring = 점 배열)
      // 단일 → result = [[lng,lat], [lng,lat], ...] (점 배열)
      const isMulti = Array.isArray(result[0]) && Array.isArray(result[0][0]);
      const ringsToRender = isMulti ? result : [result];
      ringsToRender.forEach((r, idx) => {
        features.push({
          type: 'Feature',
          properties: {
            id: it.id + (isMulti ? `_p${idx}` : ''),
            parentId: it.id,
            itemType: it.type,
            itemLabel: meta.label,
            unit: meta.unit,
            qty: it.qty ?? 1,
            locked: Boolean(it.locked),
            source: it.source || 'user',
            locationName: it.locationName || it.zoneName || '',
            installedYear: it.installedYear || '',
            color: m.color,
            topColor: m.topColor || m.color,
            base: baseHeight + (m.hasPole ? m.poleHeight : 0),
            top: baseHeight + (m.hasPole ? m.poleHeight : 0) + m.height,
            isBody: true,
          },
          geometry: { type: 'Polygon', coordinates: [r] },
        });
      });
    }

    // 기둥 (있을 경우)
    if (m.hasPole) {
      const pole = buildPolePolygon(it);
      if (pole) {
        features.push({
          type: 'Feature',
          properties: {
            id: it.id,
            parentId: it.id,
            itemType: it.type,
            itemLabel: meta.label,
            unit: meta.unit,
            qty: it.qty ?? 1,
            locked: Boolean(it.locked),
            source: it.source || 'user',
            locationName: it.locationName || it.zoneName || '',
            installedYear: it.installedYear || '',
            color: m.poleColor,
            topColor: m.poleColor,
            base: baseHeight,
            top: baseHeight + m.poleHeight,
            isBody: false,
          },
          geometry: { type: 'Polygon', coordinates: [pole] },
        });
      }
    }
  }
  return { type: 'FeatureCollection', features };
}

function preinstalledLabelsGeoJSON(items) {
  return {
    type: 'FeatureCollection',
    features: items.map((it) => {
      const meta = ITEM_MAP[it.type];
      return {
        type: 'Feature',
        properties: {
          id: it.id,
          badge: '기존',
          name: it.locationName || meta?.label || it.type,
        },
        geometry: { type: 'Point', coordinates: [it.lng, it.lat] },
      };
    }),
  };
}

export default function CampusMap({
  selectedType,
  items,
  preinstalledItems = [],
  showPreinstalled = true,
  showCampusPaths = true,
  cameraPreset = 'iso',
  onPlace,
  onRemove,
  pickMode = false,
  pickedLocation = null,
  onPick,
  practiceLogs = [],
  onLogClick,
}) {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const selectedRef = useRef(selectedType);
  const onRemoveRef = useRef(onRemove);
  const onPlaceRef = useRef(onPlace);
  const pickModeRef = useRef(pickMode);
  const onPickRef = useRef(onPick);
  const onLogClickRef = useRef(onLogClick);

  useEffect(() => { selectedRef.current = selectedType; }, [selectedType]);
  useEffect(() => { onRemoveRef.current = onRemove; }, [onRemove]);
  useEffect(() => { onPlaceRef.current = onPlace; }, [onPlace]);
  useEffect(() => { pickModeRef.current = pickMode; }, [pickMode]);
  useEffect(() => { onPickRef.current = onPick; }, [onPick]);
  useEffect(() => { onLogClickRef.current = onLogClick; }, [onLogClick]);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: INHA_CENTER,
      zoom: CAMERA_PRESETS.iso.zoom,
      pitch: CAMERA_PRESETS.iso.pitch,
      bearing: CAMERA_PRESETS.iso.bearing,
      antialias: true,
      maxPitch: 75,
    });
    mapRef.current = map;

    map.on('load', () => {
      // 호버 팝업 — 모든 레이어 추가 전에 미리 만들어 둠 (이후 핸들러에서 참조)
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: '260px' });

      // ── 조명 (maplibre는 setFog 미지원, setLight만) ──
      try {
        map.setLight({ anchor: 'viewport', color: '#ffeacc', intensity: 0.6, position: [1.5, 220, 30] });
      } catch {}

      // ── OpenFreeMap dark 스타일의 기본 'building' 2D fill 레이어 숨김 ──
      // (rgb(10,10,10) 검정 fill이 우리 3D 건물 위에 그려져서 어둡게 보이는 원인)
      try {
        if (map.getLayer('building')) {
          map.setLayoutProperty('building', 'visibility', 'none');
        }
      } catch (e) {
        console.warn('기본 building 레이어 숨김 실패:', e.message);
      }

      const layers = map.getStyle().layers;
      const labelLayerId = layers.find(
        (l) => l.type === 'symbol' && l.layout && l.layout['text-field']
      )?.id;

      // ── 배경 타일 건물 오버라이드 ──
      // 캠퍼스 주요 건물은 inha_buildings.js의 OSM footprint를 우선 사용한다.
      // 과거 임시로 지정했던 타일 ID 기반 5호관 라벨은 실제 건물 폴리곤과
      // 중복/오인될 수 있어 비워둔다.
      const TILE_ID_OVERRIDES = {};
      const TILE_OLD_IDS = Object.keys(TILE_ID_OVERRIDES)
        .filter(k => TILE_ID_OVERRIDES[k].type === 'old_building').map(Number);
      const TILE_NEW_IDS = Object.keys(TILE_ID_OVERRIDES)
        .filter(k => TILE_ID_OVERRIDES[k].type === 'new_building').map(Number);
      const TILE_SOLAR_IDS = Object.keys(TILE_ID_OVERRIDES)
        .filter(k => TILE_ID_OVERRIDES[k].type === 'solar_building').map(Number);
      const ALL_OVERRIDE_IDS = Object.keys(TILE_ID_OVERRIDES).map(Number);

      // ── 배경 OSM 3D 건물 ──
      // 사용자 지정 override ID는 별도 색으로, 나머지는 보라색
      try {
        if (map.getSource('openmaptiles')) {
          map.addLayer({
            id: '3d-buildings',
            source: 'openmaptiles',
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 14,
            // 사용자 지정 override 건물은 별도 레이어에서 그릴 거니 이 레이어에서 제외
            filter: ['!', ['in', ['id'], ['literal', ALL_OVERRIDE_IDS]]],
            paint: {
              'fill-extrusion-color': '#b8c0cc',
              'fill-extrusion-height': ['get', 'render_height'],
              'fill-extrusion-base': ['get', 'render_min_height'],
              'fill-extrusion-opacity': 0.58,
              'fill-extrusion-vertical-gradient': false,
            },
          }, labelLayerId);

          // ── 사용자 지정 OSM 건물 (빨강 = 노후) ──
          if (TILE_OLD_IDS.length > 0) {
            map.addLayer({
              id: '3d-buildings-old',
              source: 'openmaptiles',
              'source-layer': 'building',
              type: 'fill-extrusion',
              minzoom: 14,
              filter: ['in', ['id'], ['literal', TILE_OLD_IDS]],
              paint: {
                'fill-extrusion-color': '#cfd6df',
                'fill-extrusion-height': ['get', 'render_height'],
                'fill-extrusion-base': ['get', 'render_min_height'],
                'fill-extrusion-opacity': 1.0,
                'fill-extrusion-vertical-gradient': false,
              },
            }, labelLayerId);
          }
          // ── 사용자 지정 OSM 건물 (녹색 = 신축) ──
          if (TILE_NEW_IDS.length > 0) {
            map.addLayer({
              id: '3d-buildings-new',
              source: 'openmaptiles',
              'source-layer': 'building',
              type: 'fill-extrusion',
              minzoom: 14,
              filter: ['in', ['id'], ['literal', TILE_NEW_IDS]],
              paint: {
                'fill-extrusion-color': '#e5ebf0',
                'fill-extrusion-height': ['get', 'render_height'],
                'fill-extrusion-base': ['get', 'render_min_height'],
                'fill-extrusion-opacity': 1.0,
                'fill-extrusion-vertical-gradient': false,
              },
            }, labelLayerId);
          }
          // ── 사용자 지정 OSM 건물 (노랑 = 태양광) ──
          if (TILE_SOLAR_IDS.length > 0) {
            map.addLayer({
              id: '3d-buildings-solar',
              source: 'openmaptiles',
              'source-layer': 'building',
              type: 'fill-extrusion',
              minzoom: 14,
              filter: ['in', ['id'], ['literal', TILE_SOLAR_IDS]],
              paint: {
                'fill-extrusion-color': '#ead38a',
                'fill-extrusion-height': ['get', 'render_height'],
                'fill-extrusion-base': ['get', 'render_min_height'],
                'fill-extrusion-opacity': 1.0,
                'fill-extrusion-vertical-gradient': false,
              },
            }, labelLayerId);
          }

          // ── override 건물 라벨 ──
          // 각 override 건물 ID 별로 화살표 표시 (수동으로 좌표 지정)
          // (자동으로는 어려워서 일단 콘솔 로그만)
          const labelFeatures = Object.entries(TILE_ID_OVERRIDES).map(([idStr, info]) => {
            const id = Number(idStr);
            // OSM source-layer 'building' 에서 ID로 features 찾기 — 이건 비동기적이라
            // map.querySourceFeatures 로 모든 타일 로드 후 검색
            return { id, info };
          });
          // 타일이 로드된 후 라벨 표시
          map.once('idle', () => {
            const feats = map.querySourceFeatures('openmaptiles', {
              sourceLayer: 'building',
              filter: ['in', ['id'], ['literal', ALL_OVERRIDE_IDS]],
            });
            console.log('[override] 매칭된 OSM 건물 features:', feats.length);
            const labelGeoJSON = {
              type: 'FeatureCollection',
              features: feats.map(f => {
                const info = TILE_ID_OVERRIDES[f.id];
                if (!info) return null;
                // 폴리곤 중심 계산
                const ring = f.geometry.coordinates[0];
                let cx = 0, cy = 0;
                for (const [x, y] of ring) { cx += x; cy += y; }
                cx /= ring.length; cy /= ring.length;
                return {
                  type: 'Feature',
                  properties: { name: info.name, id: f.id },
                  geometry: { type: 'Point', coordinates: [cx, cy] },
                };
              }).filter(Boolean),
            };
            if (map.getSource('override-labels')) {
              map.getSource('override-labels').setData(labelGeoJSON);
            } else {
              map.addSource('override-labels', { type: 'geojson', data: labelGeoJSON });
              map.addLayer({
                id: 'override-labels-layer',
                type: 'symbol',
                source: 'override-labels',
                layout: {
                  'text-field': ['get', 'name'],
                  'text-size': 13,
                  'text-font': ['Noto Sans Regular'],
                  'text-allow-overlap': true,
                },
                paint: {
                  'text-color': '#ffffff',
                  'text-halo-color': '#0d1117',
                  'text-halo-width': 2.5,
                },
              });
            }
          });
        }
      } catch (err) {
        console.warn('OSM 3D 건물 레이어 추가 실패:', err.message);
      }

      // ── 캠퍼스 경계 (OSM amenity=university 폴리곤, 인하대 + 인하공전 둘 다) ──
      const campusBoundaryGeoJSON = {
        type: 'FeatureCollection',
        features: CAMPUS_POLYS
          .filter((cp) => cp.name === '인하대학교' || cp.name === '인하공업전문대학')
          .map((cp) => ({
            type: 'Feature',
            properties: { name: cp.name },
            geometry: {
              type: 'Polygon',
              coordinates: [[...cp.polygon, cp.polygon[0]]],
            },
          })),
      };
      map.addSource('campus-boundary', { type: 'geojson', data: campusBoundaryGeoJSON });
      // fill 레이어는 depth test에 간섭 가능성이 있어서 제거. line만 남김.
      map.addLayer({
        id: 'campus-boundary-line',
        type: 'line',
        source: 'campus-boundary',
        paint: {
          'line-color': '#7fb1d1',
          'line-width': 2,
          'line-opacity': 0.5,
          'line-dasharray': [4, 3],
        },
      });

      // ── 캠퍼스 구역 ──
      map.addSource('campus-zones', { type: 'geojson', data: zonesToGeoJSON() });

      const groundColorExpr = ['match', ['get', 'zoneType'],
        ...Object.entries(ZONE_STYLE).flatMap(([k, v]) => [k, v.ground]),
        '#ffffff11',
      ];
      const lineColorExpr = ['match', ['get', 'zoneType'],
        ...Object.entries(ZONE_STYLE).flatMap(([k, v]) => [k, v.line]),
        '#ffffff44',
      ];

      // 인경호
      map.addLayer({
        id: 'water-fill', type: 'fill', source: 'campus-zones',
        filter: ['==', ['get', 'zoneType'], 'water'],
        paint: { 'fill-color': '#4d86a6', 'fill-opacity': 0.72 },
      });
      map.addLayer({
        id: 'water-edge', type: 'line', source: 'campus-zones',
        filter: ['==', ['get', 'zoneType'], 'water'],
        paint: { 'line-color': '#a5d6ec', 'line-width': 2, 'line-opacity': 0.65, 'line-blur': 1 },
      });

      // 비건물·비호수 지면
      map.addLayer({
        id: 'zones-ground-fill', type: 'fill', source: 'campus-zones',
        filter: ['all',
          ['==', ['get', 'isBuilding'], false],
          ['!=', ['get', 'zoneType'], 'water'],
          ['!=', ['get', 'zoneType'], 'main_road'],
        ],
        paint: { 'fill-color': groundColorExpr, 'fill-opacity': 0.6 },
      });
      // 비건물 외곽선 (점선)
      map.addLayer({
        id: 'zones-line-nonbldg', type: 'line', source: 'campus-zones',
        filter: ['all',
          ['!=', ['get', 'zoneType'], 'water'],
          ['!=', ['get', 'zoneType'], 'main_road'],
          ['==', ['get', 'isBuilding'], false],
        ],
        paint: {
          'line-color': lineColorExpr,
          'line-width': 2,
          'line-dasharray': [3, 2],
          'line-opacity': 0.6,
        },
      });
      // 건물 외곽선 (실선)
      map.addLayer({
        id: 'zones-line-bldg', type: 'line', source: 'campus-zones',
        filter: ['==', ['get', 'isBuilding'], true],
        paint: {
          'line-color': lineColorExpr,
          'line-width': 1.5,
          'line-opacity': 0.6,
        },
      });

      // 산책로
      map.addSource('walkways', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: WALKWAYS.map((w) => ({
            type: 'Feature', properties: { id: w.id },
            geometry: { type: 'LineString', coordinates: w.coordinates },
          })),
        },
      });
      map.addLayer({
        id: 'walkways-line', type: 'line', source: 'walkways',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          'visibility': showCampusPaths ? 'visible' : 'none',
        },
        paint: { 'line-color': '#d8c88f', 'line-width': 1.8, 'line-opacity': 0.42 },
      });

      // 주요 도로 중심선 — 도로 폴리곤과 함께 실제 동선감을 보강
      map.addSource('campus-road-lines', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: CAMPUS_ROAD_CENTERLINES.map((r) => ({
            type: 'Feature',
            properties: { id: r.id, name: r.name },
            geometry: { type: 'LineString', coordinates: r.coordinates },
          })),
        },
      });
      map.addLayer({
        id: 'campus-road-line-casing',
        type: 'line',
        source: 'campus-road-lines',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          'visibility': showCampusPaths ? 'visible' : 'none',
        },
        paint: {
          'line-color': '#0d1117',
          'line-width': 5,
          'line-opacity': 0.28,
        },
      });
      map.addLayer({
        id: 'campus-road-line',
        type: 'line',
        source: 'campus-road-lines',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          'visibility': showCampusPaths ? 'visible' : 'none',
        },
        paint: {
          'line-color': '#b7c4d4',
          'line-width': 2.4,
          'line-opacity': 0.62,
        },
      });

      // ── 인하대 정의 건물 (3D) ──
      map.addSource('campus-buildings', { type: 'geojson', data: buildingsGeoJSON() });

      // 건물 색상 — 라이트 그레이 중심 + 태양광 포인트
      const buildingColorExpr = ['match', ['get', 'zoneType'],
        'old_building',   '#cfd6df',
        'new_building',   '#e5ebf0',
        'solar_building', '#ead38a',
        'hospital',       '#efd8d0',
        'auxiliary',      '#d8dee8',
        '#d7dee8',
      ];

      // 단일 fill-extrusion 레이어 — base 1m로 들어 올려서 OSM 위에
      map.addLayer(
        {
          id: 'campus-buildings-3d', type: 'fill-extrusion', source: 'campus-buildings',
          paint: {
            'fill-extrusion-color': buildingColorExpr,
            'fill-extrusion-height': ['+', ['get', 'height'], 1],
            'fill-extrusion-base': 1,
            'fill-extrusion-opacity': 0.96,
            'fill-extrusion-vertical-gradient': false,
          },
        },
        labelLayerId
      );

      // 디버그: GeoJSON에 들어간 건물 개수 + 샘플
      const bgj = buildingsGeoJSON();
      console.log(`[Map] campus-buildings GeoJSON: ${bgj.features.length} features`);
      if (bgj.features.length > 0) {
        const sample = bgj.features.slice(0, 3).map(f => ({
          name: f.properties.name,
          height: f.properties.height,
          zoneType: f.properties.zoneType,
          coords: f.geometry.coordinates[0].length + 'pts',
        }));
        console.log('[Map] 샘플:', sample);
      }

      // ── 캠퍼스 전력 인프라 (한전 인입점 + 변전실) ──
      // 인하대는 일반 대학과 비슷하게 정문 인근에 한전 인입점, 본관-인경호 사이 중앙 변전실로 추정
      const INFRA_POINTS = [
        { id: 'kepco_in', name: '⚡ 한전 인입점',
          lng: 126.65445, lat: 37.44805,  // 정문 진입로 부근
          color: '#d79a5c', height: 12,
          desc: '22.9kV 지중 인입선 종단점 (KEPCO ↔ 캠퍼스 변전실)' },
        { id: 'main_substation', name: '🔌 캠퍼스 주변전실',
          lng: 126.65525, lat: 37.44935,  // 본관 동측 중앙
          color: '#d6aa59', height: 10,
          desc: '22.9kV → 380V/220V 강압, 캠퍼스 전체 배전 분기점' },
      ];
      const infraFeatures = INFRA_POINTS.map((p) => {
        const r = 0.00006;
        const latRatio = 1 / Math.cos((p.lat * Math.PI) / 180);
        const rx = r * latRatio;
        const ring = [
          [p.lng - rx, p.lat - r], [p.lng + rx, p.lat - r],
          [p.lng + rx, p.lat + r], [p.lng - rx, p.lat + r],
          [p.lng - rx, p.lat - r],
        ];
        return {
          type: 'Feature',
          properties: { name: p.name, desc: p.desc, color: p.color, height: p.height },
          geometry: { type: 'Polygon', coordinates: [ring] },
        };
      });
      const infraLabelFeatures = INFRA_POINTS.map((p) => ({
        type: 'Feature',
        properties: { name: p.name },
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      }));
      map.addSource('infra-3d', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: infraFeatures },
      });
      map.addSource('infra-labels', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: infraLabelFeatures },
      });
      map.addLayer({
        id: 'infra-3d-layer',
        type: 'fill-extrusion',
        source: 'infra-3d',
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 1.0,
          'fill-extrusion-vertical-gradient': false,
        },
      });
      map.addLayer({
        id: 'infra-labels-layer',
        type: 'symbol',
        source: 'infra-labels',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 13,
          'text-font': ['Noto Sans Regular'],
          'text-allow-overlap': true,
          'text-offset': [0, -1.5],
        },
        paint: {
          'text-color': '#f1d88a',
          'text-halo-color': '#0d1117',
          'text-halo-width': 2.5,
        },
      });

      // 인프라 호버 팝업
      map.on('mousemove', 'infra-3d-layer', (e) => {
        const f = e.features[0];
        if (!f) return;
        popup
          .setLngLat(e.lngLat)
          .setHTML(`<strong>${f.properties.name}</strong><br/><span style="font-size:11px;color:#8b949e">${f.properties.desc}</span>`)
          .addTo(map);
      });
      map.on('mouseleave', 'infra-3d-layer', () => popup.remove());

      // ── 장식용 나무 ──
      const treeRadius = 0.000035;
      const decorTrees = {
        type: 'FeatureCollection',
        features: DECORATIVE_TREES.map((t, i) => {
          const ring = [];
          const sides = 6;
          const latRatio = 1 / Math.cos((t.lat * Math.PI) / 180);
          for (let s = 0; s < sides; s++) {
            const angle = (s / sides) * Math.PI * 2;
            ring.push([
              t.lng + Math.cos(angle) * treeRadius * latRatio,
              t.lat + Math.sin(angle) * treeRadius * 1.3,
            ]);
          }
          ring.push(ring[0]);
          return {
            type: 'Feature',
            properties: { height: 6 + ((i * 7) % 5), colorIdx: i % 3 },
            geometry: { type: 'Polygon', coordinates: [ring] },
          };
        }),
      };
      map.addSource('decorative-trees', { type: 'geojson', data: decorTrees });

      map.addLayer({
        id: 'trees-canopy', type: 'fill-extrusion', source: 'decorative-trees',
        paint: {
          'fill-extrusion-color': ['match', ['get', 'colorIdx'],
            0, '#5f9468', 1, '#6fa579', 2, '#527f5d', '#5f9468'],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': 1.5, 'fill-extrusion-opacity': 0.92,
          'fill-extrusion-vertical-gradient': true,
        },
      });
      map.addLayer({
        id: 'trees-trunk', type: 'fill-extrusion', source: 'decorative-trees',
        paint: {
          'fill-extrusion-color': '#7b6040',
          'fill-extrusion-height': 1.5, 'fill-extrusion-base': 0,
        },
      });

      // ── 라벨 ──
      // OpenFreeMap은 Noto Sans, Mapbox는 Open Sans → 둘 다 폴백 시도
      map.addLayer({
        id: 'zones-label', type: 'symbol', source: 'campus-zones',
        filter: ['!=', ['get', 'zoneType'], 'main_road'],
        layout: {
          'text-field': ['get', 'name'],
          'text-size': ['case', ['==', ['get', 'isBuilding'], true], 12, 11],
          'text-allow-overlap': false,
          'text-font': ['Noto Sans Regular'],
        },
        paint: { 'text-color': '#f8fafc', 'text-halo-color': '#0d1117', 'text-halo-width': 2.2 },
      });

      // ── 호버 팝업 핸들러 (popup 객체는 앞쪽에서 이미 생성됨) ──
      const onHover = (e) => {
        const f = e.features[0];
        if (!f) return;
        const { name, zoneType, note, floors } = f.properties;
        const typeLabel = {
          old_building: '노후건물', new_building: '신축건물', solar_building: '태양광 설치 건물',
          main_road: '주도로 (지중송전선)', parking: '주차장', green: '녹지',
          plaza: '포장 광장', sports: '운동장', hospital: '의료시설',
          water: '호수 (인경호)',
        }[zoneType] || zoneType;
        const floorInfo = floors ? `<br/><span style="font-size:11px;color:#b7e4c7">${floors}층</span>` : '';
        popup
          .setLngLat(e.lngLat)
          .setHTML(`<strong>${name}</strong><br/><span style="font-size:12px">${typeLabel}</span>${floorInfo}<br/><span style="font-size:11px;color:#8b949e">${note || ''}</span>`)
          .addTo(map);
      };
      map.on('mousemove', 'zones-ground-fill', onHover);
      map.on('mousemove', 'campus-buildings-3d', onHover);

      // OSM 배경 건물도 호버 시 OSM ID + 좌표 + 클릭 시 좌표 콘솔 출력
      map.on('mousemove', '3d-buildings', (e) => {
        const f = e.features[0];
        if (!f) return;
        const id = f.id || f.properties?.osm_id || '?';
        const h = f.properties?.render_height || '?';
        const { lng, lat } = e.lngLat;
        popup
          .setLngLat(e.lngLat)
          .setHTML(`<strong>OSM 배경 건물</strong>
            <br/><span style="font-size:12px;color:#c8d1dc">ID #${id}</span>
            <br/><span style="font-size:11px">render_height: ${h}m</span>
            <br/><span style="font-size:11px;color:#b7e4c7">${lng.toFixed(5)}, ${lat.toFixed(5)}</span>
            <br/><span style="font-size:10px;color:#8b949e">우클릭 → 콘솔에 좌표 출력</span>`)
          .addTo(map);
      });
      map.on('mouseleave', '3d-buildings', () => popup.remove());

      // 우클릭으로 위치 콘솔 출력 (사용자가 클릭한 건물의 좌표 식별용)
      map.on('contextmenu', '3d-buildings', (e) => {
        e.preventDefault();
        const f = e.features[0];
        const { lng, lat } = e.lngLat;
        console.log(`[OSM 우클릭] OSM ID=${f?.id || '?'}, 클릭위치=(${lng.toFixed(6)}, ${lat.toFixed(6)})`);
      });
      map.on('mousemove', 'water-fill', onHover);
      map.on('mouseleave', 'zones-ground-fill', () => popup.remove());
      map.on('mouseleave', 'campus-buildings-3d', () => popup.remove());
      map.on('mouseleave', 'water-fill', () => popup.remove());

      // ── 기존 설치 설비 (고정 자산) ──
      map.addSource('preinstalled-items', {
        type: 'geojson',
        data: placedItemsGeoJSON(showPreinstalled ? preinstalledItems : []),
      });
      map.addSource('preinstalled-labels', {
        type: 'geojson',
        data: preinstalledLabelsGeoJSON(showPreinstalled ? preinstalledItems : []),
      });
      map.addLayer({
        id: 'preinstalled-items-body',
        type: 'fill-extrusion',
        source: 'preinstalled-items',
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': ['get', 'top'],
          'fill-extrusion-base': ['get', 'base'],
          'fill-extrusion-opacity': 0.48,
          'fill-extrusion-vertical-gradient': true,
        },
      });
      map.addLayer({
        id: 'preinstalled-items-top',
        type: 'fill-extrusion',
        source: 'preinstalled-items',
        filter: ['==', ['get', 'isBody'], true],
        paint: {
          'fill-extrusion-color': '#f8fafc',
          'fill-extrusion-height': ['+', ['get', 'top'], 0.25],
          'fill-extrusion-base': ['get', 'top'],
          'fill-extrusion-opacity': 0.72,
        },
      });
      map.addLayer({
        id: 'preinstalled-labels-layer',
        type: 'symbol',
        source: 'preinstalled-labels',
        layout: {
          'text-field': ['get', 'badge'],
          'text-size': 11,
          'text-font': ['Noto Sans Regular'],
          'text-offset': [0, -1.6],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#0d1117',
          'text-halo-color': '#f8fafc',
          'text-halo-width': 2,
        },
      });
      map.on('mousemove', 'preinstalled-items-body', (e) => {
        const f = e.features[0];
        if (!f) return;
        const qty = Number(f.properties.qty || 1).toLocaleString();
        const year = f.properties.installedYear ? `${f.properties.installedYear}년` : '설치연도 미상';
        const unit = f.properties.unit || '개';
        const location = f.properties.locationName || '위치 정보 없음';
        popup
          .setLngLat(e.lngLat)
          .setHTML(`<strong>이미 설치됨 · ${f.properties.itemLabel}</strong><br/><span style="font-size:12px">${location}</span><br/><span style="font-size:11px;color:#8b949e">${year} · ${qty}${unit} · 고정 자산</span>`)
          .addTo(map);
      });
      map.on('mouseleave', 'preinstalled-items-body', () => popup.remove());

      // ── 배치된 아이템 (3D 익스트루전) ──
      map.addSource('placed-items', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

      // 본체
      map.addLayer({
        id: 'placed-items-body',
        type: 'fill-extrusion',
        source: 'placed-items',
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': ['get', 'top'],
          'fill-extrusion-base': ['get', 'base'],
          'fill-extrusion-opacity': 0.95,
          'fill-extrusion-vertical-gradient': true,
        },
      });
      // 윗면 강조 (얇은 레이어)
      map.addLayer({
        id: 'placed-items-top',
        type: 'fill-extrusion',
        source: 'placed-items',
        filter: ['==', ['get', 'isBody'], true],
        paint: {
          'fill-extrusion-color': ['get', 'topColor'],
          'fill-extrusion-height': ['+', ['get', 'top'], 0.3],
          'fill-extrusion-base': ['get', 'top'],
          'fill-extrusion-opacity': 1,
        },
      });

      // 호버 시 강조 + 클릭 시 삭제 안내
      map.on('mouseenter', 'placed-items-body', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'placed-items-body', () => {
        map.getCanvas().style.cursor = selectedRef.current ? 'crosshair' : '';
      });

      // 배치된 아이템 클릭 → 삭제 (Shift+클릭 또는 우클릭)
      const handleItemClick = (e) => {
        if (!e.features || !e.features[0]) return;
        const id = e.features[0].properties.parentId || e.features[0].properties.id;
        if (e.originalEvent.shiftKey) {
          e.preventDefault();
          onRemoveRef.current(id);
          return true;
        }
      };
      map.on('click', 'placed-items-body', handleItemClick);
      map.on('contextmenu', 'placed-items-body', (e) => {
        if (!e.features || !e.features[0]) return;
        e.preventDefault();
        onRemoveRef.current(e.features[0].properties.parentId || e.features[0].properties.id);
      });

      // ── 위치 선택 핀 (pickMode 전용) ──
      map.addSource('pick-pin', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'pick-pin-circle',
        type: 'circle',
        source: 'pick-pin',
        paint: {
          'circle-radius': 14,
          'circle-color': '#7ee787',
          'circle-stroke-color': '#0d1117',
          'circle-stroke-width': 3,
          'circle-opacity': 0.92,
        },
      });
      map.addLayer({
        id: 'pick-pin-emoji',
        type: 'symbol',
        source: 'pick-pin',
        layout: {
          'text-field': '📍',
          'text-size': 22,
          'text-allow-overlap': true,
          'text-offset': [0, -0.1],
        },
      });

      // 실천 기록 배지(practice-logs)는 useEffect 에서 idempotent 하게 셋업
    });

    // 일반 클릭 → 새 아이템 배치 또는 위치 선택 (pickMode)
    map.on('click', (e) => {
      if (e.originalEvent.shiftKey) return;

      // pickMode: 위치만 선택 (개인 실천 트랙)
      if (pickModeRef.current) {
        // 실천 기록 핀은 HTML marker 라 별도 click 핸들러가 처리 — 여기선 무시
        let locationName = '캠퍼스 일반 구역';
        const bldHits = map.queryRenderedFeatures(e.point, { layers: ['campus-buildings-3d'] });
        if (bldHits.length > 0) {
          locationName = bldHits[0].properties?.name || locationName;
        } else {
          const zoneHits = map.queryRenderedFeatures(e.point, { layers: ['zones-ground-fill'] });
          if (zoneHits.length > 0) locationName = zoneHits[0].properties?.name || locationName;
        }
        onPickRef.current?.(e.lngLat.lng, e.lngLat.lat, locationName);
        return;
      }

      const type = selectedRef.current;
      if (!type) return;

      // 이미 배치된 아이템 위 클릭 → 무시
      const placedHits = map.queryRenderedFeatures(e.point, { layers: ['placed-items-body'] });
      if (placedHits.length > 0) return;

      // 3D 건물 클릭 보정:
      // 사용자가 시각적으로 건물 옥상을 클릭하면 e.lngLat이 건물 footprint 너머
      // 지면에 떨어짐. 건물 레이어 hit-test로 클릭한 건물 폴리곤의 중앙 근처로 옮김.
      let { lng, lat } = e.lngLat;
      const bldHits = map.queryRenderedFeatures(e.point, { layers: ['campus-buildings-3d'] });
      if (bldHits.length > 0) {
        const props = bldHits[0].properties;
        const zone = CAMPUS_ZONES.find((z) => z.id === props.id);
        if (zone) {
          // 폴리곤 중심을 사용 (안전한 옥상 위치)
          let cx = 0, cy = 0;
          for (const [x, y] of zone.polygon) { cx += x; cy += y; }
          cx /= zone.polygon.length; cy /= zone.polygon.length;
          // 같은 건물에 여러 개 배치 시 겹치지 않게 약간씩 분산
          const offset = 0.000015;
          const angle = Math.random() * Math.PI * 2;
          const dist = Math.random() * offset;
          lng = cx + Math.cos(angle) * dist / Math.cos((cy * Math.PI) / 180);
          lat = cy + Math.sin(angle) * dist;
        }
      }
      onPlaceRef.current({ type, lng, lat });
    });

    map.on('contextmenu', (e) => e.preventDefault());

    return () => map.remove();
  }, []);

  // 배치 아이템 변경 시 GeoJSON 업데이트
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const update = () => {
      const src = map.getSource('placed-items');
      if (src) src.setData(placedItemsGeoJSON(items));
    };
    if (map.isStyleLoaded()) update();
    else map.once('load', update);
  }, [items]);

  // 기존 설비 토글/데이터 변경 시 GeoJSON 업데이트
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const update = () => {
      const visibleItems = showPreinstalled ? preinstalledItems : [];
      const src = map.getSource('preinstalled-items');
      const labelSrc = map.getSource('preinstalled-labels');
      if (src) src.setData(placedItemsGeoJSON(visibleItems));
      if (labelSrc) labelSrc.setData(preinstalledLabelsGeoJSON(visibleItems));
    };
    if (map.isStyleLoaded()) update();
    else map.once('load', update);
  }, [preinstalledItems, showPreinstalled]);

  // 실천 기록 — HTML marker 로 렌더 (사진 박힌 3D 핀)
  const practiceMarkersRef = useRef([]);
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    const render = () => {
      // 기존 마커 제거
      practiceMarkersRef.current.forEach((m) => {
        try { m.remove(); } catch {}
      });
      practiceMarkersRef.current = [];

      // 새 마커 생성
      practiceLogs
        .filter((log) => log?.location && typeof log.location.lng === 'number' && typeof log.location.lat === 'number')
        .forEach((log) => {
          const el = document.createElement('div');
          const isCounter = (Number(log.co2Saved) || 0) < 0;
          el.className = 'practice-pin' + (isCounter ? ' practice-pin-counter' : '');
          const signedCo2 = (Number(log.co2Saved) || 0).toFixed(2);
          el.title = `${log.icon || '✨'} ${log.practiceLabel || '실천'} (${signedCo2 >= 0 ? '+' : ''}${signedCo2} kgCO₂eq${isCounter ? ' · ⚠️ 역효과' : ''})`;
          el.innerHTML = `
            <div class="practice-pin-hole">
              ${log.photoPreview
                ? `<img class="practice-pin-photo" src="${log.photoPreview}" alt="" />`
                : `<span class="practice-pin-emoji">${log.icon || '✨'}</span>`}
            </div>
            ${isCounter ? '<div class="practice-pin-warning">⚠️</div>' : ''}
          `;
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            onLogClickRef.current?.(log.id);
          });
          const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat([log.location.lng, log.location.lat])
            .addTo(map);
          practiceMarkersRef.current.push(marker);
        });
    };

    if (map.loaded()) render();
    else map.once('load', render);

    return () => {
      practiceMarkersRef.current.forEach((m) => {
        try { m.remove(); } catch {}
      });
      practiceMarkersRef.current = [];
    };
  }, [practiceLogs]);

  // pickMode 위치 핀 동기화
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const update = () => {
      const src = map.getSource('pick-pin');
      if (!src) return;
      src.setData({
        type: 'FeatureCollection',
        features: pickedLocation ? [{
          type: 'Feature',
          properties: { name: pickedLocation.name || '' },
          geometry: { type: 'Point', coordinates: [pickedLocation.lng, pickedLocation.lat] },
        }] : [],
      });
    };
    if (map.isStyleLoaded()) update();
    else map.once('load', update);
  }, [pickedLocation]);

  // pickMode일 때 커서 변경
  useEffect(() => {
    if (!mapRef.current) return;
    const canvas = mapRef.current.getCanvas();
    if (pickMode) canvas.style.cursor = 'crosshair';
  }, [pickMode]);

  // 카메라 프리셋 변경 (단순화 — 항상 easeTo 직접 호출)
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const preset = CAMERA_PRESETS[cameraPreset] || CAMERA_PRESETS.iso;
    const move = () => {
      try {
        map.easeTo({
          center: INHA_CENTER,
          zoom: preset.zoom,
          pitch: preset.pitch,
          bearing: preset.bearing,
          duration: 650,
        });
      } catch (e) {
        console.warn('[camera] easeTo 실패:', e);
      }
    };
    // 로드 완료 여부와 관계없이 시도, 미완료면 load 이벤트에 백업 등록
    move();
    if (!map.loaded()) map.once('load', move);
  }, [cameraPreset]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const layerIds = ['walkways-line', 'campus-road-line-casing', 'campus-road-line'];
    const update = () => {
      const visibility = showCampusPaths ? 'visible' : 'none';
      for (const id of layerIds) {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', visibility);
        }
      }
    };
    if (map.isStyleLoaded()) update();
    else map.once('load', update);
  }, [showCampusPaths]);

  // 커서 변경
  useEffect(() => {
    if (!mapRef.current) return;
    const canvas = mapRef.current.getCanvas();
    canvas.style.cursor = selectedType ? 'crosshair' : '';
  }, [selectedType]);

  return <div id="map" ref={containerRef} />;
}
