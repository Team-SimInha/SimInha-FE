import { useEffect, useState } from 'react';
import { loadLeaderboardEntriesOnline } from './storage.js';

export default function Leaderboard({ refreshKey, onSubmit, submitDisabled, submitting }) {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    let alive = true;
    loadLeaderboardEntriesOnline().then((nextEntries) => {
      if (alive) setEntries(nextEntries);
    });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const rankClass = (r) => (r === 1 ? 'gold' : r === 2 ? 'silver' : r === 3 ? 'bronze' : '');

  return (
    <section className="leaderboard">
      <div className="panel-title-row">
        <h2>🏆 리더보드</h2>
        {onSubmit && (
          <button className="secondary small-button" onClick={onSubmit} disabled={submitDisabled || submitting}>
            {submitting ? '등록 중' : '등록'}
          </button>
        )}
      </div>
      {entries.length === 0 && <div className="empty">아직 등록된 시나리오가 없습니다</div>}
      {entries.map((e) => (
        <div key={e.rank + e.nickname + e.created_at} className="entry">
          <div className={'rank ' + rankClass(e.rank)}>#{e.rank}</div>
          <div>
            <div className="nick">{e.nickname}</div>
            <div className="meta">
              {e.item_count}개 요소 · {e.created_at.slice(0, 10)}
              {e.efficiency_score ? ` · 효율 ${e.efficiency_score}` : ''}
            </div>
          </div>
          <div className="score">{(e.total_saving / 1000).toFixed(1)}t</div>
        </div>
      ))}
    </section>
  );
}
