(async () => {
  'use strict';

  const MATERIALS_KEY = 'medstudy_materials_v1';
  const EXAMS_KEY = 'medstudy_exams_v1';
  const SESSIONS_KEY = 'medstudy_sessions_v2';
  const SETTINGS_KEY = 'medstudy_settings_v2';
  const ACTIVE_TIMER_KEY = 'medstudy_active_timer_v2';
  const EXAM_TYPES = ['PR1.1', 'PR1.2', 'PR2.1', 'PR2.2', 'PR1', 'PR2', 'Segunda chamada', 'Prova final', 'Prova'];

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const makeId = (prefix = 'id') => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`);

  function todayDateValue() {
    const now = new Date();
    const local = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
    return local.toISOString().slice(0, 10);
  }

  function parseLegacyStoredArray(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn(`Não foi possível carregar ${key}:`, error);
      return [];
    }
  }

  function normalizeQuestionEntry(entry = {}, fallbackDate = '') {
    const correct = Math.max(0, Number(entry.correct) || 0);
    const wrong = Math.max(0, Number(entry.wrong) || 0);
    const enteredQuestions = Math.max(0, Number(entry.questions) || 0);
    const questions = Math.max(enteredQuestions, correct + wrong);
    const rawDate = String(entry.date || fallbackDate || '').slice(0, 10);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayDateValue();
    return {
      id: String(entry.id || makeId('q')),
      date,
      questions,
      correct,
      wrong,
      createdAt: entry.createdAt || new Date().toISOString(),
      updatedAt: entry.updatedAt || entry.createdAt || new Date().toISOString(),
    };
  }

  function getQuestionTotals(entries = []) {
    return entries.reduce((totals, entry) => {
      totals.questions += Math.max(0, Number(entry.questions) || 0);
      totals.correct += Math.max(0, Number(entry.correct) || 0);
      totals.wrong += Math.max(0, Number(entry.wrong) || 0);
      return totals;
    }, { questions: 0, correct: 0, wrong: 0 });
  }

  function normalizeSketchyTags(value = '') {
    const text = String(value || '').trim();
    if (!text) return '';

    // Migração: a versão anterior quebrava queries como nid:1,2,3 em linhas separadas.
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length > 1 && /^nid:\d+$/i.test(lines[0]) && lines.slice(1).every((line) => /^\d+$/.test(line))) {
      return `${lines[0]},${lines.slice(1).join(',')}`;
    }

    return text;
  }

  function normalizeMaterial(item = {}) {
    let questionEntries = Array.isArray(item.questionEntries)
      ? item.questionEntries.map((entry) => normalizeQuestionEntry(entry, item.updatedAt || item.createdAt || item.classDate || ''))
      : [];

    if (!questionEntries.length) {
      const legacyCorrect = Math.max(0, Number(item.correct) || 0);
      const legacyWrong = Math.max(0, Number(item.wrong) || 0);
      const legacyQuestions = Math.max(legacyCorrect + legacyWrong, Number(item.questions) || 0);
      if (legacyQuestions > 0) {
        const legacyDate = String(item.updatedAt || item.createdAt || item.classDate || todayDateValue()).slice(0, 10);
        questionEntries = [normalizeQuestionEntry({
          id: item.legacyQuestionEntryId || `legacy-${item.id || makeId('m')}`,
          date: legacyDate,
          questions: legacyQuestions,
          correct: legacyCorrect,
          wrong: legacyWrong,
          createdAt: item.updatedAt || item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
        }, legacyDate)];
      }
    }

    const totals = getQuestionTotals(questionEntries);
    return {
      id: String(item.id || makeId('m')),
      subject: String(item.subject || 'Sem disciplina').trim(),
      title: String(item.title || 'Sem título').trim(),
      classDate: item.classDate || '',
      classOrder: item.classOrder === '' || item.classOrder == null ? '' : Math.max(0, Number(item.classOrder) || 0),
      sketchyTags: normalizeSketchyTags(item.sketchyTags || ''),
      made: item.made != null ? Boolean(item.made) : Boolean(item.pdfStored || item.pdfName || item.link || item.emedLink || item.emedLinks),
      questionEntries,
      questions: totals.questions,
      correct: totals.correct,
      wrong: totals.wrong,
      read: Boolean(item.read),
      notes: String(item.notes || '').trim(),
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || new Date().toISOString(),
    };
  }

  function nullableInteger(value) {
    if (value === '' || value == null) return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : null;
  }

  function normalizeExam(item = {}) {
    const total = nullableInteger(item.total ?? item.questions);
    const correct = nullableInteger(item.correct);
    const wrong = nullableInteger(item.wrong);
    const completeNumbers = total != null && correct != null && wrong != null && total > 0 && correct + wrong === total;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || '').slice(0, 10)) ? String(item.date).slice(0, 10) : todayDateValue();
    const type = String(item.type || item.examType || 'Prova').trim() || 'Prova';
    return {
      id: String(item.id || makeId('p')),
      subject: String(item.subject || 'Sem disciplina').trim(),
      type,
      date,
      materialIds: [...new Set((Array.isArray(item.materialIds) ? item.materialIds : []).map(String))],
      total: completeNumbers ? total : null,
      correct: completeNumbers ? correct : null,
      wrong: completeNumbers ? wrong : null,
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
    };
  }


  function normalizeSession(item = {}) {
    const startTime = item.startTime && !Number.isNaN(new Date(item.startTime).getTime()) ? item.startTime : new Date().toISOString();
    const endTime = item.endTime && !Number.isNaN(new Date(item.endTime).getTime()) ? item.endTime : startTime;
    return {
      id: String(item.id || makeId('s')),
      materialId: item.materialId ? String(item.materialId) : '',
      subject: String(item.subject || 'Sessão livre').trim() || 'Sessão livre',
      materialTitle: String(item.materialTitle || '').trim(),
      activityType: String(item.activityType || 'Apostila').trim() || 'Apostila',
      startTime,
      endTime,
      durationSec: Math.max(1, Math.round(Number(item.durationSec) || ((new Date(endTime) - new Date(startTime)) / 1000) || 1)),
      createdAt: item.createdAt || endTime || new Date().toISOString(),
    };
  }

  function parseLegacyStoredObject(key, fallback = {}) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
    } catch (error) {
      console.warn(`Não foi possível carregar ${key}:`, error);
      return fallback;
    }
  }

  function normalizeSettings(value = {}) {
    const theme = ['system', 'light', 'dark', 'amoled'].includes(value.theme) ? value.theme : 'system';
    const colorTheme = ['sessions', 'medstudy', 'lagoon', 'grove', 'twilight', 'sakura'].includes(value.colorTheme) ? value.colorTheme : 'sessions';
    const sidebarCollapsed = Boolean(value.sidebarCollapsed);
    return { theme, colorTheme, sidebarCollapsed };
  }

  function normalizeActiveTimer(item) {
    if (!item || typeof item !== 'object' || !item.startTime) return null;
    const start = new Date(item.startTime).getTime();
    if (Number.isNaN(start)) return null;
    return {
      id: String(item.id || makeId('timer')),
      startTime: new Date(start).toISOString(),
      mode: ['stopwatch', '25', '50'].includes(String(item.mode)) ? String(item.mode) : 'stopwatch',
      targetSec: Math.max(0, Number(item.targetSec) || 0),
      materialId: item.materialId ? String(item.materialId) : '',
      subject: String(item.subject || 'Sessão livre'),
      materialTitle: String(item.materialTitle || ''),
      activityType: String(item.activityType || 'Apostila'),
      paused: Boolean(item.paused),
      pausedAt: item.pausedAt || null,
      totalPausedSec: Math.max(0, Number(item.totalPausedSec) || 0),
    };
  }

  function migrateLegacyExams(rawMaterials, normalizedMaterials) {
    const groups = new Map();

    function ensureGroup(subject, type, date) {
      const key = `${subject}\u0000${type}\u0000${date}`;
      if (!groups.has(key)) {
        groups.set(key, {
          id: makeId('p'), subject, type, date, materialIds: [],
          total: 0, correct: 0, wrong: 0, hasResultParts: false,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
      }
      return groups.get(key);
    }

    rawMaterials.forEach((raw, index) => {
      const material = normalizedMaterials[index];
      if (!material) return;
      const entries = Array.isArray(raw.examEntries) ? raw.examEntries : [];
      let migratedSpecificEntry = false;

      entries.forEach((entry) => {
        const date = String(entry.date || raw.examDate || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        const type = String(entry.type || entry.examType || 'Prova').trim() || 'Prova';
        const group = ensureGroup(material.subject, type, date);
        if (!group.materialIds.includes(material.id)) group.materialIds.push(material.id);
        const q = Math.max(0, Number(entry.questions ?? entry.total) || 0);
        const c = Math.max(0, Number(entry.correct) || 0);
        const w = Math.max(0, Number(entry.wrong) || 0);
        if (q > 0 && c + w === q) {
          group.total += q;
          group.correct += c;
          group.wrong += w;
          group.hasResultParts = true;
        }
        migratedSpecificEntry = true;
      });

      if (!migratedSpecificEntry && raw.examDate && /^\d{4}-\d{2}-\d{2}$/.test(String(raw.examDate).slice(0, 10))) {
        const date = String(raw.examDate).slice(0, 10);
        const group = ensureGroup(material.subject, 'Prova', date);
        if (!group.materialIds.includes(material.id)) group.materialIds.push(material.id);
      }
    });

    return [...groups.values()].map((group) => normalizeExam({
      ...group,
      total: group.hasResultParts ? group.total : null,
      correct: group.hasResultParts ? group.correct : null,
      wrong: group.hasResultParts ? group.wrong : null,
    }));
  }

  if (!window.StudyStorage) throw new Error('StudyStorage não foi carregado.');

  const storageSnapshot = await window.StudyStorage.loadSnapshot();
  const hasIndexedData = storageSnapshot.initialized || storageSnapshot.materials.length || storageSnapshot.exams.length || storageSnapshot.sessions.length;

  let rawMaterialsAtStart = storageSnapshot.materials;
  let rawExamsAtStart = storageSnapshot.exams;
  let rawSessionsAtStart = storageSnapshot.sessions;
  let settingsAtStartRaw = storageSnapshot.settings || {};
  let activeTimerAtStartRaw = storageSnapshot.activeTimer || null;
  let migratedFromLegacyStorage = false;
  let hadExamStorage = true;

  // Migração automática quando a versão IndexedDB é aberta pela primeira vez NA MESMA ORIGEM
  // em que o MedStudy antigo usava localStorage. Ao mover para uma nova URL, será necessária
  // apenas uma importação de backup; depois disso as atualizações deixam de depender da pasta.
  if (!hasIndexedData) {
    const legacyMaterials = parseLegacyStoredArray(MATERIALS_KEY);
    const legacyExams = parseLegacyStoredArray(EXAMS_KEY);
    const legacySessions = parseLegacyStoredArray(SESSIONS_KEY);
    const legacySettings = parseLegacyStoredObject(SETTINGS_KEY, {});
    const legacyActiveTimer = parseLegacyStoredObject(ACTIVE_TIMER_KEY, null);
    const hasLegacy = legacyMaterials.length || legacyExams.length || legacySessions.length || localStorage.getItem(SETTINGS_KEY) !== null || localStorage.getItem(ACTIVE_TIMER_KEY) !== null;
    if (hasLegacy) {
      rawMaterialsAtStart = legacyMaterials;
      rawExamsAtStart = legacyExams;
      rawSessionsAtStart = legacySessions;
      settingsAtStartRaw = legacySettings;
      activeTimerAtStartRaw = legacyActiveTimer;
      hadExamStorage = localStorage.getItem(EXAMS_KEY) !== null;
      migratedFromLegacyStorage = true;
    }
  }

  const normalizedMaterialsAtStart = rawMaterialsAtStart.map(normalizeMaterial);
  const settingsAtStart = normalizeSettings(settingsAtStartRaw);
  const activeTimerAtStart = normalizeActiveTimer(activeTimerAtStartRaw);

  const state = {
    materials: normalizedMaterialsAtStart,
    exams: rawExamsAtStart.map(normalizeExam),
    sessions: rawSessionsAtStart.map(normalizeSession),
    settings: settingsAtStart,
    activeTimer: activeTimerAtStart,
    currentView: 'dashboard',
    insightsRange: '7',
    timerMode: activeTimerAtStart?.mode || 'stopwatch',
  };

  if (!hadExamStorage && !state.exams.length) {
    state.exams = migrateLegacyExams(rawMaterialsAtStart, state.materials);
  }

  const els = {
    sidebar: $('#sidebar'), sidebarCollapseBtn: $('#sidebarCollapseBtn'), menuButton: $('#menuButton'), navItems: $$('[data-view]'), views: $$('.view'), pageTitle: $('#pageTitle'), todayLabel: $('#todayLabel'), primaryActionBtn: $('#primaryActionBtn'),
    materialModal: $('#materialModal'), closeModal: $('#closeModal'), cancelModal: $('#cancelModal'), materialForm: $('#materialForm'), materialId: $('#materialId'), modalTitle: $('#modalTitle'), subjectInput: $('#subjectInput'), titleInput: $('#titleInput'), classDateInput: $('#classDateInput'), classOrderInput: $('#classOrderInput'), sketchyTagsInput: $('#sketchyTagsInput'), madeInput: $('#madeInput'), readInput: $('#readInput'), notesInput: $('#notesInput'), validationMessage: $('#validationMessage'),
    openQuestionManagerFromMaterial: $('#openQuestionManagerFromMaterial'), modalQuestionsTotal: $('#modalQuestionsTotal'), modalCorrectTotal: $('#modalCorrectTotal'), modalWrongTotal: $('#modalWrongTotal'), questionHistoryHint: $('#questionHistoryHint'),
    questionModal: $('#questionModal'), closeQuestionModal: $('#closeQuestionModal'), questionModalTitle: $('#questionModalTitle'), questionModalSubtitle: $('#questionModalSubtitle'), questionEntryForm: $('#questionEntryForm'), questionMaterialId: $('#questionMaterialId'), questionEntryId: $('#questionEntryId'), questionDateInput: $('#questionDateInput'), questionTotalInput: $('#questionTotalInput'), questionCorrectInput: $('#questionCorrectInput'), questionWrongInput: $('#questionWrongInput'), questionValidationMessage: $('#questionValidationMessage'), questionEntryFormKicker: $('#questionEntryFormKicker'), saveQuestionEntry: $('#saveQuestionEntry'), cancelQuestionEntryEdit: $('#cancelQuestionEntryEdit'), questionModalTotal: $('#questionModalTotal'), questionModalCorrect: $('#questionModalCorrect'), questionModalWrong: $('#questionModalWrong'), questionModalAccuracy: $('#questionModalAccuracy'), questionEntryCount: $('#questionEntryCount'), questionEntryList: $('#questionEntryList'),
    searchInput: $('#searchInput'), subjectFilter: $('#subjectFilter'), statusFilter: $('#statusFilter'), materialExamFilter: $('#materialExamFilter'), sortSelect: $('#sortSelect'), materialsList: $('#materialsList'),
    examSubjectFilter: $('#examSubjectFilter'), examStatusFilter: $('#examStatusFilter'), examsList: $('#examsList'), examFormModal: $('#examFormModal'), closeExamFormModal: $('#closeExamFormModal'), cancelExamForm: $('#cancelExamForm'), examForm: $('#examForm'), examId: $('#examId'), examFormTitle: $('#examFormTitle'), examSubjectInput: $('#examSubjectInput'), examTypeInput: $('#examTypeInput'), examDateInput: $('#examDateInput'), examMaterialOptions: $('#examMaterialOptions'), examMaterialSelectionCount: $('#examMaterialSelectionCount'), examTotalInput: $('#examTotalInput'), examCorrectInput: $('#examCorrectInput'), examWrongInput: $('#examWrongInput'), examValidationMessage: $('#examValidationMessage'),
    performanceSubjectFilter: $('#performanceSubjectFilter'), performanceTopicSort: $('#performanceTopicSort'),
    timerMaterialSelect: $('#timerMaterialSelect'), timerActivitySelect: $('#timerActivitySelect'), timerDisplay: $('#timerDisplay'), timerModeLabel: $('#timerModeLabel'), timerContextTitle: $('#timerContextTitle'), timerContextSub: $('#timerContextSub'), timerStatePill: $('#timerStatePill'), timerPlayBtn: $('#timerPlayBtn'), timerFinishBtn: $('#timerFinishBtn'), timerResetBtn: $('#timerResetBtn'), timerTodayList: $('#timerTodayList'),
    insightsRangeSwitch: $('#insightsRangeSwitch'), focusHeatmap: $('#focusHeatmap'),
    appearanceBtn: $('#appearanceBtn'), appearanceModal: $('#appearanceModal'), closeAppearanceModal: $('#closeAppearanceModal'), themeModeOptions: $('#themeModeOptions'), colorThemeOptions: $('#colorThemeOptions'),
    toast: $('#toast'), exportBtn: $('#exportBtn'), importInput: $('#importInput'), storageStatus: $('#storageStatus'),
  };

  let persistQueue = Promise.resolve();
  function queuePersist(task) {
    persistQueue = persistQueue.then(task).catch((error) => {
      console.error('Falha ao salvar no Study Core:', error);
      showToast?.('Não foi possível salvar os dados localmente.');
    });
    return persistQueue;
  }
  function saveMaterials() { return queuePersist(() => window.StudyStorage.replaceAll('materials', state.materials)); }
  function saveExams() { return queuePersist(() => window.StudyStorage.replaceAll('exams', state.exams)); }
  function saveSessions() { return queuePersist(() => window.StudyStorage.replaceAll('sessions', state.sessions)); }
  function saveSettings() { return queuePersist(() => window.StudyStorage.setKV('settings', state.settings)); }
  function saveActiveTimer() { return queuePersist(() => state.activeTimer ? window.StudyStorage.setKV('activeTimer', state.activeTimer) : window.StudyStorage.deleteKV('activeTimer')); }
  function saveAll() {
    return queuePersist(() => window.StudyStorage.saveSnapshot({ materials: state.materials, exams: state.exams, sessions: state.sessions, settings: state.settings, activeTimer: state.activeTimer }));
  }

  function escapeHtml(value = '') {
    return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }

  function getAnkiNoteIds(value = '') {
    const ids = [];
    const text = String(value || '');
    const nidPattern = /(?:^|[\s(])nid:\s*(\d+(?:\s*,\s*\d+)*)/gi;

    for (const match of text.matchAll(nidPattern)) {
      ids.push(...match[1].split(',').map((id) => id.trim()).filter(Boolean));
    }

    return [...new Set(ids)];
  }

  function getAnkiNoteCount(value = '') {
    return getAnkiNoteIds(value).length;
  }

  function formatDate(date) {
    if (!date) return 'Data não informada';
    const parsed = new Date(`${date}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return 'Data não informada';
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed);
  }

  function plural(value, singular, pluralForm) { return `${value} ${value === 1 ? singular : pluralForm}`; }
  function accuracy(correct, wrong) { const answered = Number(correct || 0) + Number(wrong || 0); return answered > 0 ? Math.round((Number(correct || 0) / answered) * 100) : 0; }
  function hasExamResult(exam) { return exam.total != null && exam.correct != null && exam.wrong != null && exam.total > 0 && exam.correct + exam.wrong === exam.total; }

  function getMaterialExamState(materialId) {
    const linkedExams = state.exams.filter((exam) => exam.materialIds.includes(materialId));
    const hasPendingExam = linkedExams.some((exam) => !hasExamResult(exam));
    const completedOnly = linkedExams.length > 0 && linkedExams.every(hasExamResult);
    return { linkedExams, hasPendingExam, completedOnly };
  }

  function classSort(a, b) {
    const dateA = a.classDate || '9999-12-31';
    const dateB = b.classDate || '9999-12-31';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const orderA = a.classOrder === '' ? Number.MAX_SAFE_INTEGER : Number(a.classOrder);
    const orderB = b.classOrder === '' ? Number.MAX_SAFE_INTEGER : Number(b.classOrder);
    if (orderA !== orderB) return orderA - orderB;
    return a.createdAt.localeCompare(b.createdAt);
  }

  function examChronologicalSort(a, b) {
    const today = todayDateValue();
    const aFuture = a.date >= today;
    const bFuture = b.date >= today;
    if (aFuture !== bFuture) return aFuture ? -1 : 1;
    return aFuture ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
  }


  function localDateKey(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function dateFromKey(key) { return new Date(`${key}T12:00:00`); }
  function addDaysKey(key, delta) { const d = dateFromKey(key); d.setDate(d.getDate() + delta); return localDateKey(d); }
  function secondsToClock(seconds = 0) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(total / 3600); const m = Math.floor((total % 3600) / 60); const sec = total % 60;
    return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
  }
  function formatDuration(seconds = 0, compact = false) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const h = Math.floor(total / 3600); const m = Math.floor((total % 3600) / 60);
    if (h && m) return compact ? `${h}h${String(m).padStart(2, '0')}` : `${h}h ${m}min`;
    if (h) return `${h}h`;
    if (total > 0 && m === 0) return '<1 min';
    return `${Math.max(0, m)} min`;
  }
  function sessionsOnDate(key) { return state.sessions.filter((session) => localDateKey(session.startTime) === key); }
  function sessionSeconds(sessions = []) { return sessions.reduce((sum, session) => sum + Math.max(0, Number(session.durationSec) || 0), 0); }
  function questionEntriesBetween(startKey, endKey) {
    return state.materials.flatMap((material) => (material.questionEntries || []).filter((entry) => (!startKey || entry.date >= startKey) && (!endKey || entry.date <= endKey)).map((entry) => ({ ...entry, materialId: material.id, subject: material.subject, title: material.title })));
  }
  function questionStatsBetween(startKey, endKey) {
    const entries = questionEntriesBetween(startKey, endKey);
    const totals = getQuestionTotals(entries);
    return { ...totals, answered: totals.correct + totals.wrong, accuracy: accuracy(totals.correct, totals.wrong), entries };
  }
  function sessionsBetween(startKey, endKey) { return state.sessions.filter((s) => { const key = localDateKey(s.startTime); return (!startKey || key >= startKey) && (!endKey || key <= endKey); }); }
  function startOfWeekKey(key = todayDateValue()) {
    const d = dateFromKey(key); const day = d.getDay(); const mondayDelta = day === 0 ? -6 : 1 - day; d.setDate(d.getDate() + mondayDelta); return localDateKey(d);
  }
  function getStreakStats() {
    const active = new Set(state.sessions.map((s) => localDateKey(s.startTime)).filter(Boolean));
    const today = todayDateValue(); const yesterday = addDaysKey(today, -1);
    let cursor = active.has(today) ? today : (active.has(yesterday) ? yesterday : null); let current = 0;
    while (cursor && active.has(cursor)) { current += 1; cursor = addDaysKey(cursor, -1); }
    const sorted = [...active].sort(); let record = 0; let run = 0; let prev = null;
    sorted.forEach((key) => { if (prev && addDaysKey(prev, 1) === key) run += 1; else run = 1; record = Math.max(record, run); prev = key; });
    return { current, record, activeDays: active.size };
  }
  function percentDelta(current, previous) {
    if (!previous) return current ? null : 0;
    return Math.round(((current - previous) / previous) * 100);
  }
  function formatDelta(current, previous, suffix = '') {
    const delta = percentDelta(current, previous);
    if (delta == null) return 'novo período';
    if (delta === 0) return `igual ao período anterior`;
    return `${delta > 0 ? '+' : ''}${delta}% vs. anterior${suffix}`;
  }
  function periodRange(range = state.insightsRange) {
    const end = todayDateValue();
    if (range === 'all') {
      const candidates = [state.sessions.map((s) => localDateKey(s.startTime)).sort()[0], ...state.materials.flatMap((m) => (m.questionEntries || []).map((e) => e.date)).sort().slice(0,1)].filter(Boolean).sort();
      const start = candidates[0] || end;
      return { start, end, previousStart: '', previousEnd: '', days: Math.max(1, Math.round((dateFromKey(end)-dateFromKey(start))/86400000)+1) };
    }
    const days = Number(range) || 7; const start = addDaysKey(end, -(days - 1)); const previousEnd = addDaysKey(start, -1); const previousStart = addDaysKey(previousEnd, -(days - 1));
    return { start, end, previousStart, previousEnd, days };
  }

  function getStats(materials = state.materials) {
    const total = materials.length;
    const read = materials.filter((m) => m.read).length;
    const questions = materials.reduce((sum, m) => sum + m.questions, 0);
    const correct = materials.reduce((sum, m) => sum + m.correct, 0);
    const wrong = materials.reduce((sum, m) => sum + m.wrong, 0);
    const unanswered = Math.max(0, questions - correct - wrong);
    const subjects = new Set(materials.map((m) => m.subject)).size;
    return { total, read, pending: total - read, questions, correct, wrong, unanswered, subjects, topics: total, readRate: total ? Math.round((read / total) * 100) : 0, accuracy: accuracy(correct, wrong), avgQuestions: total ? Math.round((questions / total) * 10) / 10 : 0 };
  }

  function getSubjectStats(materials = state.materials) {
    const map = new Map();
    materials.forEach((m) => {
      if (!map.has(m.subject)) map.set(m.subject, { subject: m.subject, materials: 0, read: 0, questions: 0, correct: 0, wrong: 0 });
      const row = map.get(m.subject);
      row.materials += 1; row.read += m.read ? 1 : 0; row.questions += m.questions; row.correct += m.correct; row.wrong += m.wrong;
    });
    return [...map.values()].map((row) => ({ ...row, topics: row.materials, readRate: row.materials ? Math.round((row.read / row.materials) * 100) : 0, accuracy: accuracy(row.correct, row.wrong) })).sort((a, b) => a.subject.localeCompare(b.subject, 'pt-BR'));
  }

  function getTopicStats(materials = state.materials) {
    return materials.map((m) => ({ key: m.id, materialId: m.id, subject: m.subject, topic: m.title, read: m.read ? 1 : 0, questions: m.questions, correct: m.correct, wrong: m.wrong, answered: m.correct + m.wrong, accuracy: accuracy(m.correct, m.wrong), classDate: m.classDate || '', classOrder: m.classOrder, createdAt: m.createdAt, ankiNoteCount: getAnkiNoteCount(m.sketchyTags) }));
  }

  function topicPriorityScore(row) {
    const performancePenalty = row.answered ? row.accuracy : 105;
    const practiceBonus = Math.min(row.questions, 30) * 0.25;
    const pendingBoost = row.read ? 0 : 7;
    return performancePenalty - practiceBonus - pendingBoost;
  }

  function renderAll() {
    renderSubjectFilters();
    renderTimerSelectors();
    renderDashboard();
    renderMaterials();
    renderExams();
    renderPerformance();
    renderInsights();
    renderTimer();
    updatePrimaryAction();
  }

  function renderSubjectFilters() {
    const subjects = [...new Set([...state.materials.map((m) => m.subject), ...state.exams.map((e) => e.subject)])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const materialSubjects = [...new Set(state.materials.map((m) => m.subject))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

    function fill(select, list, allLabel = null) {
      if (!select) return;
      const current = select.value;
      select.innerHTML = `${allLabel ? `<option value="all">${allLabel}</option>` : '<option value="">Selecione...</option>'}${list.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}`;
      if ([...select.options].some((option) => option.value === current)) select.value = current;
    }

    fill(els.subjectFilter, materialSubjects, 'Todas as disciplinas');
    fill(els.performanceSubjectFilter, materialSubjects, 'Todas as disciplinas');
    fill(els.examSubjectFilter, subjects, 'Todas as disciplinas');
  }

  function renderDashboard() {
    renderTodayDashboard();
    const stats = getStats();
    $('#totalMaterials').textContent = stats.total;
    $('#totalSubjects').textContent = plural(stats.subjects, 'disciplina', 'disciplinas');
    $('#readMaterials').textContent = stats.read;
    $('#readRate').textContent = `${stats.readRate}% do total`;
    $('#totalQuestions').textContent = stats.questions;
    $('#questionsPerMaterial').textContent = `${stats.avgQuestions} por apostila`;
    $('#accuracyRate').textContent = `${stats.accuracy}%`;
    $('#correctSummary').textContent = plural(stats.correct, 'acerto', 'acertos');
    $('#heroRing').style.setProperty('--progress', `${stats.readRate}%`);
    $('#heroPercent').textContent = `${stats.readRate}%`;
    $('#questionDonut').style.setProperty('--accuracy', `${stats.accuracy}%`);
    $('#donutPercent').textContent = `${stats.accuracy}%`;
    $('#legendCorrect').textContent = stats.correct;
    $('#legendWrong').textContent = stats.wrong;
    $('#legendUnanswered').textContent = stats.unanswered;
    renderReadingQueue();
    renderUpcomingExamQueue();
    renderSubjectOverview();
  }

  function renderReadingQueue() {
    const queue = [...state.materials].filter((m) => !m.read).sort(classSort).slice(0, 5);
    const container = $('#readingQueue');
    if (!queue.length) {
      container.innerHTML = state.materials.length ? '<div class="empty-state"><strong>Tudo lido por aqui.</strong>Sua fila de leitura está zerada.</div>' : '<div class="empty-state"><strong>Nenhuma apostila cadastrada.</strong>Adicione sua primeira aula para começar.</div>';
      return;
    }
    container.innerHTML = queue.map((m, index) => `<div class="queue-item"><div class="queue-number">${m.classOrder !== '' ? escapeHtml(m.classOrder) : index + 1}</div><div><strong>${escapeHtml(m.title)}</strong><small>${escapeHtml(m.subject)} · ${formatDate(m.classDate)}</small></div><button class="queue-action" data-action="toggle-read" data-id="${m.id}">Marcar lida</button></div>`).join('');
  }

  function renderUpcomingExamQueue() {
    const today = todayDateValue();
    const exams = [...state.exams].filter((exam) => exam.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
    const container = $('#upcomingExamQueue');
    if (!exams.length) {
      container.innerHTML = '<div class="empty-state"><strong>Nenhuma prova próxima.</strong>Cadastre as datas na seção Provas.</div>';
      return;
    }
    container.innerHTML = exams.map((exam) => `<div class="queue-item exam-queue-item"><div class="queue-number exam-queue-number">${escapeHtml(exam.type.replace('Prova', 'PF').slice(0, 4))}</div><div><strong>${escapeHtml(exam.subject)} · ${escapeHtml(exam.type)}</strong><small>${formatDate(exam.date)} · ${plural(exam.materialIds.length, 'apostila', 'apostilas')}</small></div><button class="queue-action" data-action="edit-exam" data-id="${exam.id}">Abrir</button></div>`).join('');
  }

  function renderSubjectOverview() {
    const rows = getSubjectStats().sort((a, b) => b.questions - a.questions || a.subject.localeCompare(b.subject, 'pt-BR'));
    const container = $('#subjectOverview');
    if (!rows.length) { container.innerHTML = '<div class="empty-state"><strong>Sem estatísticas ainda.</strong>Os dados aparecerão após o cadastro das apostilas.</div>'; return; }
    container.innerHTML = rows.map((row) => `<div class="subject-row"><div><strong>${escapeHtml(row.subject)}</strong><small>${row.read}/${row.materials} lidas · ${plural(row.questions, 'questão', 'questões')}</small></div><div class="mini-progress"><span style="width:${row.readRate}%"></span></div><div class="subject-score">${row.accuracy}%</div></div>`).join('');
  }

  function getFilteredMaterials() {
    const query = els.searchInput.value.trim().toLocaleLowerCase('pt-BR');
    const subject = els.subjectFilter.value;
    const status = els.statusFilter.value;
    const examFilter = els.materialExamFilter?.value || 'active';
    const sort = els.sortSelect.value;
    const filtered = state.materials.filter((m) => {
      const matchesQuery = !query || `${m.title} ${m.subject} ${m.notes} ${m.sketchyTags}`.toLocaleLowerCase('pt-BR').includes(query);
      const matchesSubject = subject === 'all' || m.subject === subject;
      const matchesStatus = status === 'all' || (status === 'read' ? m.read : !m.read);
      const examState = getMaterialExamState(m.id);
      const matchesExam = examFilter === 'all'
        || (examFilter === 'active' && !examState.completedOnly)
        || (examFilter === 'pending-exam' && examState.hasPendingExam)
        || (examFilter === 'completed-exam' && examState.completedOnly)
        || (examFilter === 'no-exam' && examState.linkedExams.length === 0);
      return matchesQuery && matchesSubject && matchesStatus && matchesExam;
    });
    return filtered.sort((a, b) => {
      if (sort === 'newest') return (b.classDate || b.createdAt).localeCompare(a.classDate || a.createdAt);
      if (sort === 'oldest') return (a.classDate || a.createdAt).localeCompare(b.classDate || b.createdAt);
      if (sort === 'subject') return a.subject.localeCompare(b.subject, 'pt-BR') || classSort(a, b);
      return classSort(a, b);
    });
  }

  function renderMaterials() {
    const materials = getFilteredMaterials();
    if (!materials.length) {
      els.materialsList.innerHTML = state.materials.length ? '<div class="empty-state"><strong>Nenhum resultado.</strong>Ajuste a busca ou os filtros.</div>' : '<div class="empty-state"><strong>Sua biblioteca está vazia.</strong>Clique em “Nova apostila” para cadastrar a primeira aula.</div>';
      return;
    }
    els.materialsList.innerHTML = materials.map((m, index) => {
      const answeredAccuracy = accuracy(m.correct, m.wrong);
      return `<article class="material-card ${m.read ? 'read' : ''}">
        <div class="material-order">${m.classOrder !== '' ? escapeHtml(m.classOrder) : index + 1}</div>
        <div class="material-info"><div class="material-title-row"><h3>${escapeHtml(m.title)}</h3><span class="status-badge ${m.read ? 'read' : 'pending'}">${m.read ? 'LIDA' : 'PENDENTE'}</span>${m.made ? '<span class="status-badge made">CONFECCIONADA</span>' : ''}</div><p class="material-meta">${escapeHtml(m.subject)} · Aula: ${formatDate(m.classDate)}</p>${m.sketchyTags ? `<div class="anki-notes-block"><div class="anki-notes-header"><span>AnKing Notes · ${getAnkiNoteCount(m.sketchyTags)} ${getAnkiNoteCount(m.sketchyTags) === 1 ? 'nota' : 'notas'}</span><button class="copy-query-button" type="button" data-action="copy-sketchy" data-id="${m.id}">Copiar query</button></div></div>` : ''}</div>
        <div class="question-summary" aria-label="Resumo de questões"><div><span>QUESTÕES · ${m.questionEntries.length} ${m.questionEntries.length === 1 ? 'ENTRADA' : 'ENTRADAS'}</span><b>${m.questions}</b></div><div class="good"><span>ACERTOS</span><b>${m.correct}</b></div><div class="bad"><span>ERROS · ${answeredAccuracy}%</span><b>${m.wrong}</b></div></div>
        <div class="material-actions"><button class="action-button study-action" data-action="start-study" data-id="${m.id}" title="Começar a estudar" aria-label="Começar a estudar">▶</button><button class="action-button question-add-action" data-action="add-questions" data-id="${m.id}" title="Registrar questões" aria-label="Registrar questões">+Q</button><button class="action-button made-action ${m.made ? 'active' : ''}" data-action="toggle-made" data-id="${m.id}" title="${m.made ? 'Marcar como não confeccionada' : 'Marcar como confeccionada'}" aria-label="${m.made ? 'Marcar como não confeccionada' : 'Marcar como confeccionada'}">${m.made ? '◆' : '◇'}</button><button class="action-button" data-action="toggle-read" data-id="${m.id}" title="${m.read ? 'Marcar como não lida' : 'Marcar como lida'}" aria-label="${m.read ? 'Marcar como não lida' : 'Marcar como lida'}">${m.read ? '✓' : '○'}</button><button class="action-button" data-action="edit" data-id="${m.id}" title="Editar" aria-label="Editar">✎</button><button class="action-button danger" data-action="delete" data-id="${m.id}" title="Excluir" aria-label="Excluir">⌫</button></div>
      </article>`;
    }).join('');
  }

  function getFilteredExams() {
    const subject = els.examSubjectFilter.value || 'all';
    const status = els.examStatusFilter.value || 'all';
    const today = todayDateValue();
    return [...state.exams].filter((exam) => {
      if (subject !== 'all' && exam.subject !== subject) return false;
      if (status === 'upcoming' && exam.date < today) return false;
      if (status === 'completed' && !hasExamResult(exam)) return false;
      if (status === 'pending-result' && hasExamResult(exam)) return false;
      return true;
    }).sort(examChronologicalSort);
  }

  function examTimingLabel(exam) {
    const today = todayDateValue();
    if (exam.date === today) return 'HOJE';
    const diff = Math.round((new Date(`${exam.date}T12:00:00`) - new Date(`${today}T12:00:00`)) / 86400000);
    if (diff > 0) return diff === 1 ? 'AMANHÃ' : `EM ${diff} DIAS`;
    return 'REALIZADA';
  }

  function renderExams() {
    const filtered = getFilteredExams();
    const today = todayDateValue();
    const upcoming = filtered.filter((exam) => exam.date >= today);
    const completed = filtered.filter(hasExamResult);
    const totalQuestions = completed.reduce((sum, exam) => sum + exam.total, 0);
    const totalCorrect = completed.reduce((sum, exam) => sum + exam.correct, 0);
    const totalWrong = completed.reduce((sum, exam) => sum + exam.wrong, 0);
    const nextExam = [...upcoming].sort((a, b) => a.date.localeCompare(b.date))[0];

    $('#examCountKpi').textContent = filtered.length;
    $('#examUpcomingKpi').textContent = `${upcoming.length} próximas`;
    $('#nextExamKpi').textContent = nextExam ? `${nextExam.subject} · ${nextExam.type}` : '—';
    $('#nextExamDateKpi').textContent = nextExam ? formatDate(nextExam.date) : 'Nenhuma agendada';
    $('#examQuestionsKpi').textContent = totalQuestions;
    $('#examCompletedKpi').textContent = `${completed.length} com resultado`;
    $('#examAccuracyKpi').textContent = completed.length ? `${accuracy(totalCorrect, totalWrong)}%` : '—';
    $('#examCorrectKpi').textContent = plural(totalCorrect, 'acerto', 'acertos');

    if (!filtered.length) {
      els.examsList.innerHTML = state.exams.length ? '<div class="empty-state"><strong>Nenhuma prova neste filtro.</strong>Ajuste disciplina ou status.</div>' : '<div class="empty-state"><strong>Nenhuma prova cadastrada.</strong>Clique em “Nova prova” e vincule as apostilas que fazem parte da avaliação.</div>';
      return;
    }

    els.examsList.innerHTML = filtered.map((exam) => {
      const materials = exam.materialIds.map((id) => state.materials.find((m) => m.id === id)).filter(Boolean);
      const result = hasExamResult(exam);
      const examAccuracy = result ? accuracy(exam.correct, exam.wrong) : null;
      return `<article class="exam-card ${result ? 'has-result' : ''}">
        <div class="exam-card-main">
          <div class="exam-card-heading"><div><span class="exam-type-badge">${escapeHtml(exam.type)}</span><span class="exam-timing-badge">${examTimingLabel(exam)}</span></div><h3>${escapeHtml(exam.subject)}</h3><p>${formatDate(exam.date)}</p></div>
          <div class="exam-syllabus"><span class="exam-section-label">APOSTILAS DA PROVA · ${materials.length}</span><div class="exam-material-chips">${materials.length ? materials.map((m) => `<button type="button" class="exam-material-chip" data-action="open-topic" data-id="${m.id}">${escapeHtml(m.title)}</button>`).join('') : '<span class="exam-no-materials">Nenhuma apostila vinculada</span>'}</div></div>
        </div>
        <div class="exam-result-box ${result ? '' : 'pending'}">${result ? `<div><span>QUESTÕES</span><b>${exam.total}</b></div><div class="good"><span>ACERTOS</span><b>${exam.correct}</b></div><div class="bad"><span>ERROS</span><b>${exam.wrong}</b></div><div><span>APROVEITAMENTO</span><b>${examAccuracy}%</b></div>` : '<div class="exam-result-pending-copy"><strong>Resultado ainda não lançado</strong><small>Edite a prova depois da avaliação para registrar total, acertos e erros.</small></div>'}</div>
        <div class="exam-card-actions"><button class="ghost-button exam-edit-button" data-action="edit-exam" data-id="${exam.id}">${result ? 'Editar prova' : 'Lançar resultado / editar'}</button><button class="action-button danger" data-action="delete-exam" data-id="${exam.id}" title="Excluir prova">⌫</button></div>
      </article>`;
    }).join('');
  }

  function sortTopicRows(rows, mode) {
    const copy = [...rows];
    const byClass = (a, b) => {
      const dateA = a.classDate || '9999-12-31'; const dateB = b.classDate || '9999-12-31';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const orderA = a.classOrder === '' ? Number.MAX_SAFE_INTEGER : Number(a.classOrder); const orderB = b.classOrder === '' ? Number.MAX_SAFE_INTEGER : Number(b.classOrder);
      return orderA - orderB || a.topic.localeCompare(b.topic, 'pt-BR');
    };
    if (mode === 'accuracy-asc') return copy.sort((a, b) => (a.answered ? a.accuracy : 101) - (b.answered ? b.accuracy : 101) || byClass(a, b));
    if (mode === 'accuracy-desc') return copy.sort((a, b) => (b.answered ? b.accuracy : -1) - (a.answered ? a.accuracy : -1) || byClass(a, b));
    if (mode === 'questions') return copy.sort((a, b) => b.questions - a.questions || byClass(a, b));
    if (mode === 'name') return copy.sort((a, b) => a.topic.localeCompare(b.topic, 'pt-BR'));
    if (mode === 'class') return copy.sort(byClass);
    return copy.sort((a, b) => topicPriorityScore(a) - topicPriorityScore(b) || byClass(a, b));
  }

  function renderPerformance() {
    const selectedSubject = els.performanceSubjectFilter.value || 'all';
    const topicSort = els.performanceTopicSort.value || 'priority';
    const scopedMaterials = state.materials.filter((m) => selectedSubject === 'all' || m.subject === selectedSubject);
    const stats = getStats(scopedMaterials);
    const subjectStats = getSubjectStats(scopedMaterials);
    const topicStats = sortTopicRows(getTopicStats(scopedMaterials), topicSort);
    const answered = stats.correct + stats.wrong;
    const practicedTopics = topicStats.filter((row) => row.answered > 0);

    $('#performanceAccuracy').textContent = `${stats.accuracy}%`; $('#performanceAccuracyHero').textContent = `${stats.accuracy}%`; $('#performanceCorrect').textContent = stats.correct; $('#performanceWrong').textContent = stats.wrong; $('#performanceAnswered').textContent = `${answered} respondidas`; $('#performanceQuestions').textContent = stats.questions; $('#performanceQuestionAverage').textContent = `${stats.avgQuestions} por assunto`; $('#performanceTopics').textContent = stats.topics; $('#performanceTopicsPracticed').textContent = `${practicedTopics.length} com questões`; $('#performanceReadRate').textContent = `${stats.readRate}%`; $('#performanceReadCount').textContent = `${stats.read}/${stats.total} assuntos`; $('#pendingMaterials').textContent = stats.pending;
    $('#correctBar').style.width = `${answered ? (stats.correct / answered) * 100 : 0}%`; $('#wrongBar').style.width = `${answered ? (stats.wrong / answered) * 100 : 0}%`;

    const weakest = [...practicedTopics].sort((a, b) => a.accuracy - b.accuracy || b.questions - a.questions)[0];
    const best = [...practicedTopics].sort((a, b) => b.accuracy - a.accuracy || b.questions - a.questions)[0];
    const mostPracticed = [...topicStats].sort((a, b) => b.questions - a.questions)[0];
    $('#weakestTopic').textContent = weakest ? `${weakest.topic} (${weakest.accuracy}%)` : '—'; $('#bestTopic').textContent = best ? `${best.topic} (${best.accuracy}%)` : '—'; $('#mostPracticedTopic').textContent = mostPracticed?.questions ? `${mostPracticed.topic} (${mostPracticed.questions})` : '—';

    const analysis = $('#topicAnalysis');
    if (!topicStats.length) analysis.innerHTML = '<div class="empty-state"><strong>Sem assuntos neste recorte.</strong>Cadastre apostilas para começar a análise.</div>';
    else {
      const grouped = new Map();
      topicStats.forEach((row) => { if (!grouped.has(row.subject)) grouped.set(row.subject, []); grouped.get(row.subject).push(row); });
      analysis.innerHTML = [...grouped.entries()].map(([subject, rows]) => `<section class="topic-subject-group"><div class="topic-group-header"><div><span>DISCIPLINA</span><h4>${escapeHtml(subject)}</h4></div><small>${plural(rows.length, 'assunto', 'assuntos')}</small></div><div class="topic-card-grid">${rows.map((row) => {
        const hasAnswers = row.answered > 0; const priorityClass = !hasAnswers ? 'neutral' : row.accuracy < 60 ? 'danger' : row.accuracy < 80 ? 'warning' : 'good'; const readLabel = row.read ? 'LIDA' : 'PENDENTE';
        return `<button class="topic-card ${priorityClass}" type="button" data-action="open-topic" data-id="${row.materialId}"><div class="topic-card-head"><div><span class="topic-card-kicker">${escapeHtml(row.subject)} · ${readLabel}</span><strong>${escapeHtml(row.topic)}</strong></div><b>${hasAnswers ? `${row.accuracy}%` : '—'}</b></div><div class="topic-progress"><span style="width:${hasAnswers ? row.accuracy : 0}%"></span></div><div class="topic-card-meta"><span>${row.questions} questões</span><span>${row.correct} ✓</span><span>${row.wrong} ✕</span>${row.ankiNoteCount ? `<span>${row.ankiNoteCount} ${row.ankiNoteCount === 1 ? 'nota Anki' : 'notas Anki'}</span>` : ''}</div></button>`;
      }).join('')}</div></section>`).join('');
    }

    const topicBody = $('#topicTableBody');
    topicBody.innerHTML = topicStats.length ? topicStats.map((row) => `<tr class="clickable-row" data-action="open-topic" data-id="${row.materialId}"><td>${escapeHtml(row.subject)}</td><td><strong>${escapeHtml(row.topic)}</strong></td><td><span class="status-badge ${row.read ? 'read' : 'pending'}">${row.read ? 'LIDA' : 'PENDENTE'}</span></td><td>${row.questions}</td><td>${row.correct}</td><td>${row.wrong}</td><td><span class="score-chip ${!row.answered ? 'muted' : row.accuracy < 60 ? 'danger' : row.accuracy < 80 ? 'warning' : 'good'}">${row.answered ? `${row.accuracy}%` : '—'}</span></td></tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:#66727f;padding:28px">Nenhum dado cadastrado.</td></tr>';

    const subjectBody = $('#subjectTableBody');
    subjectBody.innerHTML = subjectStats.length ? subjectStats.map((row) => `<tr><td><strong>${escapeHtml(row.subject)}</strong></td><td>${row.topics}</td><td>${row.read}</td><td>${row.questions}</td><td>${row.correct}</td><td>${row.wrong}</td><td><span class="score-chip">${row.correct + row.wrong ? `${row.accuracy}%` : '—'}</span></td></tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:#66727f;padding:28px">Nenhum dado cadastrado.</td></tr>';
  }


  function renderTimerSelectors() {
    if (!els.timerMaterialSelect) return;
    const current = els.timerMaterialSelect.value;
    const grouped = new Map();
    [...state.materials].sort((a,b) => a.subject.localeCompare(b.subject,'pt-BR') || classSort(a,b)).forEach((m) => {
      if (!grouped.has(m.subject)) grouped.set(m.subject, []);
      grouped.get(m.subject).push(m);
    });
    els.timerMaterialSelect.innerHTML = '<option value="">Sessão livre</option>' + [...grouped.entries()].map(([subject, list]) => `<optgroup label="${escapeHtml(subject)}">${list.map((m) => `<option value="${m.id}">${escapeHtml(m.title)}</option>`).join('')}</optgroup>`).join('');
    const wanted = state.activeTimer?.materialId || current;
    if ([...els.timerMaterialSelect.options].some((option) => option.value === wanted)) els.timerMaterialSelect.value = wanted;
  }

  function renderSessionList(container, sessions, emptyCopy = 'Nenhuma sessão registrada.') {
    if (!container) return;
    const ordered = [...sessions].sort((a,b) => b.startTime.localeCompare(a.startTime));
    if (!ordered.length) { container.innerHTML = `<div class="empty-state"><strong>${escapeHtml(emptyCopy)}</strong>Use o timer e seu histórico aparece aqui automaticamente.</div>`; return; }
    container.innerHTML = ordered.map((s) => {
      const time = new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date(s.startTime));
      const title = s.materialTitle || s.subject || 'Sessão livre';
      return `<div class="session-row"><div class="session-icon">${s.activityType === 'Questões' ? '?' : s.activityType === 'Anki' ? 'A' : '▶'}</div><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(s.subject)} · ${escapeHtml(s.activityType)} · ${time}</small></div><div style="display:flex;align-items:center;gap:4px"><span class="session-duration">${formatDuration(s.durationSec,true)}</span><button class="session-delete" type="button" data-action="delete-session" data-id="${s.id}" aria-label="Excluir sessão">×</button></div></div>`;
    }).join('');
  }

  function renderTodayDashboard() {
    const today = todayDateValue(); const todaySessions = sessionsOnDate(today); const todaySec = sessionSeconds(todaySessions);
    const weekStart = startOfWeekKey(today); const weekSessions = sessionsBetween(weekStart, today); const weekSec = sessionSeconds(weekSessions);
    const prevWeekStart = addDaysKey(weekStart,-7); const prevWeekEnd = addDaysKey(weekStart,-1); const prevWeekSec = sessionSeconds(sessionsBetween(prevWeekStart, prevWeekEnd));
    const q = questionStatsBetween(today,today); const streak = getStreakStats();
    $('#todayFocusHero').textContent = formatDuration(todaySec);
    $('#todayHeroCopy').textContent = todaySessions.length ? `${plural(todaySessions.length,'sessão registrada','sessões registradas')} hoje. Continue acumulando minutos reais.` : 'Nenhuma sessão registrada hoje. Um clique e o relógio começa.';
    $('#weekFocusHero').textContent = formatDuration(weekSec);
    $('#weekDeltaHero').textContent = prevWeekSec ? formatDelta(weekSec,prevWeekSec) : (weekSec ? 'primeira semana registrada' : 'Sem comparação ainda');
    const reference = prevWeekSec || Math.max(weekSec, 1); const progress = Math.min(100, Math.round((weekSec/reference)*100)); $('#weekProgressBar').style.width = `${progress}%`;
    $('#weekProgressLabel').textContent = prevWeekSec ? (weekSec >= prevWeekSec ? `Você já bateu ${progress}% da semana anterior` : `Faltam ${formatDuration(prevWeekSec-weekSec)} para igualar a semana anterior`) : 'Seu primeiro baseline semanal está sendo criado';
    $('#todayWeekFocus').textContent = formatDuration(weekSec); $('#todayWeekSessions').textContent = plural(weekSessions.length,'sessão','sessões');
    $('#todayQuestions').textContent = q.questions; $('#todayQuestionLabel').textContent = q.questions ? plural(q.entries.length,'entrada registrada','entradas registradas') : 'nenhuma registrada';
    $('#todayAccuracy').textContent = q.answered ? `${q.accuracy}%` : '—'; $('#todayAnswered').textContent = `${q.answered} respondidas`;
    $('#todayStreak').textContent = streak.current; $('#todayStreakLabel').textContent = streak.current === 1 ? 'dia de sequência' : 'dias de sequência';
    renderSessionList($('#todaySessionList'), todaySessions, 'Seu dia ainda está zerado.');
  }

  function timerElapsedSeconds(timer = state.activeTimer) {
    if (!timer) return 0;
    const start = new Date(timer.startTime).getTime(); const end = timer.paused && timer.pausedAt ? new Date(timer.pausedAt).getTime() : Date.now();
    return Math.max(0, Math.floor((end-start)/1000 - (timer.totalPausedSec || 0)));
  }

  function timerContextFromSelection() {
    const material = state.materials.find((m) => m.id === els.timerMaterialSelect?.value);
    return material ? { materialId: material.id, subject: material.subject, materialTitle: material.title } : { materialId:'', subject:'Sessão livre', materialTitle:'' };
  }

  function setTimerMode(mode) {
    if (state.activeTimer) return;
    state.timerMode = ['stopwatch','25','50'].includes(String(mode)) ? String(mode) : 'stopwatch';
    renderTimer();
  }

  function startTimer(contextOverride = null) {
    if (state.activeTimer) return;
    const context = contextOverride || timerContextFromSelection(); const mode = state.timerMode; const targetSec = mode === '25' ? 1500 : mode === '50' ? 3000 : 0;
    state.activeTimer = normalizeActiveTimer({ id:makeId('timer'), startTime:new Date().toISOString(), mode, targetSec, ...context, activityType:els.timerActivitySelect?.value || 'Apostila', paused:false, totalPausedSec:0 });
    saveActiveTimer(); renderTimer(); showToast('Sessão iniciada.');
  }

  function pauseTimer() { if (!state.activeTimer || state.activeTimer.paused) return; state.activeTimer.paused = true; state.activeTimer.pausedAt = new Date().toISOString(); saveActiveTimer(); renderTimer(); }
  function resumeTimer() { if (!state.activeTimer || !state.activeTimer.paused) return; const pausedFor = Math.max(0,(Date.now()-new Date(state.activeTimer.pausedAt).getTime())/1000); state.activeTimer.totalPausedSec += pausedFor; state.activeTimer.paused=false; state.activeTimer.pausedAt=null; saveActiveTimer(); renderTimer(); }
  function completeTimer(auto = false) {
    if (!state.activeTimer) return;
    const timer = state.activeTimer; let elapsed = timerElapsedSeconds(timer); if (timer.targetSec) elapsed = Math.min(elapsed,timer.targetSec);
    if (elapsed < 5 && !auto) { if (!window.confirm('Esta sessão tem menos de 5 segundos. Salvar mesmo assim?')) { state.activeTimer=null; saveActiveTimer(); renderTimer(); return; } }
    const endTime = new Date().toISOString();
    state.sessions.push(normalizeSession({ id:makeId('s'), materialId:timer.materialId, subject:timer.subject, materialTitle:timer.materialTitle, activityType:timer.activityType, startTime:timer.startTime, endTime, durationSec:Math.max(1,elapsed) }));
    state.activeTimer=null; saveSessions(); saveActiveTimer(); renderAll(); showToast(auto ? 'Tempo concluído e sessão salva.' : 'Sessão salva.');
  }
  function clearTimer() { if (state.activeTimer && !window.confirm('Descartar a sessão em andamento?')) return; state.activeTimer=null; saveActiveTimer(); renderTimer(); }

  function renderTimer() {
    if (!els.timerDisplay) return;
    const timer = state.activeTimer;
    $$('.timer-preset').forEach((button) => button.classList.toggle('active', button.dataset.timerMode === (timer?.mode || state.timerMode)));
    const context = timer || timerContextFromSelection();
    els.timerContextTitle.textContent = context.materialTitle || context.subject || 'Sessão livre';
    els.timerContextSub.textContent = context.materialTitle ? `${context.subject} · ${timer?.activityType || els.timerActivitySelect.value}` : 'Escolha um assunto ou apenas comece.';
    if (timer) {
      const elapsed = timerElapsedSeconds(timer); const shown = timer.targetSec ? Math.max(0,timer.targetSec-elapsed) : elapsed;
      els.timerDisplay.textContent = secondsToClock(shown); els.timerModeLabel.textContent = timer.targetSec ? `${Math.round(timer.targetSec/60)} min de foco` : 'Cronômetro livre';
      els.timerStatePill.textContent = timer.paused ? 'PAUSADO' : 'FOCO'; els.timerPlayBtn.textContent = timer.paused ? '▶' : 'Ⅱ'; els.timerFinishBtn.disabled = false; els.timerMaterialSelect.disabled = true; els.timerActivitySelect.disabled = true;
      if (timer.targetSec && elapsed >= timer.targetSec && !timer.paused) { completeTimer(true); return; }
    } else {
      els.timerDisplay.textContent = state.timerMode === '25' ? '00:25:00' : state.timerMode === '50' ? '00:50:00' : '00:00:00'; els.timerModeLabel.textContent = state.timerMode === 'stopwatch' ? 'Cronômetro livre' : `${state.timerMode} min de foco`;
      els.timerStatePill.textContent='PRONTO'; els.timerPlayBtn.textContent='▶'; els.timerFinishBtn.disabled=true; els.timerMaterialSelect.disabled=false; els.timerActivitySelect.disabled=false;
    }
    renderSessionList(els.timerTodayList, sessionsOnDate(todayDateValue()), 'Nenhuma sessão hoje.');
  }

  function rangeDatesForCalendar(start,end) {
    const keys=[]; let cur=start; while (cur<=end && keys.length<5000) { keys.push(cur); cur=addDaysKey(cur,1); } return keys;
  }

  function renderInsights() {
    if (!$('#insightFocus')) return;
    const range = periodRange(); const currentSessions = sessionsBetween(range.start,range.end); const previousSessions = range.previousStart ? sessionsBetween(range.previousStart,range.previousEnd) : [];
    const currentSec=sessionSeconds(currentSessions), previousSec=sessionSeconds(previousSessions); const currentQ=questionStatsBetween(range.start,range.end), previousQ=range.previousStart ? questionStatsBetween(range.previousStart,range.previousEnd) : {questions:0,answered:0,accuracy:0};
    const streak=getStreakStats(); const activeDays=new Set(currentSessions.map((s)=>localDateKey(s.startTime))).size; const prevActiveDays=new Set(previousSessions.map((s)=>localDateKey(s.startTime))).size;
    $('#insightFocus').textContent=formatDuration(currentSec); $('#insightFocusDelta').textContent=range.previousStart ? formatDelta(currentSec,previousSec) : 'histórico completo';
    $('#insightSessions').textContent=currentSessions.length; $('#insightSessionAvg').textContent=`média ${formatDuration(currentSessions.length ? currentSec/currentSessions.length : 0)}`;
    $('#insightQuestions').textContent=currentQ.questions; $('#insightAccuracy').textContent=currentQ.answered ? `${currentQ.accuracy}% de acerto` : '— de acerto';
    $('#insightStreak').textContent=streak.current; $('#insightStreakRecord').textContent=`recorde ${streak.record} dias`;
    els.insightsRangeSwitch?.querySelectorAll('[data-range]').forEach((b)=>b.classList.toggle('active',b.dataset.range===state.insightsRange));
    renderHeatmap();
    const consistency = Math.round((activeDays / Math.max(1,range.days))*100); $('#momentumMain').textContent=streak.current ? `🔥 ${streak.current} ${streak.current===1?'dia':'dias'}` : 'Começando'; $('#momentumCopy').textContent=streak.current ? `Seu recorde é ${streak.record} dias. Você estudou em ${activeDays} dias deste período.` : 'Faça sua primeira sessão para construir uma sequência.'; $('#consistencyBar').style.width=`${Math.min(100,consistency)}%`; $('#consistencyLabel').textContent=`${consistency}% de dias ativos no período`;
    renderWeeklyRhythm(range,currentSessions); renderAllocation(currentSessions,currentSec); renderVersus({currentSec,previousSec,currentQ,previousQ,activeDays,prevActiveDays,currentSessions,previousSessions}); renderRecords();
  }

  function renderHeatmap() {
    const end=todayDateValue(); const start=addDaysKey(end,-364); const startDate=dateFromKey(start); const mondayOffset=startDate.getDay()===0?6:startDate.getDay()-1; const gridStart=addDaysKey(start,-mondayOffset); const daily=new Map(); state.sessions.forEach((s)=>{const key=localDateKey(s.startTime); daily.set(key,(daily.get(key)||0)+s.durationSec);});
    let html=''; for(let i=0;i<371;i++){const key=addDaysKey(gridStart,i); const seconds=daily.get(key)||0; const minutes=Math.round(seconds/60); const level=minutes===0?0:minutes<30?1:minutes<90?2:minutes<180?3:4; const d=dateFromKey(key); const row=d.getDay()===0?7:d.getDay(); const col=Math.floor(i/7)+1; html+=`<span class="heat-cell" data-level="${level}" style="grid-row:${row};grid-column:${col}" title="${formatDate(key)} · ${formatDuration(seconds)}"></span>`;} els.focusHeatmap.innerHTML=html;
  }

  function renderWeeklyRhythm(range,sessions) {
    const labels=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']; const totals=Array(7).fill(0), counts=Array(7).fill(0); sessions.forEach((s)=>totals[new Date(s.startTime).getDay()]+=s.durationSec); rangeDatesForCalendar(range.start,range.end).forEach((key)=>counts[dateFromKey(key).getDay()]++); const avgs=totals.map((v,i)=>counts[i]?v/counts[i]:0); const max=Math.max(...avgs,1); const order=[1,2,3,4,5,6,0]; $('#weeklyRhythm').innerHTML=order.map((i)=>`<div class="rhythm-row"><span>${labels[i]}</span><div class="rhythm-track"><i style="width:${Math.round((avgs[i]/max)*100)}%"></i></div><b>${formatDuration(avgs[i],true)}</b></div>`).join('');
  }

  function renderAllocation(sessions,totalSec) {
    const map=new Map(); sessions.forEach((s)=>map.set(s.subject,(map.get(s.subject)||0)+s.durationSec)); const rows=[...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6); const palette=['var(--accent)','var(--focus-secondary)','color-mix(in srgb,var(--accent) 70%,#7d8ca8)','color-mix(in srgb,var(--accent) 52%,#73a477)','color-mix(in srgb,var(--accent) 42%,#d4a55a)','#8d839f']; let acc=0; const parts=rows.map(([_,sec],i)=>{const start=acc; const pct=totalSec?sec/totalSec*100:0; acc+=pct; return `${palette[i]} ${start}% ${acc}%`;}); $('#allocationDonut').style.background=rows.length?`conic-gradient(${parts.join(',')})`:'var(--surface-v2-3)'; $('#allocationCenter').textContent=formatDuration(totalSec,true); $('#allocationLegend').innerHTML=rows.length?rows.map(([subject,sec],i)=>`<div class="allocation-row"><i style="--allocation-color:${palette[i]}"></i><span>${escapeHtml(subject)}</span><b>${totalSec?Math.round(sec/totalSec*100):0}%</b></div>`).join(''):'<div class="empty-state"><strong>Sem distribuição ainda.</strong>Registre sessões para ver onde seu tempo foi.</div>';
  }

  function renderVersus(data) {
    const metrics=[['Tempo',data.currentSec,data.previousSec,(v)=>formatDuration(v,true)],['Sessões',data.currentSessions.length,data.previousSessions.length,(v)=>String(v)],['Questões',data.currentQ.questions,data.previousQ.questions,(v)=>String(v)],['Dias ativos',data.activeDays,data.prevActiveDays,(v)=>String(v)]]; let wins=0,losses=0; const rows=metrics.map(([label,c,p,fmt])=>{const diff=c-p; if(diff>0)wins++; else if(diff<0)losses++; const cls=diff>0?'good':diff<0?'bad':'neutral'; const delta=p?`${percentDelta(c,p)>0?'+':''}${percentDelta(c,p)}%`:c?'novo':'—'; return `<div class="versus-row"><span>${label}</span><b class="${cls}">${fmt(c)} · ${delta}</b></div>`;}); if(data.currentQ.answered||data.previousQ.answered){const diff=data.currentQ.accuracy-data.previousQ.accuracy;if(diff>0)wins++;else if(diff<0)losses++;rows.push(`<div class="versus-row"><span>Accuracy</span><b class="${diff>0?'good':diff<0?'bad':'neutral'}">${data.currentQ.answered?data.currentQ.accuracy+'%':'—'} · ${diff?`${diff>0?'+':''}${diff} pp`:'—'}</b></div>`);} $('#versusScore').innerHTML=`<strong>${wins}–${losses}</strong><span>${data.previousSessions.length||data.previousQ.questions?'contra o período anterior':'baseline em construção'}</span>`; $('#versusRows').innerHTML=rows.join('');
  }

  function renderRecords() {
    const daily=new Map(); state.sessions.forEach((s)=>{const k=localDateKey(s.startTime);daily.set(k,(daily.get(k)||0)+s.durationSec);}); const bestDay=[...daily.entries()].sort((a,b)=>b[1]-a[1])[0]; $('#recordDay').textContent=bestDay?formatDuration(bestDay[1]):'—'; $('#recordDayDate').textContent=bestDay?formatDate(bestDay[0]):'sem dados';
    const weekly=new Map(); state.sessions.forEach((s)=>{const k=startOfWeekKey(localDateKey(s.startTime));weekly.set(k,(weekly.get(k)||0)+s.durationSec);}); const bestWeek=[...weekly.entries()].sort((a,b)=>b[1]-a[1])[0]; $('#recordWeek').textContent=bestWeek?formatDuration(bestWeek[1]):'—'; $('#recordWeekDate').textContent=bestWeek?`semana de ${formatDate(bestWeek[0])}`:'sem dados';
    const bestSession=[...state.sessions].sort((a,b)=>b.durationSec-a.durationSec)[0]; $('#recordSession').textContent=bestSession?formatDuration(bestSession.durationSec):'—'; $('#recordSessionLabel').textContent=bestSession?(bestSession.materialTitle||bestSession.subject):'sem dados'; $('#recordStreak').textContent=`${getStreakStats().record} dias`;
  }

  function applyAppearance() {
    const {theme,colorTheme}=state.settings; let resolved=theme; if(theme==='system') resolved=window.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light'; document.body.dataset.resolvedTheme=resolved; document.body.dataset.colorTheme=colorTheme; document.documentElement.style.colorScheme=resolved==='light'?'light':'dark';
    els.themeModeOptions?.querySelectorAll('[data-theme-choice]').forEach((b)=>b.classList.toggle('active',b.dataset.themeChoice===theme)); els.colorThemeOptions?.querySelectorAll('[data-color-choice]').forEach((b)=>b.classList.toggle('active',b.dataset.colorChoice===colorTheme));
  }
  function openAppearance(){ applyAppearance(); els.appearanceModal.classList.add('open'); els.appearanceModal.setAttribute('aria-hidden','false'); }
  function closeAppearance(){ els.appearanceModal.classList.remove('open'); els.appearanceModal.setAttribute('aria-hidden','true'); }

  function applySidebarState() {
    const isDesktop = window.matchMedia('(min-width: 821px)').matches;
    const collapsed = Boolean(state.settings.sidebarCollapsed) && isDesktop;
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    if (!els.sidebarCollapseBtn) return;
    els.sidebarCollapseBtn.setAttribute('aria-expanded', String(!collapsed));
    els.sidebarCollapseBtn.setAttribute('aria-label', collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral');
    els.sidebarCollapseBtn.title = collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral';
    const use = els.sidebarCollapseBtn.querySelector('use');
    if (use) use.setAttribute('href', collapsed ? '#icon-chevron-right' : '#icon-chevron-left');
  }

  function toggleSidebarCollapsed() {
    if (!window.matchMedia('(min-width: 821px)').matches) return;
    state.settings.sidebarCollapsed = !state.settings.sidebarCollapsed;
    saveSettings();
    applySidebarState();
  }

  function updatePrimaryAction() {
    els.primaryActionBtn.hidden = false;
    if (state.currentView === 'exams') els.primaryActionBtn.textContent = '+ Nova prova';
    else if (state.currentView === 'materials') els.primaryActionBtn.textContent = '+ Nova apostila';
    else if (state.currentView === 'dashboard') els.primaryActionBtn.textContent = '▶ Estudar agora';
    else els.primaryActionBtn.hidden = true;
  }

  function setView(view) {
    const titles = { dashboard: 'Hoje', timer: 'Timer', materials: 'Apostilas', exams: 'Provas', performance: 'Desempenho', insights: 'Insights' };
    state.currentView = view;
    document.body.dataset.currentView = view;
    els.navItems.forEach((item) => item.classList.toggle('active', item.dataset.view === view));
    els.views.forEach((section) => section.classList.toggle('active', section.id === `${view}View`));
    els.pageTitle.textContent = titles[view] || titles.dashboard;
    els.sidebar.classList.remove('open');
    updatePrimaryAction();
    if (view === 'materials') renderMaterials();
    if (view === 'exams') renderExams();
    if (view === 'performance') renderPerformance();
    if (view === 'timer') renderTimer();
    if (view === 'insights') renderInsights();
  }

  function updateMaterialQuestionSummary(material = null) {
    const totals = material ? getQuestionTotals(material.questionEntries || []) : { questions: 0, correct: 0, wrong: 0 };
    els.modalQuestionsTotal.textContent = totals.questions; els.modalCorrectTotal.textContent = totals.correct; els.modalWrongTotal.textContent = totals.wrong;
    els.openQuestionManagerFromMaterial.disabled = !material; els.openQuestionManagerFromMaterial.dataset.id = material?.id || '';
    els.questionHistoryHint.textContent = material ? `${plural(material.questionEntries?.length || 0, 'entrada registrada', 'entradas registradas')} · ${accuracy(totals.correct, totals.wrong)}% de aproveitamento.` : 'Salve a apostila primeiro; depois use o botão +Q no cartão para registrar suas sessões.';
  }

  function openMaterialModal(material = null) {
    els.materialForm.reset(); els.validationMessage.textContent = '';
    updateMaterialQuestionSummary(material);
    if (material) {
      els.modalTitle.textContent = 'Editar apostila'; els.materialId.value = material.id; els.subjectInput.value = material.subject; els.titleInput.value = material.title; els.classDateInput.value = material.classDate; els.classOrderInput.value = material.classOrder; els.sketchyTagsInput.value = material.sketchyTags; els.madeInput.checked = material.made; els.readInput.checked = material.read; els.notesInput.value = material.notes;
    } else {
      els.modalTitle.textContent = 'Adicionar nova apostila'; els.materialId.value = ''; els.madeInput.checked = false;
    }
    els.materialModal.classList.add('open'); els.materialModal.setAttribute('aria-hidden', 'false'); setTimeout(() => els.subjectInput.focus(), 30);
  }

  function closeMaterialModal() { els.materialModal.classList.remove('open'); els.materialModal.setAttribute('aria-hidden', 'true'); }

  function handleMaterialSubmit(event) {
    event.preventDefault(); els.validationMessage.textContent = '';
    const subject = els.subjectInput.value.trim(); const title = els.titleInput.value.trim();
    if (!subject || !title) { els.validationMessage.textContent = 'Preencha a disciplina e o título da apostila.'; return; }
    const existingId = els.materialId.value; const existing = state.materials.find((m) => m.id === existingId); const id = existingId || makeId('m'); const now = new Date().toISOString();
    const material = normalizeMaterial({ id, subject, title, classDate: els.classDateInput.value, classOrder: els.classOrderInput.value, sketchyTags: els.sketchyTagsInput.value, made: els.madeInput.checked, questionEntries: existing?.questionEntries || [], read: els.readInput.checked, notes: els.notesInput.value.trim(), createdAt: existing?.createdAt || now, updatedAt: now });
    if (existing) state.materials = state.materials.map((m) => m.id === id ? material : m); else state.materials.push(material);

    let removedLinks = 0;
    if (existing && existing.subject !== subject) {
      state.exams = state.exams.map((exam) => {
        if (exam.subject === subject || !exam.materialIds.includes(id)) return exam;
        removedLinks += 1;
        return normalizeExam({ ...exam, materialIds: exam.materialIds.filter((materialId) => materialId !== id), updatedAt: now });
      });
    }
    saveAll(); renderAll(); closeMaterialModal(); showToast(removedLinks ? `Apostila atualizada. ${removedLinks} vínculo(s) de prova incompatível(is) removido(s).` : (existing ? 'Apostila atualizada.' : 'Apostila adicionada.'));
  }

  function resetQuestionEntryForm() {
    els.questionEntryForm.reset(); els.questionEntryId.value = ''; els.questionDateInput.value = todayDateValue(); els.questionValidationMessage.textContent = ''; els.questionEntryFormKicker.textContent = 'NOVA ENTRADA'; els.saveQuestionEntry.textContent = 'Adicionar entrada'; els.cancelQuestionEntryEdit.hidden = true;
  }

  function populateQuestionEntryForm(entry) {
    els.questionEntryId.value = entry.id; els.questionDateInput.value = entry.date; els.questionTotalInput.value = entry.questions; els.questionCorrectInput.value = entry.correct; els.questionWrongInput.value = entry.wrong; els.questionValidationMessage.textContent = ''; els.questionEntryFormKicker.textContent = 'EDITAR ENTRADA'; els.saveQuestionEntry.textContent = 'Atualizar entrada'; els.cancelQuestionEntryEdit.hidden = false; els.questionDateInput.focus();
  }

  function renderQuestionModal(materialId = els.questionMaterialId.value) {
    const material = state.materials.find((item) => item.id === materialId); if (!material) return;
    const totals = getQuestionTotals(material.questionEntries || []);
    els.questionModalTitle.textContent = 'Registrar questões'; els.questionModalSubtitle.textContent = `${material.subject} · ${material.title}`; els.questionModalTotal.textContent = totals.questions; els.questionModalCorrect.textContent = totals.correct; els.questionModalWrong.textContent = totals.wrong; els.questionModalAccuracy.textContent = `${accuracy(totals.correct, totals.wrong)}%`;
    const entries = [...(material.questionEntries || [])].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)); els.questionEntryCount.textContent = plural(entries.length, 'entrada', 'entradas');
    if (!entries.length) { els.questionEntryList.innerHTML = '<div class="question-entry-empty">Nenhuma entrada registrada ainda. Preencha a sessão acima para começar o histórico deste assunto.</div>'; return; }
    els.questionEntryList.innerHTML = entries.map((entry) => `<div class="question-entry-card"><div class="question-entry-date"><strong>${formatDate(entry.date)}</strong><small>Sessão registrada</small></div><div class="question-entry-metric"><span>QUESTÕES</span><b>${entry.questions}</b></div><div class="question-entry-metric good"><span>ACERTOS</span><b>${entry.correct}</b></div><div class="question-entry-metric bad"><span>ERROS</span><b>${entry.wrong}</b></div><div class="question-entry-metric"><span>APROVEITAMENTO</span><b>${entry.correct + entry.wrong ? `${accuracy(entry.correct, entry.wrong)}%` : '—'}</b></div><div class="question-entry-card-actions"><button class="action-button" type="button" data-action="edit-question-entry" data-id="${material.id}" data-entry-id="${entry.id}">✎</button><button class="action-button danger" type="button" data-action="delete-question-entry" data-id="${material.id}" data-entry-id="${entry.id}">⌫</button></div></div>`).join('');
  }

  function openQuestionModal(material) { if (!material) return; if (els.materialModal.classList.contains('open')) closeMaterialModal(); els.questionMaterialId.value = material.id; resetQuestionEntryForm(); renderQuestionModal(material.id); els.questionModal.classList.add('open'); els.questionModal.setAttribute('aria-hidden', 'false'); setTimeout(() => els.questionTotalInput.focus(), 30); }
  function closeQuestionModal() { els.questionModal.classList.remove('open'); els.questionModal.setAttribute('aria-hidden', 'true'); resetQuestionEntryForm(); }
  function readIntegerInput(input) { const raw = input.value.trim(); if (raw === '') return null; const value = Number(raw); return Number.isInteger(value) ? value : null; }

  function handleQuestionEntrySubmit(event) {
    event.preventDefault(); els.questionValidationMessage.textContent = '';
    const material = state.materials.find((item) => item.id === els.questionMaterialId.value); if (!material) { els.questionValidationMessage.textContent = 'Não foi possível localizar este assunto.'; return; }
    const date = els.questionDateInput.value; const questions = readIntegerInput(els.questionTotalInput); const correct = readIntegerInput(els.questionCorrectInput); const wrong = readIntegerInput(els.questionWrongInput);
    if (!date || questions == null || correct == null || wrong == null) { els.questionValidationMessage.textContent = 'Preencha data, questões feitas, acertos e erros com números inteiros.'; return; }
    if (questions < 1 || correct < 0 || wrong < 0) { els.questionValidationMessage.textContent = 'Questões feitas deve ser pelo menos 1; acertos e erros não podem ser negativos.'; return; }
    if (correct + wrong !== questions) { els.questionValidationMessage.textContent = `Acertos + erros precisa ser igual ao total de questões (${correct + wrong} ≠ ${questions}).`; return; }
    const now = new Date().toISOString(); const editingId = els.questionEntryId.value; const existingEntry = material.questionEntries.find((entry) => entry.id === editingId); const entry = normalizeQuestionEntry({ id: editingId || makeId('q'), date, questions, correct, wrong, createdAt: existingEntry?.createdAt || now, updatedAt: now }, date);
    const entries = editingId ? material.questionEntries.map((item) => item.id === editingId ? entry : item) : [...material.questionEntries, entry];
    const updated = normalizeMaterial({ ...material, questionEntries: entries, updatedAt: now }); state.materials = state.materials.map((item) => item.id === material.id ? updated : item); saveMaterials(); renderAll(); renderQuestionModal(updated.id); resetQuestionEntryForm(); showToast(editingId ? 'Entrada atualizada.' : 'Entrada adicionada.');
  }

  function getExamFormSelectedIds() { return $$('#examMaterialOptions input[type="checkbox"]:checked').map((input) => input.value); }
  function updateExamSelectionCount() { const count = getExamFormSelectedIds().length; els.examMaterialSelectionCount.textContent = `${count} ${count === 1 ? 'selecionada' : 'selecionadas'}`; }

  function populateExamSubjectInput(selectedSubject = '') {
    const subjects = [...new Set(state.materials.map((m) => m.subject))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (selectedSubject && !subjects.includes(selectedSubject)) subjects.push(selectedSubject);
    els.examSubjectInput.innerHTML = '<option value="">Selecione...</option>' + subjects.map((subject) => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`).join('');
    els.examSubjectInput.value = selectedSubject;
  }

  function renderExamMaterialOptions(subject, selectedIds = []) {
    const materials = state.materials.filter((m) => m.subject === subject).sort(classSort);
    const selected = new Set(selectedIds);
    if (!subject) els.examMaterialOptions.innerHTML = '<div class="question-entry-empty">Selecione uma disciplina para ver as apostilas disponíveis.</div>';
    else if (!materials.length) els.examMaterialOptions.innerHTML = '<div class="question-entry-empty">Não há apostilas cadastradas nesta disciplina.</div>';
    else els.examMaterialOptions.innerHTML = materials.map((m) => `<label class="exam-material-option"><input type="checkbox" value="${m.id}" ${selected.has(m.id) ? 'checked' : ''}/><span><strong>${escapeHtml(m.title)}</strong><small>${m.classOrder !== '' ? `Aula ${escapeHtml(m.classOrder)} · ` : ''}${formatDate(m.classDate)}</small></span></label>`).join('');
    updateExamSelectionCount();
  }

  function openExamForm(exam = null) {
    if (!state.materials.length && !exam) { showToast('Cadastre ao menos uma apostila antes de criar uma prova.'); setView('materials'); return; }
    els.examForm.reset(); els.examValidationMessage.textContent = ''; els.examId.value = exam?.id || ''; els.examFormTitle.textContent = exam ? 'Editar prova' : 'Adicionar prova';
    populateExamSubjectInput(exam?.subject || '');
    els.examTypeInput.value = exam?.type || '';
    if (exam?.type && !EXAM_TYPES.includes(exam.type)) { const option = document.createElement('option'); option.value = exam.type; option.textContent = exam.type; els.examTypeInput.appendChild(option); els.examTypeInput.value = exam.type; }
    els.examDateInput.value = exam?.date || todayDateValue();
    els.examTotalInput.value = hasExamResult(exam || {}) ? exam.total : ''; els.examCorrectInput.value = hasExamResult(exam || {}) ? exam.correct : ''; els.examWrongInput.value = hasExamResult(exam || {}) ? exam.wrong : '';
    renderExamMaterialOptions(exam?.subject || '', exam?.materialIds || []);
    els.examFormModal.classList.add('open'); els.examFormModal.setAttribute('aria-hidden', 'false'); setTimeout(() => (exam ? els.examTypeInput : els.examSubjectInput).focus(), 30);
  }

  function closeExamForm() { els.examFormModal.classList.remove('open'); els.examFormModal.setAttribute('aria-hidden', 'true'); els.examValidationMessage.textContent = ''; }

  function handleExamSubmit(event) {
    event.preventDefault(); els.examValidationMessage.textContent = '';
    const subject = els.examSubjectInput.value; const type = els.examTypeInput.value; const date = els.examDateInput.value; const materialIds = getExamFormSelectedIds();
    if (!subject || !type || !date) { els.examValidationMessage.textContent = 'Preencha disciplina, tipo e data da prova.'; return; }
    if (!materialIds.length) { els.examValidationMessage.textContent = 'Selecione pelo menos uma apostila que faça parte desta prova.'; return; }
    const invalidMaterial = materialIds.some((id) => state.materials.find((m) => m.id === id)?.subject !== subject);
    if (invalidMaterial) { els.examValidationMessage.textContent = 'Todas as apostilas selecionadas precisam pertencer à disciplina da prova.'; return; }

    const rawTotal = els.examTotalInput.value.trim(); const rawCorrect = els.examCorrectInput.value.trim(); const rawWrong = els.examWrongInput.value.trim();
    const hasAnyResult = rawTotal !== '' || rawCorrect !== '' || rawWrong !== '';
    let total = null; let correct = null; let wrong = null;
    if (hasAnyResult) {
      total = readIntegerInput(els.examTotalInput); correct = readIntegerInput(els.examCorrectInput); wrong = readIntegerInput(els.examWrongInput);
      if (total == null || correct == null || wrong == null || total < 1 || correct < 0 || wrong < 0) { els.examValidationMessage.textContent = 'Para lançar o resultado, preencha total, acertos e erros com números inteiros válidos.'; return; }
      if (correct + wrong !== total) { els.examValidationMessage.textContent = `Acertos + erros precisa ser igual ao total da prova (${correct + wrong} ≠ ${total}).`; return; }
    }

    const existing = state.exams.find((item) => item.id === els.examId.value); const now = new Date().toISOString();
    const exam = normalizeExam({ id: existing?.id || makeId('p'), subject, type, date, materialIds, total, correct, wrong, createdAt: existing?.createdAt || now, updatedAt: now });
    if (existing) state.exams = state.exams.map((item) => item.id === exam.id ? exam : item); else state.exams.push(exam);
    saveExams(); renderAll(); closeExamForm(); showToast(existing ? 'Prova atualizada.' : 'Prova adicionada.');
  }

  async function handleAction(action, id, entryId = null) {
    if (action === 'go-timer') { setView('timer'); return; }
    if (action === 'delete-session') { const session = state.sessions.find((item) => item.id === id); if (!session) return; if (!window.confirm(`Excluir esta sessão de ${formatDuration(session.durationSec)}?`)) return; state.sessions = state.sessions.filter((item) => item.id !== id); saveSessions(); renderAll(); showToast('Sessão excluída.'); return; }
    if (action === 'start-study') { const target = state.materials.find((m) => m.id === id); if (!target) return; setView('timer'); renderTimerSelectors(); els.timerMaterialSelect.value = target.id; state.timerMode = 'stopwatch'; startTimer({ materialId:target.id, subject:target.subject, materialTitle:target.title }); return; }
    if (action === 'edit-exam') { const exam = state.exams.find((item) => item.id === id); if (exam) openExamForm(exam); return; }
    if (action === 'delete-exam') { const exam = state.exams.find((item) => item.id === id); if (!exam) return; if (!window.confirm(`Excluir ${exam.type} de ${exam.subject}?`)) return; state.exams = state.exams.filter((item) => item.id !== id); saveExams(); renderAll(); showToast('Prova excluída.'); return; }
    if (action === 'open-topic') {
      const target = state.materials.find((m) => m.id === id); if (!target) return;
      els.searchInput.value = target.title; renderSubjectFilters(); els.subjectFilter.value = target.subject; els.statusFilter.value = 'all'; if (els.materialExamFilter) els.materialExamFilter.value = 'all'; setView('materials'); renderMaterials(); return;
    }

    const material = state.materials.find((m) => m.id === id); if (!material) return;
    if (action === 'add-questions') { openQuestionModal(material); return; }
    if (action === 'edit-question-entry') { const entry = material.questionEntries.find((item) => item.id === entryId); if (entry) populateQuestionEntryForm(entry); return; }
    if (action === 'delete-question-entry') {
      const entry = material.questionEntries.find((item) => item.id === entryId); if (!entry) return;
      if (!window.confirm(`Excluir a entrada de ${formatDate(entry.date)} com ${entry.questions} questões?`)) return;
      const updated = normalizeMaterial({ ...material, questionEntries: material.questionEntries.filter((item) => item.id !== entryId), updatedAt: new Date().toISOString() }); state.materials = state.materials.map((item) => item.id === material.id ? updated : item); saveMaterials(); renderAll(); renderQuestionModal(updated.id); resetQuestionEntryForm(); showToast('Entrada de questões excluída.'); return;
    }
    if (action === 'toggle-made') { material.made = !material.made; material.updatedAt = new Date().toISOString(); saveMaterials(); renderAll(); showToast(material.made ? 'Apostila marcada como confeccionada.' : 'Apostila marcada como não confeccionada.'); return; }
    if (action === 'toggle-read') { material.read = !material.read; material.updatedAt = new Date().toISOString(); saveMaterials(); renderAll(); showToast(material.read ? 'Leitura concluída.' : 'Apostila marcada como pendente.'); return; }
    if (action === 'edit') { openMaterialModal(material); return; }
    if (action === 'delete') {
      if (!window.confirm(`Excluir “${material.title}”?`)) return;
      state.materials = state.materials.filter((m) => m.id !== id); state.exams = state.exams.map((exam) => exam.materialIds.includes(id) ? normalizeExam({ ...exam, materialIds: exam.materialIds.filter((materialId) => materialId !== id), updatedAt: new Date().toISOString() }) : exam); saveAll(); renderAll(); showToast('Apostila excluída. Vínculos com provas foram atualizados.'); return;
    }
    if (action === 'copy-sketchy') {
      const text = String(material.sketchyTags || '').trim(); if (!text) return;
      try { if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text); else { const textarea = document.createElement('textarea'); textarea.value = text; textarea.style.position = 'fixed'; textarea.style.opacity = '0'; document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); textarea.remove(); } showToast('Query do Anki copiada.'); } catch (error) { console.error(error); showToast('Não foi possível copiar a query.'); }
    }
  }

  function exportData() {
    const payload = { app: 'Study', database: 'study-core', schemaVersion: window.StudyStorage.DATA_SCHEMA_VERSION, version: 22, exportedAt: new Date().toISOString(), note: 'Study V2.2: backup de segurança do banco local.', materials: state.materials, exams: state.exams, sessions: state.sessions, settings: state.settings };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `study-backup-${todayDateValue()}.json`; anchor.click(); URL.revokeObjectURL(url); showToast('Backup exportado.');
  }

  async function importData(file) {
    try {
      const text = await file.text(); const parsed = JSON.parse(text); const rawMaterials = Array.isArray(parsed) ? parsed : parsed.materials;
      if (!Array.isArray(rawMaterials)) throw new Error('Formato inválido');
      if (!window.confirm('Importar este backup substituirá os dados atuais. Continuar?')) return;
      const materials = rawMaterials.map(normalizeMaterial); let exams;
      if (!Array.isArray(parsed) && Array.isArray(parsed.exams)) exams = parsed.exams.map(normalizeExam); else exams = migrateLegacyExams(rawMaterials, materials);
      const sessions = !Array.isArray(parsed) && Array.isArray(parsed.sessions) ? parsed.sessions.map(normalizeSession) : [];
      const settings = !Array.isArray(parsed) && parsed.settings ? normalizeSettings(parsed.settings) : state.settings;
      state.materials = materials; state.exams = exams; state.sessions = sessions; state.settings = settings; state.activeTimer = null; applyAppearance(); applySidebarState(); await saveAll(); renderAll(); showToast('Backup importado para o Study Core.');
    } catch (error) { console.error(error); showToast('Arquivo de backup inválido.'); }
    finally { els.importInput.value = ''; }
  }

  let toastTimer;
  function showToast(message) { clearTimeout(toastTimer); els.toast.textContent = message; els.toast.classList.add('show'); toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2800); }

  function updateStorageStatus(result = {}) {
    if (!els.storageStatus) return;
    const secure = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (result.persisted) els.storageStatus.textContent = '● Study Core · armazenamento persistente';
    else if (secure) els.storageStatus.textContent = '● Study Core · IndexedDB local';
    else els.storageStatus.textContent = '● Study Core · publique em HTTPS para proteção completa';
  }

  function initDate() {
    const text = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date()); els.todayLabel.textContent = text.charAt(0).toUpperCase() + text.slice(1);
  }

  function bindEvents() {
    els.navItems.forEach((item) => item.addEventListener('click', () => setView(item.dataset.view)));
    $$('[data-go-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.goView)));
    els.menuButton.addEventListener('click', () => els.sidebar.classList.toggle('open'));
    els.sidebarCollapseBtn?.addEventListener('click', toggleSidebarCollapsed);
    window.addEventListener('resize', applySidebarState);
    els.primaryActionBtn.addEventListener('click', () => { if (state.currentView === 'exams') openExamForm(); else if (state.currentView === 'materials') openMaterialModal(); else setView('timer'); });
    els.closeModal.addEventListener('click', closeMaterialModal); els.cancelModal.addEventListener('click', closeMaterialModal); els.materialForm.addEventListener('submit', handleMaterialSubmit);
    els.openQuestionManagerFromMaterial.addEventListener('click', () => { const material = state.materials.find((item) => item.id === els.openQuestionManagerFromMaterial.dataset.id); if (material) openQuestionModal(material); });
    els.closeQuestionModal.addEventListener('click', closeQuestionModal); els.cancelQuestionEntryEdit.addEventListener('click', resetQuestionEntryForm); els.questionEntryForm.addEventListener('submit', handleQuestionEntrySubmit);
    els.closeExamFormModal.addEventListener('click', closeExamForm); els.cancelExamForm.addEventListener('click', closeExamForm); els.examForm.addEventListener('submit', handleExamSubmit);
    els.examSubjectInput.addEventListener('change', () => renderExamMaterialOptions(els.examSubjectInput.value, []));
    els.examMaterialOptions.addEventListener('change', (event) => { if (event.target.matches('input[type="checkbox"]')) updateExamSelectionCount(); });
    els.materialModal.addEventListener('click', (event) => { if (event.target === els.materialModal) closeMaterialModal(); });
    els.questionModal.addEventListener('click', (event) => { if (event.target === els.questionModal) closeQuestionModal(); });
    els.examFormModal.addEventListener('click', (event) => { if (event.target === els.examFormModal) closeExamForm(); });
    document.addEventListener('keydown', (event) => { if (event.key !== 'Escape') return; if (els.appearanceModal?.classList.contains('open')) closeAppearance(); else if (els.examFormModal.classList.contains('open')) closeExamForm(); else if (els.questionModal.classList.contains('open')) closeQuestionModal(); else if (els.materialModal.classList.contains('open')) closeMaterialModal(); });
    els.searchInput.addEventListener('input', renderMaterials); [els.subjectFilter, els.statusFilter, els.materialExamFilter, els.sortSelect].forEach((control) => control?.addEventListener('change', renderMaterials));
    [els.examSubjectFilter, els.examStatusFilter].forEach((control) => control.addEventListener('change', renderExams));
    [els.performanceSubjectFilter, els.performanceTopicSort].forEach((control) => control.addEventListener('change', renderPerformance));
    $$('.timer-preset').forEach((button) => button.addEventListener('click', () => setTimerMode(button.dataset.timerMode)));
    els.timerMaterialSelect?.addEventListener('change', renderTimer); els.timerActivitySelect?.addEventListener('change', renderTimer);
    els.timerPlayBtn?.addEventListener('click', () => { if (!state.activeTimer) startTimer(); else if (state.activeTimer.paused) resumeTimer(); else pauseTimer(); });
    els.timerFinishBtn?.addEventListener('click', () => completeTimer(false)); els.timerResetBtn?.addEventListener('click', clearTimer);
    els.insightsRangeSwitch?.addEventListener('click', (event) => { const button=event.target.closest('[data-range]'); if(!button)return; state.insightsRange=button.dataset.range; renderInsights(); });
    els.appearanceBtn?.addEventListener('click', openAppearance); els.closeAppearanceModal?.addEventListener('click', closeAppearance); els.appearanceModal?.addEventListener('click',(event)=>{if(event.target===els.appearanceModal)closeAppearance();});
    els.themeModeOptions?.addEventListener('click',(event)=>{const button=event.target.closest('[data-theme-choice]');if(!button)return;state.settings.theme=button.dataset.themeChoice;saveSettings();applyAppearance();});
    els.colorThemeOptions?.addEventListener('click',(event)=>{const button=event.target.closest('[data-color-choice]');if(!button)return;state.settings.colorTheme=button.dataset.colorChoice;saveSettings();applyAppearance();});
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(state.settings.theme==='system')applyAppearance();});
    document.addEventListener('click', (event) => { const button = event.target.closest('[data-action]'); if (button) handleAction(button.dataset.action, button.dataset.id, button.dataset.entryId || null); });
    els.exportBtn.addEventListener('click', exportData); els.importInput.addEventListener('change', () => { const file = els.importInput.files[0]; if (file) importData(file); });
  }

  async function registerServiceWorker() { if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return; try { const registration = await navigator.serviceWorker.register('./sw.js'); registration.update().catch(() => {}); } catch (error) { console.warn('Service Worker:', error); } }

  let timerTicker = null;
  function startTimerTicker() { if (timerTicker) clearInterval(timerTicker); timerTicker = setInterval(() => { if (state.activeTimer) { renderTimer(); if (state.currentView === 'dashboard') renderTodayDashboard(); } }, 1000); }

  applyAppearance();
  applySidebarState();
  document.body.dataset.currentView = state.currentView;
  initDate();
  bindEvents();
  renderAll();
  startTimerTicker();

  const persistence = await window.StudyStorage.requestPersistentStorage();
  updateStorageStatus(persistence);
  await saveAll();
  if (migratedFromLegacyStorage) showToast('Dados antigos migrados automaticamente para o Study Core.');
  registerServiceWorker();
})();
