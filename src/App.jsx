import { useCallback, useEffect, useMemo, useState } from 'react';
import Palette from './Palette.jsx';
import CampusMap from './Map.jsx';
import Leaderboard from './Leaderboard.jsx';
import PersonalTrack from './PersonalTrack.jsx';
import { DEFAULT_BUDGET, ITEM_MAP, REFERENCE_SOURCES } from './items.js';
import { checkPlacement } from './zones.js';
import { calculateDashboardMetrics } from './penalties.js';
import { PREINSTALLED_ITEMS, PREINSTALLED_NOTE } from './preinstalled.js';
import { deleteScenario, loadScenarios, renameScenario, saveLeaderboardEntry, saveScenario } from './storage.js';
import { buildReportMarkdown, requestScenarioReport } from './reportApi.js';

const ONBOARDING_KEY = 'inha-carbon-sim.onboarding.v1';
const TOUR_STEPS = [
  {
    title: '1. 정책 시뮬레이터 소개',
    body: '본 도구는 시설팀·ESG 추진단·경진대회 심사위원을 위한 캠퍼스 탄소중립 정책 시뮬레이터입니다. 모든 수치는 공인 가이드라인(한국에너지공단·한전 배출계수·국립산림과학원 등) 기반 추정치이며, 출처는 각 설비 카드 및 리포트에 표기됩니다.',
  },
  {
    title: '2. 설비와 예산을 확인하세요',
    body: '왼쪽 패널에서 설비별 절감량, 에너지 효과, 설치 비용, 출처를 확인하고 선택합니다. 예산을 넘는 설비는 자동으로 비활성화됩니다.',
  },
  {
    title: '3. 현실 제약을 반영해 배치하세요',
    body: '도로/보행로/녹지/옥상 공조설비 등 실제 제약이 자동 적용됩니다. 녹지 위 설치 시 흡수량 손실, 옥상 설치 시 공조설비 면적 충돌 등은 트레이드오프로 계산됩니다.',
  },
  {
    title: '4. 대시보드와 분석을 읽으세요',
    body: '상단 카드는 신규 배치 성과(탄소·에너지·비용 효율)를 보여줍니다. 기존 설비 베이스라인은 별도 합산되며, 이중산정 방지 로직이 적용됩니다.',
  },
  {
    title: '5. 시나리오 저장 · AI 리포트',
    body: '오른쪽에서 시나리오 저장/비교가 가능합니다. AI 리포트는 배치 제약·트레이드오프·밀집도를 모두 반영해 정책 검토 문서를 자동 생성합니다.',
  },
];

const CAMERA_OPTIONS = [
  { id: 'flat', label: '평면' },
  { id: 'iso', label: '아이소' },
  { id: 'threeD', label: '3D' },
];

