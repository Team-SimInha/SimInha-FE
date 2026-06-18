/**
 * 실천 인증 교차 검증
 *
 * 이미지(비전 LLM)와 설명(키워드 매칭)을 각각 활동 id 로 분류한 뒤 비교한다.
 *   - 두 결과가 같으면          → 인정 (accepted)
 *   - 두 결과가 다르면          → 불일치 반려 (mismatch)
 *   - 이미지만 인식, 설명 없음   → 설명 보완 요청 (need_description)
 *   - 사진 불명확 + 설명 있음    → 사진 재촬영 요청 (need_rephoto)
 *   - 둘 다 인식 실패           → 직접 선택 (unrecognized)
 *   - 비전 분석 자체가 불가      → 설명 단독으로 진행 (fallback_text)
 */

export const VERIFY_STATUS = {
  ACCEPTED: "accepted",
  MISMATCH: "mismatch",
  NEED_DESCRIPTION: "need_description",
  NEED_REPHOTO: "need_rephoto",
  UNRECOGNIZED: "unrecognized",
  FALLBACK_TEXT: "fallback_text",
};

/**
 * @param {object} input
 * @param {{ available:boolean, id:string|null, unclear:boolean }} input.imageResult - 비전 분류 결과
 * @param {{ id:string|null }} input.textResult - 키워드 분류 결과
 * @param {(id:string)=>string} labelOf - id → 사람이 읽을 라벨 (메시지용)
 * @returns {{ status:string, id?:string, imageId?:string, textId?:string, message:string }}
 */
export function verifyPractice(
  { imageResult, textResult } = {},
  labelOf = (id) => id,
) {
  const textId = textResult && textResult.id ? textResult.id : null;
  const visionAvailable = !!(imageResult && imageResult.available);
  const imageId =
    visionAvailable && !imageResult.unclear && imageResult.id
      ? imageResult.id
      : null;
  const imageUnclear = visionAvailable && !imageId; // 분석은 했지만 활동을 특정 못함

  // 비전 분석을 쓸 수 없음 (호출 실패 / 모델 미지원 / 비활성) → 설명 단독 진행
  if (!visionAvailable) {
    if (textId) {
      return {
        status: VERIFY_STATUS.FALLBACK_TEXT,
        id: textId,
        message: "이미지 분석을 사용할 수 없어 설명 기반으로 분류했어요.",
      };
    }
    return {
      status: VERIFY_STATUS.NEED_DESCRIPTION,
      message: "활동을 인식하지 못했어요. 설명을 보완해 주세요.",
    };
  }

  // 이미지·설명 모두 인식됨 → 교차 검증
  if (imageId && textId) {
    if (imageId === textId) {
      return {
        status: VERIFY_STATUS.ACCEPTED,
        id: imageId,
        message: "이미지와 설명이 일치합니다.",
      };
    }
    return {
      status: VERIFY_STATUS.MISMATCH,
      imageId,
      textId,
      message: `작성한 실천 내용(${labelOf(textId)})과 제출한 이미지(${labelOf(imageId)})가 일치하지 않습니다. 다시 확인해 주세요.`,
    };
  }

  // 이미지만 인식, 설명에서 활동 못 찾음 → 설명 보완 요청
  if (imageId && !textId) {
    return {
      status: VERIFY_STATUS.NEED_DESCRIPTION,
      id: imageId,
      message:
        "이미지는 인식했지만 설명에서 활동을 찾지 못했어요. 설명을 보완해 주세요.",
    };
  }

  // 사진 불명확 + 설명 있음 → 사진 재촬영 요청
  if (imageUnclear && textId) {
    return {
      status: VERIFY_STATUS.NEED_REPHOTO,
      id: textId,
      message:
        "사진이 불명확해 활동을 인식하지 못했어요. 사진을 다시 촬영해 주세요.",
    };
  }

  // 둘 다 인식 실패
  return {
    status: VERIFY_STATUS.UNRECOGNIZED,
    message:
      "사진과 설명 모두에서 활동을 인식하지 못했어요. 직접 선택하거나 다시 작성해 주세요.",
  };
}
