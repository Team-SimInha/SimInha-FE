// 실천 인증 이미지 분류 (비전 LLM)
//
// 업로드된 인증 사진(base64 data URL)을 받아, 후보 활동 목록 중 하나의 id로 분류한다.
// PersonalTrack 의 키워드 매칭 결과와 교차 검증하기 위해 동일한 practice id 로만 답하도록 강제.
//
// ※ OpenAI Chat Completions API(이미지 입력 지원 모델)를 사용한다. 실패 시 이 함수는
//   비-200 을 반환하고, 프론트(visionApi.js)는 설명(키워드) 기반 단독 분류로 폴백한다.
const DEFAULT_MODEL = "gpt-4o-mini";

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function buildValidIdSet(candidates) {
  return new Set(
    (Array.isArray(candidates) ? candidates : [])
      .map((c) => c && c.id)
      .filter(Boolean),
  );
}

function promptFor(candidates) {
  const list = (Array.isArray(candidates) ? candidates : [])
    .map((c) => `- ${c.id}: ${c.label}${c.desc ? ` — ${c.desc}` : ""}`)
    .join("\n");
  return [
    '너는 대학 캠퍼스 탄소중립 "실천 인증 사진"을 분류하는 도우미다.',
    "첨부된 이미지가 아래 활동 목록 중 어떤 것인지 한 가지만 판별하라.",
    '이미지가 흐리거나, 활동을 특정할 수 없거나, 목록에 없는 행동이면 id 를 "unknown" 으로 한다.',
    "반드시 목록에 있는 id 문자열만 사용한다. 새 id 를 만들지 않는다.",
    "",
    "활동 목록 (id: 라벨 — 설명):",
    list,
    "",
    "반드시 아래 형태의 JSON 객체만 반환한다. Markdown 코드펜스나 다른 텍스트 금지.",
    JSON.stringify({
      id: "활동 id 또는 unknown",
      confidence: 0.0,
      unclear: false,
    }),
  ].join("\n");
}

function parseModelJson(content) {
  const raw = typeof content === "string" ? content.trim() : "";
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start)
    throw new Error("No JSON object in model response");
  return JSON.parse(candidate.slice(start, end + 1));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    sendJson(res, 500, { error: "OPENAI_API_KEY is not configured" });
    return;
  }

  try {
    const payload =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const imageDataUrl = payload?.imageDataUrl;
    const candidates = Array.isArray(payload?.candidates)
      ? payload.candidates
      : [];
    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      sendJson(res, 400, {
        error: "imageDataUrl (base64 data URL) is required",
      });
      return;
    }

    const model = process.env.OPENAI_VISION_MODEL || DEFAULT_MODEL;
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You return strict JSON only. Do not wrap JSON in markdown fences.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: promptFor(candidates) },
              // base64 data URL 을 그대로 전달 (OpenAI 가 지원). detail:'low' 로 비용 절감.
              {
                type: "image_url",
                image_url: { url: imageDataUrl, detail: "low" },
              },
            ],
          },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
        stream: false,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      sendJson(res, response.status, {
        error: "OpenAI vision request failed",
        detail:
          data?.error?.message || data?.message || "Unknown upstream error",
      });
      return;
    }

    const parsed = parseModelJson(data?.choices?.[0]?.message?.content || "");
    const validIds = buildValidIdSet(candidates);
    const rawId = typeof parsed.id === "string" ? parsed.id.trim() : "unknown";
    const id = validIds.has(rawId) ? rawId : "unknown";
    sendJson(res, 200, {
      id,
      confidence: Number(parsed.confidence || 0),
      unclear: id === "unknown" || parsed.unclear === true,
      model,
    });
  } catch (error) {
    sendJson(res, 500, {
      error: "Vision classification failed",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