function formatKrw(value) {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억원`;
  if (value >= 10000) return `${Math.round(value / 10000).toLocaleString()}만원`;
  return `${Math.round(value || 0).toLocaleString()}원`;
}

function metricSnapshot(metrics) {
  return {
    user: {
      netSaving: metrics.user.netSaving,
      energyKwh: metrics.user.energyKwh,
      totalCost: metrics.user.totalCost,
      efficiencyScore: metrics.user.efficiencyScore,
      carbonScore: metrics.user.carbonScore,
    },
    baseline: {
      netSaving: metrics.baseline.netSaving,
      energyKwh: metrics.baseline.energyKwh,
    },
    total: {
      netSaving: metrics.total.netSaving,
      energyKwh: metrics.total.energyKwh,
      efficiencyScore: metrics.total.efficiencyScore,
    },
    budget: metrics.budget,
    usedBudget: metrics.usedBudget,
    remainingBudget: metrics.remainingBudget,
    constraintSignals: {
      greenSacrificePenalty: metrics.total.greenSacrificePenalty || 0,
      greenSacrificeBreakdown: metrics.total.greenSacrificeBreakdown || [],
      rooftopUsage: metrics.total.rooftopUsage || [],
      doubleCountGuards: metrics.total.doubleCountGuards || [],
      embodiedPenalty: metrics.total.embodiedPenalty || 0,
      diminishingPenalty: metrics.total.diminishingPenalty || 0,
      synergyPenalty: metrics.total.synergyPenalty || 0,
      synergyBonus: metrics.total.synergyBonus || 0,
    },
  };
}

function buildReportItems(items) {
  return items.map((item) => {
    const meta = ITEM_MAP[item.type] || {};
    const qty = item.qty || 1;
    const baseSaving = Number(meta.coeff || 0) * qty;
    const saving = Number(item.effectiveCoeff ?? meta.coeff ?? 0) * qty;
    const locationName = item.locationName || item.zoneName || '일반 구역';
    return {
      id: item.id,
      type: item.type,
      label: meta.label || item.type,
      qty,
      unit: meta.unit || '개',
      locationName,
      zoneName: item.zoneName || locationName,
      zoneId: item.zoneId || '',
      zoneType: item.zoneType || 'general',
      zoneYear: item.zoneYear || null,
      zoneFloors: item.zoneFloors || null,
      zoneNote: item.zoneNote || '',
      zoneReason: item.zoneReason || '',
      placementReason: item.zoneReason || '',
      lng: item.lng,
      lat: item.lat,
      costKrw: Number(meta.cost || 0) * qty,
      baseSavingKgCO2PerYear: baseSaving,
      savingKgCO2PerYear: saving,
      energyKwhPerYear: Number(meta.energyKwh || 0) * qty,
      efficiencyRate: baseSaving > 0 ? Math.round((saving / baseSaving) * 100) : 100,
    };
  });
}

function renderInlineMarkdown(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    return <span key={idx}>{part}</span>;
  });
}

function MarkdownView({ markdown }) {
  const lines = markdown.split('\n');
  const blocks = [];

  const isTableSeparator = (line) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
  const splitTableRow = (line) => line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    if (!line.trim()) continue;

    if (line.startsWith('# ')) {
      blocks.push({ type: 'h1', text: line.slice(2) });
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3) });
      continue;
    }
    if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', text: line.slice(4) });
      continue;
    }
    if (line.trim().startsWith('|') && lines[idx + 1] && isTableSeparator(lines[idx + 1])) {
      const tableLines = [line];
      idx += 2;
      while (idx < lines.length && lines[idx].trim().startsWith('|')) {
        tableLines.push(lines[idx]);
        idx += 1;
      }
      idx -= 1;
      blocks.push({
        type: 'table',
        header: splitTableRow(tableLines[0]),
        rows: tableLines.slice(1).map(splitTableRow),
      });
      continue;
    }
    if (line.startsWith('- ')) {
      const items = [];
      while (idx < lines.length && lines[idx].startsWith('- ')) {
        items.push(lines[idx].slice(2));
        idx += 1;
      }
      idx -= 1;
      blocks.push({ type: 'ul', items });
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (idx < lines.length && /^\d+\.\s/.test(lines[idx])) {
        items.push(lines[idx].replace(/^\d+\.\s/, ''));
        idx += 1;
      }
      idx -= 1;
      blocks.push({ type: 'ol', items });
      continue;
    }

    const paragraph = [line.trim()];
    while (
      idx + 1 < lines.length &&
      lines[idx + 1].trim() &&
      !lines[idx + 1].startsWith('#') &&
      !lines[idx + 1].startsWith('- ') &&
      !/^\d+\.\s/.test(lines[idx + 1]) &&
      !lines[idx + 1].trim().startsWith('|')
    ) {
      idx += 1;
      paragraph.push(lines[idx].trim());
    }
    blocks.push({ type: 'p', text: paragraph.join(' ') });
  }

  return (
    <div className="markdown-body">
      {blocks.map((block, idx) => {
        if (block.type === 'h1') return <h2 key={idx}>{renderInlineMarkdown(block.text)}</h2>;
        if (block.type === 'h2') return <h3 key={idx}>{renderInlineMarkdown(block.text)}</h3>;
        if (block.type === 'h3') return <h4 key={idx}>{renderInlineMarkdown(block.text)}</h4>;
        if (block.type === 'ul') {
          return (
            <ul key={idx}>
              {block.items.map((item, itemIdx) => <li key={itemIdx}>{renderInlineMarkdown(item)}</li>)}
            </ul>
          );
        }
        if (block.type === 'ol') {
          return (
            <ol key={idx}>
              {block.items.map((item, itemIdx) => <li key={itemIdx}>{renderInlineMarkdown(item)}</li>)}
            </ol>
          );
        }
        if (block.type === 'table') {
          return (
            <div key={idx} className="markdown-table-wrap">
              <table>
                <thead>
                  <tr>{block.header.map((cell, cellIdx) => <th key={cellIdx}>{renderInlineMarkdown(cell)}</th>)}</tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIdx) => (
                    <tr key={rowIdx}>
                      {row.map((cell, cellIdx) => <td key={cellIdx}>{renderInlineMarkdown(cell)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <p key={idx}>{renderInlineMarkdown(block.text)}</p>;
      })}
    </div>
  );
}

function ReportModal({ report, loading, onClose, onDownload }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="report-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-kicker">AI Report</div>
            <h2>{report?.title || 'AI 탄소중립 리포트'}</h2>
          </div>
          <div className="modal-actions">
            <button className="secondary small-button" onClick={onDownload} disabled={loading || !report}>
              MD 다운로드
            </button>
            <button className="secondary icon-button" onClick={onClose} aria-label="닫기">×</button>
          </div>
        </div>
        {loading ? (
          <div className="report-loading">리포트를 생성하는 중입니다...</div>
        ) : (
          <>
            {report?.source === 'fallback' && (
              <div className="report-fallback">API 응답이 없어 계산 결과 기반 리포트를 표시합니다.</div>
            )}
            {report?.highlights?.length > 0 && (
              <div className="report-highlights">
                {report.highlights.map((item) => <span key={item}>{item}</span>)}
              </div>
            )}
            <MarkdownView markdown={report?.markdown || ''} />
          </>
        )}
      </div>
    </div>
  );
}

function OnboardingTour({ step, total, onNext, onPrev, onClose }) {
  const current = TOUR_STEPS[step];
  return (
    <div className="modal-backdrop onboarding-backdrop" role="presentation" onClick={onClose}>
      <div className="onboarding-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-kicker">Quick Tour</div>
        <h2>{current.title}</h2>
        <p>{current.body}</p>
        <div className="tour-progress" aria-label={`온보딩 ${step + 1}/${total}`}>
          {TOUR_STEPS.map((item, idx) => (
            <span key={item.title} className={idx === step ? 'active' : ''} />
          ))}
        </div>
        <div className="tour-actions">
          <button className="secondary" onClick={onClose}>건너뛰기</button>
          <div>
            <button className="secondary" onClick={onPrev} disabled={step === 0}>이전</button>
            <button onClick={onNext}>{step === total - 1 ? '시작하기' : '다음'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SourcesModal({ onClose }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="report-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-kicker">참고 가이드라인</div>
            <h2>📚 본 시뮬레이터의 수치 출처</h2>
          </div>
          <button className="secondary icon-button" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <p style={{ color: '#8b949e', fontSize: 13, lineHeight: 1.6, marginTop: 10 }}>
          모든 설비별 감축계수·단가는 아래 공인 가이드라인 기반 추정치입니다. 임의 수치는 사용하지 않습니다.
          실제 시공 전에는 현장조건·실측데이터로 보정이 필요합니다.
        </p>
        <ul style={{ marginTop: 14, paddingLeft: 22, color: '#c9d1d9', lineHeight: 1.8, fontSize: 13 }}>
          {REFERENCE_SOURCES.map((src) => <li key={src}>{src}</li>)}
        </ul>
        <p style={{ color: '#f2cc60', fontSize: 12, marginTop: 16 }}>
          ⚠️ 인하대 실데이터(시설팀·ESG 추진단 협조) 확보 후 1차 보정 예정 (확장 로드맵 참조).
        </p>
      </div>
    </div>
  );
}

function ScenarioPanel({ scenarios, activeScenarioId, onSave, onLoad, onRename, onDelete }) {
  return (
    <section className="scenario-panel">
      <div className="panel-title-row">
        <h2>시나리오</h2>
        <button className="secondary small-button" onClick={onSave}>저장</button>
      </div>
      {scenarios.length === 0 && <div className="empty compact">저장된 시나리오가 없습니다</div>}
      {scenarios.map((scenario) => (
        <div key={scenario.id} className={'scenario-entry ' + (activeScenarioId === scenario.id ? 'active' : '')}>
          <button className="scenario-main" onClick={() => onLoad(scenario)}>
            <strong>{scenario.name}</strong>
            <span>
              {(scenario.metrics?.user?.netSaving / 1000 || 0).toFixed(1)}t · {scenario.items?.length || 0}개
            </span>
          </button>
          <button className="secondary mini-button" onClick={() => onRename(scenario)}>이름</button>
          <button className="danger mini-button" onClick={() => onDelete(scenario)}>삭제</button>
        </div>
      ))}
    </section>
  );
}

function Dashboard({ metrics, itemCount, showDetail, onToggleDetail }) {
  const calc = metrics.total;
  return (
    <div className="dashboard">
      <div className="metric-card">
        <div className="metric-label">탄소</div>
        <div className={'metric-value ' + (metrics.user.netSaving < 0 ? 'negative' : '')}>
          {(metrics.user.netSaving / 1000).toFixed(2)}t
        </div>
        <div className="metric-sub">
          기존 {(metrics.baseline.netSaving / 1000).toFixed(1)}t · 총 {(metrics.total.netSaving / 1000).toFixed(1)}t
        </div>
      </div>
      <div className="metric-card">
        <div className="metric-label">에너지</div>
        <div className="metric-value">{metrics.user.energyKwh.toLocaleString()}</div>
        <div className="metric-sub">kWh/년 · 총 {metrics.total.energyKwh.toLocaleString()} kWh</div>
      </div>
      <div className="metric-card">
        <div className="metric-label">효율</div>
        <div className="metric-value">{metrics.user.efficiencyScore}</div>
        <div className="metric-sub">kgCO₂/백만원 · {formatKrw(metrics.usedBudget)} 사용</div>
      </div>

      <div className="dashboard-breakdown">
        <div className="bar-row">
          <span className="bar-label">신규 배치</span>
          <span className="bar-value positive">{itemCount}개</span>
        </div>
        <div className="bar-row">
          <span className="bar-label">잔여 예산</span>
          <span className={'bar-value ' + (metrics.remainingBudget < 0 ? 'negative' : 'positive')}>
            {formatKrw(Math.max(metrics.remainingBudget, 0))}
          </span>
        </div>
        {calc.embodiedPenalty > 0 && (
          <div className="bar-row">
            <span className="bar-label">설치 탄소</span>
            <span className="bar-value negative">-{calc.embodiedPenalty.toLocaleString()}</span>
          </div>
        )}
        {calc.synergyBonus > 0 && (
          <div className="bar-row">
            <span className="bar-label">긍정 시너지</span>
            <span className="bar-value positive">+{calc.synergyBonus.toLocaleString()}</span>
          </div>
        )}
      </div>

      {(calc.details.length > 0 || calc.warnings.length > 0) && (
        <button className="detail-toggle" onClick={onToggleDetail}>
          {showDetail ? '▲ 상세 닫기' : '▼ 상세 분석 보기'} ({calc.details.length + calc.warnings.length})
        </button>
      )}
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState('infra');
  const [nickname, setNickname] = useState('');
  const [selectedType, setSelectedType] = useState(null);
  const [items, setItems] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showPreinstalled, setShowPreinstalled] = useState(true);
  const [scenarios, setScenarios] = useState(() => loadScenarios());
  const [activeScenarioId, setActiveScenarioId] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [cameraPreset, setCameraPreset] = useState('iso');
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDING_KEY) !== 'done';
    } catch {
      return true;
    }
  });

  const metrics = useMemo(
    () => calculateDashboardMetrics(items, PREINSTALLED_ITEMS, DEFAULT_BUDGET),
    [items]
  );

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), type === 'error' ? 4000 : 2500);
  }, []);

  const canAffordItem = useCallback(
    (type) => {
      const meta = ITEM_MAP[type];
      if (!meta || meta.coeff === 0) return false;
      return metrics.remainingBudget >= meta.cost;
    },
    [metrics.remainingBudget]
  );

  useEffect(() => {
    if (selectedType && !canAffordItem(selectedType)) setSelectedType(null);
  }, [canAffordItem, selectedType]);

  const handlePlace = useCallback((raw) => {
    const meta = ITEM_MAP[raw.type];
    if (!meta || meta.coeff === 0) {
      showToast('선택한 설비는 점수에 반영되지 않아 배치할 수 없습니다', 'error');
      return;
    }
    if (metrics.remainingBudget < meta.cost) {
      showToast(`${meta.label} 설치 예산이 부족합니다`, 'error');
      return;
    }

    const result = checkPlacement(raw.type, raw.lng, raw.lat);
    if (!result.allowed) {
      const zoneName = result.zone ? `[${result.zone.name}] ` : '';
      showToast(`${zoneName}${result.reason}`, 'error');
      return;
    }

    const penalty = result.penalty || 1;
    const effectiveCoeff = Math.round(meta.coeff * penalty);
    const id = crypto.randomUUID();
    setItems((prev) => [...prev, {
      id,
      qty: 1,
      ...raw,
      effectiveCoeff,
      locationName: result.zone?.name || '일반 구역',
      zoneId: result.zone?.id || '',
      zoneType: result.zone?.type || 'general',
      zoneYear: result.zone?.year || null,
      zoneFloors: result.zone?.floors || null,
      zoneNote: result.zone?.note || '',
      zoneName: result.zone?.name || '일반 구역',
      zoneReason: result.reason,
    }]);
    setActiveScenarioId(null);

    if (result.zone) {
      const penaltyNote =
        penalty < 1 ? ` (효율 ${Math.round(penalty * 100)}%)` :
        penalty > 1 ? ` (보너스 +${Math.round((penalty - 1) * 100)}%)` : '';
      showToast(`[${result.zone.name}] ${result.reason}${penaltyNote}`);
    }
  }, [metrics.remainingBudget, showToast]);

  const handleRemove = useCallback((id) => {
    setItems((prev) => prev.filter((it) => it.id !== id && !it.locked));
    setActiveScenarioId(null);
  }, []);

  const handleReset = () => {
    if (items.length && !confirm('모든 신규 배치를 초기화할까요?')) return;
    setItems([]);
    setActiveScenarioId(null);
  };

  const refreshScenarios = () => setScenarios(loadScenarios());

  const handleSaveScenario = () => {
    const defaultName = nickname.trim() || `시나리오 ${scenarios.length + 1}`;
    const name = prompt('시나리오 이름을 입력하세요', defaultName);
    if (name === null) return;
    const saved = saveScenario({
      name,
      nickname,
      items,
      metrics: metricSnapshot(metrics),
    });
    setActiveScenarioId(saved.id);
    refreshScenarios();
    showToast('시나리오를 저장했습니다');
  };

  const handleLoadScenario = (scenario) => {
    setItems(scenario.items || []);
    setNickname(scenario.nickname || '');
    setSelectedType(null);
    setActiveScenarioId(scenario.id);
    showToast(`${scenario.name} 불러오기 완료`);
  };

  const handleRenameScenario = (scenario) => {
    const name = prompt('새 이름을 입력하세요', scenario.name);
    if (name === null) return;
    renameScenario(scenario.id, name);
    refreshScenarios();
  };

  const handleDeleteScenario = (scenario) => {
    if (!confirm(`${scenario.name} 시나리오를 삭제할까요?`)) return;
    deleteScenario(scenario.id);
    if (activeScenarioId === scenario.id) setActiveScenarioId(null);
    refreshScenarios();
  };

  const handleReport = async () => {
    setReportOpen(true);
    setReportLoading(true);
    const reportItems = buildReportItems(items);
    const nextReport = await requestScenarioReport({
      nickname,
      items: reportItems,
      reportItems,
      metrics: metricSnapshot(metrics),
      analysisSignals: {
        warnings: metrics.total.warnings,
        details: metrics.total.details,
      },
    });
    setReport(nextReport);
    setReportLoading(false);
  };

  const handleDownloadReport = () => {
    if (!report) return;
    const markdown = buildReportMarkdown(report);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = report.fileName || 'inha-carbon-report.md';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('Markdown 리포트를 다운로드했습니다');
  };

  const closeOnboarding = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, 'done');
    } catch {}
    setShowOnboarding(false);
  };

  const handleSubmit = async () => {
    if (items.length === 0) return showToast('최소 1개 이상 배치하세요', 'error');
    const submitNickname = nickname.trim() || '익명';

    const entry = saveLeaderboardEntry({
      nickname: submitNickname,
      items,
      metrics: metricSnapshot(metrics),
    });
    showToast(`🎉 ${submitNickname} · ${(entry.total_saving / 1000).toFixed(2)}t CO₂ 로컬 리더보드 등록!`);
    setRefreshKey((k) => k + 1);
  };

  const calc = metrics.total;

  return (
    <div className="app-shell">
      <header className="track-tabs">
        <button
          className={'track-tab' + (mode === 'infra' ? ' active' : '')}
          onClick={() => setMode('infra')}
        >
          🏛 정책 시뮬레이터
        </button>
        <button
          className={'track-tab' + (mode === 'personal' ? ' active' : '')}
          onClick={() => setMode('personal')}
        >
          🌱 개인 실천 기록
        </button>
      </header>

      {mode === 'personal' ? (
        <PersonalTrack />
      ) : (
        <div className="app">
      <Palette
        selected={selectedType}
        onSelect={setSelectedType}
        nickname={nickname}
        onNickname={setNickname}
        budget={metrics.budget}
        usedBudget={metrics.usedBudget}
        remainingBudget={metrics.remainingBudget}
        canAffordItem={canAffordItem}
      />

      <div className="map-wrap">
        <CampusMap
          selectedType={selectedType}
          items={items}
          preinstalledItems={PREINSTALLED_ITEMS}
          showPreinstalled={showPreinstalled}
          cameraPreset={cameraPreset}
          onPlace={handlePlace}
          onRemove={handleRemove}
        />

        <Dashboard
          metrics={metrics}
          itemCount={items.length}
          showDetail={showDetail}
          onToggleDetail={() => setShowDetail(!showDetail)}
        />

        {showDetail && (calc.details.length > 0 || calc.warnings.length > 0) && (
          <div className="detail-panel">
            {calc.warnings.map((w, i) => (
              <div key={'w' + i} className="detail-warn">{w}</div>
            ))}
            {calc.details.map((d, i) => (
              <div key={'d' + i} className="detail-item">{d}</div>
            ))}
          </div>
        )}

        <div className="controls">
          <div className="left">
            <div className="segmented-control" aria-label="카메라 프리셋">
              {CAMERA_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  className={cameraPreset === option.id ? 'active' : ''}
                  onClick={() => setCameraPreset(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button className="secondary" onClick={() => setShowPreinstalled((v) => !v)}>
              {showPreinstalled ? '기존 설비 숨기기' : '기존 설비 보기'}
            </button>
            <button className="danger" onClick={handleReset} disabled={!items.length}>
              초기화
            </button>
          </div>
          <div className="right">
            <button className="secondary" onClick={() => setSourcesOpen(true)} title="모든 수치의 공인 출처 보기">
              📚 출처
            </button>
            <button className="secondary" onClick={handleReport}>
              AI 리포트
            </button>
            <button className="secondary" onClick={() => { setTourStep(0); setShowOnboarding(true); }}>
              가이드
            </button>
            <button
              onClick={handleSubmit}
              disabled={!items.length}
              title={!items.length ? '지도에 설비를 1개 이상 배치하면 제출할 수 있습니다' : '현재 시나리오를 로컬 리더보드에 등록합니다'}
            >
              리더보드 제출
            </button>
          </div>
        </div>

        <div className="baseline-note">{PREINSTALLED_NOTE}</div>
        {toast && <div className={'toast ' + (toast.type === 'error' ? 'toast-error' : '')}>{toast.msg}</div>}
      </div>

      <aside className="right-panel">
        <ScenarioPanel
          scenarios={scenarios}
          activeScenarioId={activeScenarioId}
          onSave={handleSaveScenario}
          onLoad={handleLoadScenario}
          onRename={handleRenameScenario}
          onDelete={handleDeleteScenario}
        />
        <Leaderboard refreshKey={refreshKey} />
      </aside>

      {reportOpen && (
        <ReportModal
          report={report}
          loading={reportLoading}
          onClose={() => setReportOpen(false)}
          onDownload={handleDownloadReport}
        />
      )}

      {sourcesOpen && <SourcesModal onClose={() => setSourcesOpen(false)} />}

      {showOnboarding && (
        <OnboardingTour
          step={tourStep}
          total={TOUR_STEPS.length}
          onPrev={() => setTourStep((s) => Math.max(0, s - 1))}
          onNext={() => {
            if (tourStep === TOUR_STEPS.length - 1) closeOnboarding();
            else setTourStep((s) => s + 1);
          }}
          onClose={closeOnboarding}
        />
      )}
        </div>
      )}
    </div>
  );
}
