import { apiDelete, apiGet, apiPost, apiPut, isBackendConfigured } from './backendApi.js';

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

function sortScenarios(scenarios) {
  return [...scenarios].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function isBackendId(id) {
  return Number.isInteger(Number(id)) && Number(id) > 0;
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

function buildScenario({ id, name, nickname, items = [], metrics, year }, existing) {
  const timestamp = nowIso();
  return {
    id: id || createId(),
    name: (name || '이름 없는 시나리오').trim(),
    nickname: (nickname || '').trim(),
    year: Number(year || metrics?.designYear) || null,
    items: items.map(stripItem),
    metrics,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

function findCachedScenario(id) {
  return readRaw().find((it) => String(it.id) === String(id));
}

function upsertScenario(scenario) {
  const scenarios = readRaw();
  const index = scenarios.findIndex((it) => String(it.id) === String(scenario.id));
  if (index >= 0) scenarios[index] = scenario;
  else scenarios.push(scenario);
  writeRaw(sortScenarios(scenarios));
  return scenario;
}

function normalizeBackendItem(item = {}, cached = {}) {
  return {
    ...cached,
    id: item.id ?? cached.id,
    type: item.type ?? cached.type,
    lng: item.lng ?? cached.lng,
    lat: item.lat ?? cached.lat,
    qty: item.qty ?? cached.qty ?? 1,
    effectiveCoeff: item.effectiveCoeff ?? cached.effectiveCoeff,
    locationName: item.locationName ?? cached.locationName,
    zoneId: item.zoneId ?? cached.zoneId,
    zoneType: item.zoneType ?? cached.zoneType,
    zoneYear: item.zoneYear ?? cached.zoneYear,
    zoneFloors: item.zoneFloors ?? cached.zoneFloors,
    zoneNote: item.zoneNote ?? cached.zoneNote,
    zoneName: item.zoneName ?? cached.zoneName,
    zoneReason: item.zoneReason ?? cached.zoneReason,
  };
}

function normalizeBackendScenario(scenario = {}, cached = {}) {
  const metrics = scenario.metrics ?? cached.metrics ?? null;
  const cachedItemsById = new Map((cached.items || []).map((item) => [String(item.id), item]));
  const backendItems = Array.isArray(scenario.items) ? scenario.items : [];
  const items = backendItems.length
    ? backendItems.map((item) => normalizeBackendItem(item, cachedItemsById.get(String(item.id))))
    : (cached.items || []);

  return {
    ...cached,
    id: scenario.id ?? cached.id,
    name: scenario.name ?? cached.name ?? '이름 없는 시나리오',
    nickname: scenario.nickname ?? cached.nickname ?? '',
    year: Number(cached.year || metrics?.designYear) || null,
    items,
    metrics,
    createdAt: scenario.createdAt ?? cached.createdAt ?? nowIso(),
    updatedAt: scenario.updatedAt ?? cached.updatedAt ?? scenario.createdAt ?? nowIso(),
  };
}

function toBackendScenarioPayload(scenario) {
  const metrics = scenario.metrics
    ? { ...scenario.metrics, designYear: scenario.year || scenario.metrics.designYear }
    : null;

  return {
    name: scenario.name,
    nickname: scenario.nickname,
    items: (scenario.items || []).map(stripItem),
    metrics,
  };
}

function normalizeLeaderboardEntry(entry = {}, index = 0) {
  return {
    id: entry.id ?? createId(),
    rank: entry.rank || index + 1,
    nickname: entry.nickname || '익명',
    total_saving: entry.totalSaving ?? entry.total_saving ?? 0,
    energy_kwh: entry.energyKwh ?? entry.energy_kwh ?? 0,
    efficiency_score: entry.efficiencyScore ?? entry.efficiency_score ?? 0,
    total_cost: entry.totalCost ?? entry.total_cost ?? 0,
    item_count: entry.itemCount ?? entry.item_count ?? 0,
    created_at: entry.createdAt ?? entry.created_at ?? nowIso(),
  };
}

export function loadScenarios() {
  return sortScenarios(readRaw());
}

export async function loadScenariosOnline() {
  if (!isBackendConfigured()) return loadScenarios();

  try {
    const summaries = await apiGet('/scenarios');
    const cached = readRaw();
    const cachedById = new Map(cached.map((scenario) => [String(scenario.id), scenario]));
    const details = await Promise.all((summaries || []).map(async (summary) => {
      try {
        return await apiGet(`/scenarios/${summary.id}`);
      } catch {
        return summary;
      }
    }));
    const remoteScenarios = details.map((scenario) => (
      normalizeBackendScenario(scenario, cachedById.get(String(scenario.id)))
    ));
    const remoteIds = new Set(remoteScenarios.map((scenario) => String(scenario.id)));
    const localOnly = cached.filter((scenario) => !remoteIds.has(String(scenario.id)) && !isBackendId(scenario.id));
    const merged = sortScenarios([...remoteScenarios, ...localOnly]);
    writeRaw(merged);
    return merged;
  } catch (error) {
    console.warn('[storage] backend scenario load failed, using local cache', error);
    return loadScenarios();
  }
}

export function saveScenario({ id, name, nickname, items, metrics, year }) {
  const existing = id ? findCachedScenario(id) : null;
  return upsertScenario(buildScenario({ id, name, nickname, items, metrics, year }, existing));
}

export async function saveScenarioOnline(input) {
  if (!isBackendConfigured()) return saveScenario(input);

  const localScenario = buildScenario(input, input.id ? findCachedScenario(input.id) : null);
  try {
    const payload = toBackendScenarioPayload(localScenario);
    const saved = input.id && isBackendId(input.id)
      ? await apiPut(`/scenarios/${input.id}`, payload)
      : await apiPost('/scenarios', payload);
    const merged = normalizeBackendScenario(saved, localScenario);
    return upsertScenario(merged);
  } catch (error) {
    console.warn('[storage] backend scenario save failed, saving locally', error);
    return saveScenario(input);
  }
}

export function deleteScenario(id) {
  const scenarios = readRaw().filter((it) => String(it.id) !== String(id));
  writeRaw(scenarios);
  return scenarios;
}

export async function deleteScenarioOnline(id) {
  if (isBackendConfigured() && isBackendId(id)) {
    try {
      await apiDelete(`/scenarios/${id}`);
    } catch (error) {
      console.warn('[storage] backend scenario delete failed, deleting local cache only', error);
    }
  }
  return deleteScenario(id);
}

export function renameScenario(id, name) {
  const scenario = findCachedScenario(id);
  if (!scenario) return null;

  const renamed = {
    ...scenario,
    name: (name || scenario.name || '이름 없는 시나리오').trim(),
    updatedAt: nowIso(),
  };
  return upsertScenario(renamed);
}

export async function renameScenarioOnline(id, name, currentScenario) {
  const localScenario = currentScenario || findCachedScenario(id);
  if (!localScenario) return null;

  const renamed = {
    ...localScenario,
    name: (name || localScenario.name || '이름 없는 시나리오').trim(),
    updatedAt: nowIso(),
  };

  if (isBackendConfigured() && isBackendId(id)) {
    try {
      const saved = await apiPut(`/scenarios/${id}`, toBackendScenarioPayload(renamed));
      return upsertScenario(normalizeBackendScenario(saved, renamed));
    } catch (error) {
      console.warn('[storage] backend scenario rename failed, renaming local cache only', error);
    }
  }

  return upsertScenario(renamed);
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

export async function loadLeaderboardEntriesOnline(limit = 20) {
  if (!isBackendConfigured()) return loadLeaderboardEntries(limit);

  try {
    const entries = await apiGet(`/leaderboard?sortBy=total_saving&page=0&size=${limit}`);
    return (entries || []).map(normalizeLeaderboardEntry);
  } catch (error) {
    console.warn('[storage] backend leaderboard load failed, using local cache', error);
    return loadLeaderboardEntries(limit);
  }
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

export async function saveLeaderboardEntryOnline(input) {
  if (!isBackendConfigured()) return saveLeaderboardEntry(input);

  try {
    const metrics = input.metrics || {};
    const saved = await apiPost('/leaderboard', {
      nickname: input.nickname,
      totalSaving: metrics.user?.netSaving || 0,
      energyKwh: metrics.user?.energyKwh || 0,
      efficiencyScore: metrics.user?.efficiencyScore || 0,
      totalCost: metrics.user?.totalCost || 0,
      itemCount: input.items?.length || 0,
    });
    return normalizeLeaderboardEntry(saved);
  } catch (error) {
    console.warn('[storage] backend leaderboard save failed, saving locally', error);
    return saveLeaderboardEntry(input);
  }
}

export async function loadPresetPlacementsOnline() {
  if (!isBackendConfigured()) return null;

  try {
    const presets = await apiGet('/preset-placements');
    return (presets || []).map((preset) => ({
      id: preset.presetId || `preset_${preset.id}`,
      type: preset.itemType,
      lng: preset.lng,
      lat: preset.lat,
      qty: preset.qty ?? 1,
      buildingId: preset.buildingId || null,
      locationName: preset.locationName,
      installedYear: preset.installedYear,
      locked: true,
      source: 'preinstalled',
      dataQuality: preset.dataQuality || 'estimated',
    }));
  } catch (error) {
    console.warn('[storage] backend preset load failed, using bundled presets', error);
    return null;
  }
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
