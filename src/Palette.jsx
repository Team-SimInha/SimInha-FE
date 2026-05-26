import { ITEM_TYPES, GROUPS, COST_TRANSPARENCY_NOTE } from './items.js';

function formatKrw(value) {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억원`;
  if (value >= 10000) return `${Math.round(value / 10000).toLocaleString()}만원`;
  return `${value.toLocaleString()}원`;
}

export const YEAR_OPTIONS = [2026, 2027, 2028, 2030, 2032, 2035, 2040];

export default function Palette({
  selected,
  onSelect,
  nickname,
  onNickname,
  budget,
  usedBudget,
  remainingBudget,
  canAffordItem,
  designYear,
  onDesignYear,
  effectiveCostOf,
}) {
  return (
    <aside className="sidebar">
      <h2>🏛 캠퍼스 탄소중립 정책 시뮬레이터</h2>
      <p style={{ fontSize: 11, color: '#8b949e', margin: '0 0 12px' }}>
        인하대 · 시설팀 · ESG 추진단 · 경진대회 심사위원용
      </p>

      <h3>닉네임</h3>
      <input
        type="text"
        placeholder="닉네임 입력 (선택)"
        value={nickname}
        maxLength={20}
        onChange={(e) => onNickname(e.target.value)}
      />

      <h3>적용 연도 <span style={{ fontWeight: 400, textTransform: 'none', color: '#6e7681', fontSize: 10 }}>(1차/2차/3차 시나리오용)</span></h3>
      <select
        value={designYear || 2026}
        onChange={(e) => onDesignYear && onDesignYear(Number(e.target.value))}
        style={{
          width: '100%', padding: '8px 10px', background: '#0d1117', color: '#e6edf3',
          border: '1px solid #30363d', borderRadius: 8, fontSize: 14,
        }}
      >
        {YEAR_OPTIONS.map((y) => (
          <option key={y} value={y}>{y}년 적용</option>
        ))}
      </select>
      <p style={{ fontSize: 10, color: '#6e7681', margin: '4px 0 0', lineHeight: 1.4 }}>
        선택한 연도의 학습곡선 기반 단가 예측치가 자동 적용됩니다 (IEA·IRENA·BNEF·KEEI).
      </p>

      <div style={{
        margin: '8px 0 10px', padding: '8px 10px',
        background: '#0d1117', border: '1px dashed #f2cc6066', borderRadius: 6,
        fontSize: 10, color: '#c9d1d9', lineHeight: 1.5,
      }}>
        ⚠️ {COST_TRANSPARENCY_NOTE}
      </div>

      <div className="budget-box">
        <div>
          <span>예산</span>
          <strong>{formatKrw(budget)}</strong>
        </div>
        <div>
          <span>사용</span>
          <strong>{formatKrw(usedBudget)}</strong>
        </div>
        <div>
          <span>잔액</span>
          <strong className={remainingBudget < 0 ? 'negative' : ''}>{formatKrw(Math.max(remainingBudget, 0))}</strong>
        </div>
      </div>

      {GROUPS.map((group) => (
        <div key={group}>
          <h3>{group}</h3>
          {ITEM_TYPES.filter((it) => it.group === group).map((it) => {
            const canAfford = canAffordItem ? canAffordItem(it.id) : true;
            const disabled = it.coeff === 0 || !canAfford;
            const adjustedCost = effectiveCostOf ? effectiveCostOf(it.id) : it.cost;
            const costChanged = adjustedCost !== it.cost;
            return (
              <div
                key={it.id}
                className={
                  'palette-item' +
                  (selected === it.id ? ' active' : '') +
                  (disabled ? ' disabled' : '')
                }
                onClick={() => {
                  if (disabled) return;
                  onSelect(selected === it.id ? null : it.id);
                }}
              >
                <div className="icon">{it.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="label">{it.label}</div>
                  <div className="coeff">
                    {it.coeff === 0
                      ? '⚠ 절감효과 0 (대학 귀속 불가)'
                      : `${it.coeff.toLocaleString()} kgCO₂/년 · ${it.energyKwh.toLocaleString()} kWh`}
                  </div>
                  <div className="item-desc">
                    {formatKrw(adjustedCost)} / {it.unit}
                    {costChanged && (
                      <span style={{ color: '#7ee787', marginLeft: 4, fontSize: 9 }}>
                        ({designYear}년, 원가 {formatKrw(it.cost)})
                      </span>
                    )}
                    {!canAfford && it.coeff !== 0 ? ' · 예산 초과' : ''}
                  </div>
                  {it.source && (
                    <div className="palette-source" title={it.source}>
                      📚 출처: {it.source}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <h3>사용법</h3>
      <div style={{ fontSize: 12, color: '#8b949e', lineHeight: 1.6 }}>
        1. 좌측에서 요소 선택<br />
        2. 지도 클릭으로 배치<br />
        3. 하단 "리더보드 제출"로 등록<br />
        4. 닉네임이 없으면 익명으로 표시<br />
        <br />
        우클릭 또는 Shift+클릭 = 삭제
      </div>
    </aside>
  );
}
