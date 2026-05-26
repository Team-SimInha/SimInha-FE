import { useEffect, useMemo, useState } from 'react';
import CampusMap from './Map.jsx';
import { PRACTICES, PRACTICE_CATEGORIES, PRACTICE_MAP } from './practices.js';
import { classifyPractice } from './practiceClassifier.js';
import { deletePracticeLog, loadPersonalLeaderboard, loadPracticeLogs, savePersonalLeaderboardEntry, savePracticeLog } from './storage.js';

function PersonalLeaderboardPanel({ refreshKey }) {
  const [entries, setEntries] = useState([]);
  useEffect(() => { setEntries(loadPersonalLeaderboard()); }, [refreshKey]);
  const rankClass = (r) => (r === 1 ? 'gold' : r === 2 ? 'silver' : r === 3 ? 'bronze' : '');
  return (
    <section className="scenario-panel" style={{ borderBottom: 'none' }}>
      <div className="panel-title-row">
        <h2 style={{ color: '#ffd33d' }}>🏆 개인 실천 리더보드</h2>
      </div>
      {entries.length === 0 && <div className="empty compact">아직 등록된 실천 기록이 없습니다</div>}
      {entries.map((e) => (
        <div key={e.id} className="entry">
          <div className={'rank ' + rankClass(e.rank)}>#{e.rank}</div>
          <div>
            <div className="nick">{e.nickname}</div>
            <div className="meta">
              {e.practice_count}건 인증 · {e.created_at.slice(0, 10)}
              {e.categories?.length ? ` · ${e.categories.slice(0, 3).join('/')}` : ''}
            </div>
          </div>
          <div className="score">{e.total_saved_kg.toFixed(2)}<span style={{ fontSize: 10, color: '#8b949e' }}>kg</span></div>
        </div>
      ))}
    </section>
  );
}

function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function LogDetailModal({ log, onClose, onDelete }) {
  if (!log) return null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="practice-log-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-kicker">실천 인증</div>
            <h2>{log.icon} {log.practiceLabel}</h2>
          </div>
          <button className="secondary icon-button" onClick={onClose} aria-label="닫기">×</button>
        </div>
        {log.photoPreview && (
          <img src={log.photoPreview} alt="인증 사진" className="log-modal-photo" />
        )}
        <div className="log-modal-meta">
          <div className="log-modal-row">
            <span className="log-modal-label">감축량</span>
            <strong className="log-modal-co2">+{log.co2Saved} kgCO₂eq</strong>
          </div>
          <div className="log-modal-row">
            <span className="log-modal-label">📍 장소</span>
            <span>{log.location?.name || '캠퍼스'}</span>
          </div>
          <div className="log-modal-row">
            <span className="log-modal-label">📅 기록 시각</span>
            <span>{formatDateTime(log.createdAt)}</span>
          </div>
          {log.matchedKeyword && (
            <div className="log-modal-row">
              <span className="log-modal-label">🤖 AI 근거</span>
              <span>"{log.matchedKeyword}" 키워드 감지</span>
            </div>
          )}
        </div>
        {log.note && (
          <div className="log-modal-note">
            <div className="log-modal-label">📝 설명</div>
            <p>{log.note}</p>
          </div>
        )}
        <button className="danger" style={{ width: '100%', marginTop: 14 }} onClick={() => onDelete(log.id)}>
          🗑 이 기록 삭제
        </button>
      </div>
    </div>
  );
}

