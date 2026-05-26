/**
 * 실천 활동 자동 분류기 (키워드 기반, 로컬)
 *
 * 사용자가 적은 짧은 설명에서 키워드를 찾아
 * practices.js 의 어느 활동에 해당하는지 추정합니다.
 *
 * 향후 Upstage API 등 실제 AI 연동 시 이 모듈을 fallback 으로 유지하고
 * API 응답이 없을 때만 키워드 매칭을 사용하도록 확장 예정.
 */

const KEYWORDS = {
  tumbler:     ['텀블러', '머그컵', '머그', '개인컵', '개인 컵', '재사용 컵', '재사용컵', '내 컵', '내컵'],
  no_leftover: ['잔반', '음식물', '다 먹', '다먹', '깨끗이 먹', '깨끗이먹', '비웠', '잔반 없', '잔반없', '남기지 않', '남기지않'],
  veggie_meal: ['채식', '비건', '베지테리언', '샐러드', '야채 위주', '야채위주', '고기 안', '고기안'],
  transit:     ['대중교통', '버스', '지하철', '전철', '인천1호선', '인천 1호선', '7700', '광역버스', '시내버스'],
  walk_bike:   ['자전거', '도보', '걸어서', '걸었', '따릉이', '지쿠터', '킥보드', '전동킥보드', '전동 킥보드', '도보로', '걸어 옴', '걸어옴'],
  carpool:     ['카풀', '합승', '같이 탔', '같이탔', '함께 탔', '함께탔', '같이 타', '같이타', '나눠 탔', '나눠탔'],
  stairs:      ['계단', '엘리베이터 안', '엘리베이터안', '엘베 안', '엘베안', '걸어 올라', '걸어올라'],
  lights_off:  ['불 끄', '불끄', '소등', '전등 꺼', '전등꺼', '불을 끄', '불을끄', '꺼두', '꺼 두'],
  ac_setpoint: ['에어컨', '냉방', '온도 올', '온도올', '온도 내림', '온도내림', '온도 높', '온도높'],
  recycle:     ['분리수거', '재활용', '분리 배출', '분리배출', '캔', '페트병', 'pet'],
  reuse_paper: ['이면지', '뒷면', 'a4 재사용', 'a4재사용', '재활용지', '종이 재사용', '종이재사용'],
  tap_water:   ['물 잠그', '물잠그', '수도 잠그', '수도잠그', '양치', '잠갔', '물 절약', '물절약', '물 아끼', '물아끼'],

  // ── 역효과 (counterproductive) — 친환경 의도였으나 실제 LCA 분석 시 배출 증가 ──
  escooter_replace_walk: ['전동킥보드', '킥보드', '지쿠터', '라임', '빔', '전동스쿠터', '공유킥보드', '공유 킥보드', 'pm 탔', 'pm탔'],
  tumbler_single_use:    ['텀블러 샀', '텀블러샀', '텀블러 구매', '텀블러구매', '새 텀블러', '새텀블러', '텀블러 새로'],
  unnecessary_print:     ['출력했어요', '인쇄했어', '프린트했', '뽑았어', '출력해서 버', '인쇄해서 버'],
  food_waste_general:    ['음식물 일반', '음식물쓰레기 일반', '일반 쓰레기에 음식', '일반쓰레기에 음식', '음식 일반쓰레기'],
};

function normalize(s) {
  return String(s || '').toLowerCase().trim();
}

/**
 * 짧은 설명 텍스트를 분석해 가장 적합한 practice id 를 반환.
 *
 * @param {string} text - 사용자가 적은 설명
 * @returns {{ id: string|null, confidence: number, matchedKeyword: string|null, alternatives: Array<{id, keyword, score}> }}
 *   - id: 매칭된 practice id (없으면 null)
 *   - confidence: 매칭 점수 (키워드 길이 기준, 클수록 신뢰도↑)
 *   - matchedKeyword: 어떤 키워드 때문에 매칭됐는지 (UX 안내용)
 *   - alternatives: 차순위 후보 (사용자가 다른 걸 고를 때 참고용)
 */
export function classifyPractice(text) {
  const normalized = normalize(text);
  if (!normalized) {
    return { id: null, confidence: 0, matchedKeyword: null, alternatives: [] };
  }

  const hits = [];
  for (const [id, keywords] of Object.entries(KEYWORDS)) {
    for (const kw of keywords) {
      const nkw = normalize(kw);
      if (normalized.includes(nkw)) {
        hits.push({ id, keyword: kw, score: nkw.length });
      }
    }
  }

  if (hits.length === 0) {
    return { id: null, confidence: 0, matchedKeyword: null, alternatives: [] };
  }

  hits.sort((a, b) => b.score - a.score);
  const best = hits[0];

  // 같은 id 의 중복 제거하면서 차순위 후보 추출 (최대 3개)
  const seen = new Set([best.id]);
  const alternatives = [];
  for (const h of hits.slice(1)) {
    if (!seen.has(h.id)) {
      alternatives.push(h);
      seen.add(h.id);
      if (alternatives.length >= 3) break;
    }
  }

  return {
    id: best.id,
    confidence: best.score,
    matchedKeyword: best.keyword,
    alternatives,
  };
}
