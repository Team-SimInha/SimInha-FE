/**
 * 확장안 · 추후 진행 페이지
 *
 * 현 시점에서는 정책 시뮬레이터 (트랙 ①) 에 집중하고,
 * 아래 항목들은 발표자료의 "확장 로드맵" 으로만 표기합니다.
 *
 * 실제 구현 코드는 아래에 보존:
 *   - PersonalTrack.jsx, practices.js, practiceClassifier.js (개인 실천 트랙)
 *   - storage.js loadPracticeLogs / savePracticeLog / deletePracticeLog
 */

const ROADMAP_GROUPS = [
  {
    title: '🌱 트랙 ② · 개인 실천 기록',
    summary: '학생이 캠퍼스에서 실천한 탄소중립 행동을 사진·메모로 인증, AI가 자동 분류해 위치별 감축량을 시각화하고 주간/월간 보고서를 자동 생성',
    items: [
      '환경공학과 수업 (영수증 기반 탄소중립 보고서) 연계',
      '사진+짧은 설명 → AI 자동 활동 분류 (보조형, 카탈로그 기반 수치 유지)',
      '캠퍼스 미화 시각화 (꽃·나비 애니메이션)',
      '주간/월간 누적 보고서',
    ],
    status: '프로토타입 완료 · 정식 통합은 추후',
  },
  {
    title: '🏫 인하대 실데이터 확보',
    summary: '현행 추정치를 실측 데이터로 대체. 학생 개인 문의 불가, 지도교수/사업단장 직인 공문 필요',
    items: [
      '교내 탄소배출 감축 요소 설치 현황 (태양광·BEMS·LED 등 실측 용량)',
      '교내 전기/수도 사용량 (월별)',
      '에어컨 대장 (호기·연식·용량)',
      '전달처: 시설팀 · ESG 추진단',
    ],
    status: '공문 발송 준비 단계',
  },
  {
    title: '📅 연도별 예산 · 단가 하락 시간축',
    summary: '단발성 예산 소진이 아닌 연차별 예산 집행 + 기술 발전에 따른 친환경 설비 단가 하락 반영',
    items: [
      '연도별 예산 집행 시스템 (5년 / 10년 계획)',
      '태양광·BEMS 단가 하락 로직 (연 -3% 가정 등)',
      '캠퍼스 탄소중립 전략 수립책 활용 가능',
    ],
    status: '설계 단계',
  },
  {
    title: '➕ 신규 시뮬레이션 아이템',
    summary: '현재 10종 외 추가 검토 중',
    items: [
      '수자원(물) 절약 시스템 — 정수/하수 처리 전력 역산 → CO₂ 감축',
      '퍼스널 모빌리티 (지쿠터·따릉이 등) — 자동차 대체 시 Scope 3 감축',
      '※ 이중산정 주의 (전기차 충전소 + 전기차 이용 동시 산정 금지 등)',
    ],
    status: '연구 자료 수집 중',
  },
];

export default function RoadmapPage() {
  return (
    <div className="roadmap-page">
      <div className="roadmap-inner">
        <header className="roadmap-header">
          <div className="roadmap-kicker">확장 로드맵 · 추후 진행</div>
          <h1>🚧 다음 단계 확장안</h1>
          <p>
            현 버전은 <strong>정책 시뮬레이터 (시설팀·ESG 추진단·경진대회용)</strong> 단일 트랙에 집중합니다.<br />
            아래 항목들은 발표자료의 확장 로드맵으로만 표기되며, 추후 진행 예정입니다.
          </p>
        </header>

        <div className="roadmap-grid">
          {ROADMAP_GROUPS.map((group) => (
            <section key={group.title} className="roadmap-card">
              <div className="roadmap-card-header">
                <h2>{group.title}</h2>
                <span className="roadmap-status">{group.status}</span>
              </div>
              <p className="roadmap-summary">{group.summary}</p>
              <ul className="roadmap-list">
                {group.items.map((item, idx) => <li key={idx}>{item}</li>)}
              </ul>
            </section>
          ))}
        </div>

        <footer className="roadmap-footer">
          <p>
            💡 본 로드맵은 2026-05 연구실 자문 결과를 반영했습니다.<br />
            정식 도입 시점은 인하대 실데이터 확보 및 운영팀 협의 후 결정.
          </p>
        </footer>
      </div>
    </div>
  );
}
