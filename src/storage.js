const STORAGE_KEY = 'inha-carbon-sim.scenarios.v1';
const LEADERBOARD_KEY = 'inha-carbon-sim.leaderboard.v1';
const PRACTICE_LOG_KEY = 'inha-carbon-sim.practice-logs.v1';
const PERSONAL_LEADERBOARD_KEY = 'inha-carbon-sim.personal-leaderboard.v1';

function nowIso() {
  return new Date().toISOString();
}

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `scenario_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function readRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readList(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeList(key, items) {
  localStorage.setItem(key, JSON.stringify(items));
}

function writeRaw(scenarios) {
  writeList(STORAGE_KEY, scenarios);
}

function stripItem(item) {
  return {
    id: item.id,
    type: item.type,
    lng: item.lng,
    lat: item.lat,
    qty: item.qty ?? 1,
    effectiveCoeff: item.effectiveCoeff,
    effectiveEnergyKwh: item.effectiveEnergyKwh,
    effectiveUnitCost: item.effectiveUnitCost,
    costMultiplier: item.costMultiplier,
    placementScore: item.placementScore,
    placementModifiers: item.placementModifiers,
    locationName: item.locationName,
    zoneId: item.zoneId,
    zoneType: item.zoneType,
    zoneYear: item.zoneYear,
    zoneFloors: item.zoneFloors,
    zoneNote: item.zoneNote,
    zoneName: item.zoneName,
    zoneReason: item.zoneReason,
  };
}

export function loadScenarios() {
  return readRaw().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function saveScenario({ id, name, nickname, items, metrics, year }) {
  const scenarios = readRaw();
  const timestamp = nowIso();
  const scenario = {
    id: id || createId(),
    name: (name || '이름 없는 시나리오').trim(),
    nickname: (nickname || '').trim(),
    year: Number(year) || null,
    items: items.map(stripItem),
    metrics,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const index = scenarios.findIndex((it) => it.id === scenario.id);
  if (index >= 0) {
    scenario.createdAt = scenarios[index].createdAt || timestamp;
    scenarios[index] = scenario;
  } else {
    scenarios.push(scenario);
  }

  writeRaw(scenarios);
  return scenario;
}

export function deleteScenario(id) {
  const scenarios = readRaw().filter((it) => it.id !== id);
  writeRaw(scenarios);
  return scenarios;
}

export function renameScenario(id, name) {
  const scenarios = readRaw();
  const scenario = scenarios.find((it) => it.id === id);
  if (!scenario) return null;

  scenario.name = (name || scenario.name || '이름 없는 시나리오').trim();
  scenario.updatedAt = nowIso();
  writeRaw(scenarios);
  return scenario;
}

export function loadLeaderboardEntries(limit = 20) {
  return readList(LEADERBOARD_KEY)
    .sort((a, b) => {
      const scoreDiff = Number(b.total_saving || 0) - Number(a.total_saving || 0);
      if (scoreDiff) return scoreDiff;
      return String(b.created_at).localeCompare(String(a.created_at));
    })
    .slice(0, limit)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function loadPracticeLogs() {
  return readList(PRACTICE_LOG_KEY)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function savePracticeLog(entry) {
  const logs = readList(PRACTICE_LOG_KEY);
  const log = {
    ...entry,
    id: entry.id || createId(),
    createdAt: entry.createdAt || nowIso(),
  };
  logs.push(log);
  writeList(PRACTICE_LOG_KEY, logs);
  return log;
}

export function deletePracticeLog(id) {
  const logs = readList(PRACTICE_LOG_KEY).filter((l) => l.id !== id);
  writeList(PRACTICE_LOG_KEY, logs);
  return logs;
}

export function saveLeaderboardEntry({ nickname, items, metrics }) {
  const entries = readList(LEADERBOARD_KEY);
  const entry = {
    id: createId(),
    nickname: (nickname || '익명').trim(),
    total_saving: metrics?.user?.netSaving || 0,
    energy_kwh: metrics?.user?.energyKwh || 0,
    efficiency_score: metrics?.user?.efficiencyScore || 0,
    total_cost: metrics?.user?.totalCost || 0,
    item_count: items.length,
    created_at: nowIso(),
  };
  entries.push(entry);
  writeList(LEADERBOARD_KEY, entries);
  return entry;
}

// ─── 개인 실천 리더보드 ───
export function loadPersonalLeaderboard(limit = 20) {
  return readList(PERSONAL_LEADERBOARD_KEY)
    .sort((a, b) => {
      const scoreDiff = Number(b.total_saved_kg || 0) - Number(a.total_saved_kg || 0);
      if (scoreDiff) return scoreDiff;
      return String(b.created_at).localeCompare(String(a.created_at));
    })
    .slice(0, limit)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function savePersonalLeaderboardEntry({ nickname, totalSavedKg, practiceCount, categories }) {
  const entries = readList(PERSONAL_LEADERBOARD_KEY);
  const entry = {
    id: createId(),
    nickname: (nickname || '익명').trim(),
    total_saved_kg: Number(totalSavedKg || 0),
    practice_count: Number(practiceCount || 0),
    categories: Array.isArray(categories) ? categories : [],
    created_at: nowIso(),
  };
  entries.push(entry);
  writeList(PERSONAL_LEADERBOARD_KEY, entries);
  return entry;
}
