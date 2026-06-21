/**
 * 실천 인증 이미지 분류 클라이언트
 *
 * 업로드된 인증 사진(base64 data URL)을 서버리스 함수(/api/classify-image)로 보내
 * 비전 LLM 이 어떤 실천 활동인지 판별한 결과를 받는다.
 *
 * 반환값은 practiceVerify.verifyPractice 의 imageResult 형태:
 *   { available, id, unclear, confidence }
 *   - available: 비전 분석을 실제로 수행했는지 (false = 미사용/실패 → 텍스트 단독 폴백)
 *   - id: 인식된 practice id (없으면 null)
 *   - unclear: 사진이 불명확해 활동을 특정하지 못함
 */
import { PRACTICES } from "./practices.js";

const VISION_API_PATH =
  import.meta.env.VITE_VISION_API_PATH || "/api/classify-image";
const VISION_ENABLED = (import.meta.env.VITE_VISION_MODE || "api") !== "off";

// LLM 이 동일한 practice id 로만 답하도록 후보 목록을 함께 전달
function practiceCatalog() {
  return PRACTICES.map((p) => ({ id: p.id, label: p.label, desc: p.desc }));
}

export function isVisionEnabled() {
  return VISION_ENABLED;
}

export async function classifyPracticeImage(imageDataUrl) {
  if (!VISION_ENABLED || !imageDataUrl) {
    return { available: false, id: null, unclear: false };
  }

  try {
    const res = await fetch(VISION_API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl, candidates: practiceCatalog() }),
    });
    if (!res.ok) throw new Error(`vision request failed: ${res.status}`);
    const data = await res.json();
    const id =
      typeof data.id === "string" && data.id !== "unknown" ? data.id : null;
    return {
      available: true,
      id,
      unclear: !id || data.unclear === true,
      confidence: Number(data.confidence || 0),
    };
  } catch (error) {
    // 모델이 이미지 입력을 미지원하거나 호출 실패 시 → 텍스트 단독 분류로 폴백
    console.warn(
      "[visionApi] classify failed, falling back to text-only",
      error,
    );
    return { available: false, id: null, unclear: false, error: String(error) };
  }
}