function AnalysisModal({ result, description, onClose, onConfirm }) {
  const [manualMode, setManualMode] = useState(!result?.id);
  const [pickedId, setPickedId] = useState(result?.id || null);

  const detected = result?.id ? PRACTICE_MAP[result.id] : null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="practice-log-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-kicker">AI 분석 결과</div>
            <h2>🤖 어떤 실천일까요?</h2>
          </div>
          <button className="secondary icon-button" onClick={onClose} aria-label="닫기">×</button>
        </div>

        {!manualMode && detected ? (
          <>
            <div className="ai-detected-card">
              <div className="ai-detected-icon">{detected.icon}</div>
              <div className="ai-detected-body">
                <strong>{detected.label}</strong>
                <span className="ai-detected-co2">+{detected.co2PerUnit} kgCO₂eq / {detected.unit}</span>
                <span className="ai-detected-source">
                  근거: "{result.matchedKeyword}" 키워드 감지
                </span>
              </div>
            </div>
            <p className="ai-hint">
              "{description}" 라고 적으셔서, 위 활동으로 인식했어요. 맞나요?
            </p>
            <div className="ai-actions">
              <button
                onClick={() => {
                  console.log('[AI confirm] clicked, detected:', detected, 'result:', result);
                  onConfirm(detected.id, result.matchedKeyword);
                }}
              >
                ✓ 네, 저장할게요
              </button>
              <button className="secondary" onClick={() => setManualMode(true)}>
                다른 활동 선택
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="ai-hint">
              {result?.id
                ? '직접 활동을 골라주세요.'
                : '설명에서 정확히 어떤 활동인지 인식하지 못했어요. 아래에서 골라주세요.'}
            </p>
            <div className="manual-pick-list">
              {PRACTICE_CATEGORIES.map((cat) => (
                <div key={cat.id} className="manual-pick-group">
                  <div className="manual-pick-group-title">{cat.icon} {cat.label}</div>
                  {PRACTICES.filter((p) => p.category === cat.id).map((p) => (
                    <label
                      key={p.id}
                      className={'manual-pick-item' + (pickedId === p.id ? ' active' : '')}
                    >
                      <input
                        type="radio"
                        name="manual-practice"
                        checked={pickedId === p.id}
                        onChange={() => setPickedId(p.id)}
                      />
                      <span className="manual-pick-icon">{p.icon}</span>
                      <span className="manual-pick-label">{p.label}</span>
                      <span className="manual-pick-co2">+{p.co2PerUnit} kgCO₂eq</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
            <div className="ai-actions">
              <button onClick={() => pickedId && onConfirm(pickedId, null)} disabled={!pickedId}>
                ✓ 이걸로 저장
              </button>
              {detected && (
                <button className="secondary" onClick={() => { setManualMode(false); setPickedId(result.id); }}>
                  ← AI 추천으로
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PersonalTrack() {
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoName, setPhotoName] = useState('');
  const [location, setLocation] = useState(null);
  const [description, setDescription] = useState('');
  const [toast, setToast] = useState(null);
  const [logs, setLogs] = useState(() => loadPracticeLogs());
  const [selectedLog, setSelectedLog] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [cameraPreset, setCameraPreset] = useState('iso');
  const [nickname, setNickname] = useState('');
  const [leaderboardRefresh, setLeaderboardRefresh] = useState(0);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), type === 'error' ? 4000 : 2500);
  };

  const refreshLogs = () => setLogs(loadPracticeLogs());

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('사진은 5MB 이하만 업로드 가능합니다', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoPreview(reader.result);
      setPhotoName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handlePick = (lng, lat, locationName) => {
    setLocation({ lng, lat, name: locationName || '캠퍼스 일반 구역' });
    showToast(`📍 ${locationName || '위치'} 선택됨`);
  };

  const handleLogClick = (id) => {
    const log = logs.find((l) => l.id === id);
    if (log) setSelectedLog(log);
  };

  const handleDeleteLog = (id) => {
    if (!confirm('이 기록을 삭제할까요?')) return;
    deletePracticeLog(id);
    refreshLogs();
    setSelectedLog(null);
    showToast('기록이 삭제되었습니다');
  };

  const handleAnalyze = () => {
    if (!location) return showToast('지도에서 장소를 먼저 선택해주세요', 'error');
    if (!photoPreview) return showToast('인증 사진을 업로드해주세요', 'error');
    if (!description.trim()) return showToast('짧은 설명을 적어주세요', 'error');

    const result = classifyPractice(description);
    setAnalysisResult(result);
  };

  const handleConfirmAnalysis = (practiceId, matchedKeyword) => {
    console.log('[handleConfirmAnalysis] called with', practiceId, matchedKeyword, 'location:', location, 'photoPreview:', !!photoPreview);
    const meta = PRACTICE_MAP[practiceId];
    if (!meta) {
      console.warn('[handleConfirmAnalysis] no meta for', practiceId);
      return;
    }
    savePracticeLog({
      practiceId,
      practiceLabel: meta.label,
      icon: meta.icon,
      co2Saved: meta.co2PerUnit,
      unit: meta.unit,
      category: meta.category,
      location,
      photoPreview,
      photoName,
      note: description,
      matchedKeyword: matchedKeyword || null,
    });
    refreshLogs();
    showToast(`✅ ${meta.label} (+${meta.co2PerUnit} kgCO₂eq) 저장됨`);
    setPhotoPreview(null);
    setPhotoName('');
    setDescription('');
    setAnalysisResult(null);
  };

  const totalSaved = logs.reduce((s, e) => s + (e.co2Saved || 0), 0);

  const handleLeaderboardSubmit = () => {
    if (logs.length === 0) return showToast('인증한 실천이 없습니다', 'error');
    const submitNickname = nickname.trim() || '익명';
    const categories = [...new Set(logs.map((l) => l.category).filter(Boolean))];
    savePersonalLeaderboardEntry({
      nickname: submitNickname,
      totalSavedKg: totalSaved,
      practiceCount: logs.length,
      categories,
    });
    setLeaderboardRefresh((k) => k + 1);
    showToast(`🏆 ${submitNickname} · ${totalSaved.toFixed(2)} kgCO₂eq 리더보드 등록!`);
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>🌱 개인 실천 기록</h2>
        <p style={{ fontSize: 11, color: '#8b949e', margin: '0 0 12px' }}>
          위치 선택 → 사진 + 짧은 설명 →<br />AI가 알아서 활동 분류
        </p>

        <div className="budget-box">
          <div>
            <span>누적 감축</span>
            <strong>{totalSaved.toFixed(2)} kgCO₂eq</strong>
          </div>
          <div>
            <span>인증 횟수</span>
            <strong>{logs.length}건</strong>
          </div>
        </div>

        <h3>인증 가능한 활동 (참고용)</h3>
        <p style={{ fontSize: 10, color: '#6e7681', margin: '0 0 8px', lineHeight: 1.4 }}>
          ※ 직접 선택할 필요 없음. 설명에 키워드만 들어가면 AI가 자동 매칭.
        </p>
        {PRACTICE_CATEGORIES.map((cat) => (
          <div key={cat.id} className="practice-ref-group">
            <div className="practice-ref-title">{cat.icon} {cat.label}</div>
            {PRACTICES.filter((p) => p.category === cat.id).map((p) => (
              <div key={p.id} className="practice-ref-item">
                <span className="practice-ref-icon">{p.icon}</span>
                <div className="practice-ref-meta">
                  <span className="practice-ref-label">{p.label}</span>
                  <span className="practice-ref-co2">+{p.co2PerUnit} kgCO₂eq</span>
                </div>
              </div>
            ))}
          </div>
        ))}

        <h3>사용법</h3>
        <div style={{ fontSize: 12, color: '#8b949e', lineHeight: 1.6 }}>
          1. 지도에서 실천 장소 클릭<br />
          2. 사진 업로드<br />
          3. 무엇을 했는지 한 줄 설명<br />
          4. "🤖 AI 분석 & 제출" 클릭<br />
          5. AI 판단 확인 → 저장<br />
          <br />
          ※ 모든 수치는 공인 가이드라인 기반 추정치
        </div>
      </aside>

      <div className="map-wrap">
        <CampusMap
          selectedType={null}
          items={[]}
          preinstalledItems={[]}
          showPreinstalled={false}
          cameraPreset={cameraPreset}
          pickMode
          pickedLocation={location}
          onPick={handlePick}
          practiceLogs={logs}
          onLogClick={handleLogClick}
          onPlace={() => {}}
          onRemove={() => {}}
        />

        <div className="dashboard">
          <div className="metric-card">
            <div className="metric-label">누적 감축량</div>
            <div className="metric-value">{totalSaved.toFixed(2)}</div>
            <div className="metric-sub">kgCO₂eq · {logs.length}건 기록</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">선택한 장소</div>
            <div className="metric-value" style={{ fontSize: 16 }}>
              📍 {location?.name || '미선택'}
            </div>
            <div className="metric-sub">
              {location ? `${location.lng.toFixed(5)}, ${location.lat.toFixed(5)}` : '지도 클릭으로 선택'}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">사진 상태</div>
            <div className="metric-value" style={{ fontSize: 16 }}>
              {photoPreview ? '✓ 업로드됨' : '미업로드'}
            </div>
            <div className="metric-sub">
              {photoName || '우측에서 업로드'}
            </div>
          </div>
        </div>

        <div className="controls">
          <div className="left">
            <div className="segmented-control" aria-label="카메라 프리셋">
              {[
                { id: 'flat', label: '평면' },
                { id: 'iso', label: '아이소' },
                { id: 'threeD', label: '3D' },
              ].map((option) => (
                <button
                  key={option.id}
                  className={cameraPreset === option.id ? 'active' : ''}
                  onClick={() => setCameraPreset(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="baseline-note">
          💡 인증 사진은 브라우저에만 저장됩니다 (명예 시스템 · 외부 전송 없음)
        </div>

        {toast && <div className={'toast ' + (toast.type === 'error' ? 'toast-error' : '')}>{toast.msg}</div>}
      </div>

      <aside className="right-panel">
        <section className="scenario-panel">
          <div className="panel-title-row">
            <h2>인증 제출</h2>
          </div>

          <div className="practice-form">
            <label className="form-label">📷 인증 사진</label>
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="file-input"
            />
            {photoPreview && (
              <div className="photo-preview">
                <img src={photoPreview} alt="인증 사진" />
                <div className="photo-name">{photoName}</div>
              </div>
            )}

            <label className="form-label" style={{ marginTop: 12 }}>📝 한 줄 설명</label>
            <textarea
              className="form-textarea"
              placeholder="어떤 실천을 하셨나요? (예: 오늘 텀블러 갖고 카페 갔어요)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />

            <button
              style={{ width: '100%', marginTop: 14 }}
              onClick={handleAnalyze}
              disabled={!location || !photoPreview || !description.trim()}
            >
              🤖 AI 분석 & 제출
            </button>
            <p className="form-hint" style={{ color: '#8b949e' }}>
              💡 설명에 활동 키워드 (예: 텀블러, 자전거, 분리수거) 들어가면 AI가 자동 매칭
            </p>
          </div>
        </section>

        <section className="scenario-panel">
          <div className="panel-title-row">
            <h2>최근 기록 ({logs.length})</h2>
          </div>
          {logs.length === 0 && <div className="empty compact">아직 기록이 없습니다</div>}
          {logs.slice(0, 6).map((entry) => (
            <div
              key={entry.id}
              className="practice-log-entry"
              role="button"
              onClick={() => setSelectedLog(entry)}
            >
              {entry.photoPreview && (
                <img src={entry.photoPreview} alt="" className="log-photo" />
              )}
              <div className="log-meta">
                <strong>{entry.icon} {entry.practiceLabel}</strong>
                <span>+{entry.co2Saved} kgCO₂eq · 📍 {entry.location?.name}</span>
              </div>
            </div>
          ))}
        </section>

        <section className="scenario-panel">
          <div className="panel-title-row">
            <h2>리더보드 제출</h2>
          </div>
          <input
            type="text"
            placeholder="닉네임 (선택)"
            value={nickname}
            maxLength={20}
            onChange={(e) => setNickname(e.target.value)}
          />
          <button
            style={{ width: '100%', marginTop: 10 }}
            onClick={handleLeaderboardSubmit}
            disabled={!logs.length}
            title={!logs.length ? '실천을 1개 이상 등록하면 제출 가능' : `누적 ${totalSaved.toFixed(2)} kgCO₂eq로 리더보드 등록`}
          >
            🏆 누적 {totalSaved.toFixed(2)} kg · 리더보드 등록
          </button>
        </section>

        <PersonalLeaderboardPanel refreshKey={leaderboardRefresh} />
      </aside>

      <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} onDelete={handleDeleteLog} />
      {analysisResult && (
        <AnalysisModal
          result={analysisResult}
          description={description}
          onClose={() => setAnalysisResult(null)}
          onConfirm={handleConfirmAnalysis}
        />
      )}
    </div>
  );
}
