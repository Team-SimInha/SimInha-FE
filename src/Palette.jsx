import { ITEM_TYPES, GROUPS } from './items.js';

function formatKrw(value) {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억원`;
  if (value >= 10000) return `${Math.round(value / 10000).toLocaleString()}만원`;
  return `${value.toLocaleString()}원`;
}

export default function Palette({
  selected,
  onSelect,
  nickname,
  onNickname,
  budget,
  usedBudget,
  remainingBudget,
  canAffordItem,
}) {
  return (
    <aside className="sidebar">
      <h2>🌱 Inha Carbon Sim</h2>
      <p style={{ fontSize: 11, color: '#8b949e', margin: '0 0 12px' }}>
        인하대학교 캠퍼스 탄소중립 시뮬레이터
      </p>

      <h3>닉네임</h3>
      <input
        type="text"
        placeholder="닉네임 입력 (선택)"
        value={nickname}
        maxLength={20}
        onChange={(e) => onNickname(e.target.value)}
      />

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
                    {formatKrw(it.cost)} / {it.unit}
                    {!canAfford && it.coeff !== 0 ? ' · 예산 초과' : ''}
                  </div>
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
