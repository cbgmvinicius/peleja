(() => {
  'use strict';

  const MATERIALS_KEY = 'medstudy_materials_v1';
  const EXAMS_KEY = 'medstudy_exams_v1';
  const SIDEBAR_COLLAPSED_KEY = 'medstudy_sidebar_collapsed_v1';
  const EXAM_TYPES = ['PR1.1', 'PR1.2', 'PR2.1', 'PR2.2', 'PR1', 'PR2', 'Segunda chamada', 'Prova final', 'Prova'];

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const makeId = (prefix = 'id') => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`);

  function todayDateValue() {
    const now = new Date();
    const local = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
    return local.toISOString().slice(0, 10);
  }

  function parseStoredArray(key) {
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

  const rawMaterialsAtStart = parseStoredArray(MATERIALS_KEY);
  const normalizedMaterialsAtStart = rawMaterialsAtStart.map(normalizeMaterial);
  const hadExamStorage = localStorage.getItem(EXAMS_KEY) !== null;
  const rawExamsAtStart = parseStoredArray(EXAMS_KEY);

  const state = {
    materials: normalizedMaterialsAtStart,
    exams: rawExamsAtStart.map(normalizeExam),
    currentView: 'dashboard',
    sidebarCollapsed: localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1',
    expandedExamIds: new Set(),
  };

  if (!hadExamStorage && !state.exams.length) {
    state.exams = migrateLegacyExams(rawMaterialsAtStart, state.materials);
  }

  const els = {
    sidebar: $('#sidebar'), menuButton: $('#menuButton'), sidebarCollapseButton: $('#sidebarCollapseButton'), navItems: $$('.nav-item'), views: $$('.view'), pageTitle: $('#pageTitle'), todayLabel: $('#todayLabel'), primaryActionBtn: $('#primaryActionBtn'),
    materialModal: $('#materialModal'), closeModal: $('#closeModal'), cancelModal: $('#cancelModal'), materialForm: $('#materialForm'), materialId: $('#materialId'), modalTitle: $('#modalTitle'), subjectInput: $('#subjectInput'), titleInput: $('#titleInput'), classDateInput: $('#classDateInput'), classOrderInput: $('#classOrderInput'), sketchyTagsInput: $('#sketchyTagsInput'), madeInput: $('#madeInput'), readInput: $('#readInput'), notesInput: $('#notesInput'), validationMessage: $('#validationMessage'),
    openQuestionManagerFromMaterial: $('#openQuestionManagerFromMaterial'), modalQuestionsTotal: $('#modalQuestionsTotal'), modalCorrectTotal: $('#modalCorrectTotal'), modalWrongTotal: $('#modalWrongTotal'), questionHistoryHint: $('#questionHistoryHint'),
    questionModal: $('#questionModal'), closeQuestionModal: $('#closeQuestionModal'), questionModalTitle: $('#questionModalTitle'), questionModalSubtitle: $('#questionModalSubtitle'), questionEntryForm: $('#questionEntryForm'), questionMaterialId: $('#questionMaterialId'), questionEntryId: $('#questionEntryId'), questionDateInput: $('#questionDateInput'), questionTotalInput: $('#questionTotalInput'), questionCorrectInput: $('#questionCorrectInput'), questionWrongInput: $('#questionWrongInput'), questionValidationMessage: $('#questionValidationMessage'), questionEntryFormKicker: $('#questionEntryFormKicker'), saveQuestionEntry: $('#saveQuestionEntry'), cancelQuestionEntryEdit: $('#cancelQuestionEntryEdit'), questionModalTotal: $('#questionModalTotal'), questionModalCorrect: $('#questionModalCorrect'), questionModalWrong: $('#questionModalWrong'), questionModalAccuracy: $('#questionModalAccuracy'), questionEntryCount: $('#questionEntryCount'), questionEntryList: $('#questionEntryList'),
    searchInput: $('#searchInput'), subjectFilter: $('#subjectFilter'), statusFilter: $('#statusFilter'), materialExamFilter: $('#materialExamFilter'), sortSelect: $('#sortSelect'), materialsList: $('#materialsList'),
    examSubjectFilter: $('#examSubjectFilter'), examStatusFilter: $('#examStatusFilter'), examsList: $('#examsList'), examFormModal: $('#examFormModal'), closeExamFormModal: $('#closeExamFormModal'), cancelExamForm: $('#cancelExamForm'), examForm: $('#examForm'), examId: $('#examId'), examFormTitle: $('#examFormTitle'), examSubjectInput: $('#examSubjectInput'), examTypeInput: $('#examTypeInput'), examDateInput: $('#examDateInput'), examMaterialOptions: $('#examMaterialOptions'), examMaterialSelectionCount: $('#examMaterialSelectionCount'), examTotalInput: $('#examTotalInput'), examCorrectInput: $('#examCorrectInput'), examWrongInput: $('#examWrongInput'), examValidationMessage: $('#examValidationMessage'),
    performanceSubjectFilter: $('#performanceSubjectFilter'),
    toast: $('#toast'), exportBtn: $('#exportBtn'), importInput: $('#importInput'),
  };

  function saveMaterials() { localStorage.setItem(MATERIALS_KEY, JSON.stringify(state.materials)); }
  function saveExams() { localStorage.setItem(EXAMS_KEY, JSON.stringify(state.exams)); }
  function saveAll() { saveMaterials(); saveExams(); }

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

  function icon(name) {
    const icons = {
      kebab: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="5.5" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="12" cy="18.5" r="1.8"></circle></svg>',
      edit: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20h4.2l10.05-10.05a1.8 1.8 0 0 0 0-2.55l-1.65-1.65a1.8 1.8 0 0 0-2.55 0L4 15.8V20z"></path><path d="m12.9 6.85 4.25 4.25"></path></svg>',
      trash: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8.75 4.75h6.5"></path><path d="M4.75 6.75h14.5"></path><path d="m6.2 0.25 0.65-2h10.8l0.65 2" transform="translate(-3.5 4.5)"></path><path d="M6.8 6.75 7.7 18a2 2 0 0 0 1.99 1.84h4.62A2 2 0 0 0 16.3 18l0.9-11.25"></path><path d="M10 10v5.5"></path><path d="M14 10v5.5"></path></svg>',
      addQuestions: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 6.5h8"></path><path d="M8 10.5h5"></path><path d="M6 3.75h12A2.25 2.25 0 0 1 20.25 6v12A2.25 2.25 0 0 1 18 20.25H6A2.25 2.25 0 0 1 3.75 18V6A2.25 2.25 0 0 1 6 3.75z"></path><path d="M15.5 14.25v5"></path><path d="M13 16.75h5"></path></svg>',
      madeOn: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14.5 3.75H7A2.25 2.25 0 0 0 4.75 6v12A2.25 2.25 0 0 0 7 20.25h10A2.25 2.25 0 0 0 19.25 18V8.5z"></path><path d="M14.5 3.75V8.5h4.75"></path><path d="m8.5 14 2.15 2.15 4.85-5"></path></svg>',
      madeOff: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M13.5 3.75H7A2.25 2.25 0 0 0 4.75 6v12A2.25 2.25 0 0 0 7 20.25h10A2.25 2.25 0 0 0 19.25 18V9.5z"></path><path d="M13.5 3.75V9.5h5.75"></path><path d="m9 15.75 5.85-5.85 1.75 1.75-5.85 5.85-2.35.6z"></path></svg>',
      readOn: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3.75 5.75A2.25 2.25 0 0 1 6 3.5h3.25A2.75 2.75 0 0 1 12 6.25v13.25a2.75 2.75 0 0 0-2.75-2.75H6A2.25 2.25 0 0 0 3.75 19z"></path><path d="M20.25 5.75A2.25 2.25 0 0 0 18 3.5h-3.25A2.75 2.75 0 0 0 12 6.25v13.25a2.75 2.75 0 0 1 2.75-2.75H18A2.25 2.25 0 0 1 20.25 19z"></path><path d="m14.25 11.75 1.55 1.55 3-3.25"></path></svg>',
      readOff: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3.75 5.75A2.25 2.25 0 0 1 6 3.5h3.25A2.75 2.75 0 0 1 12 6.25v13.25a2.75 2.75 0 0 0-2.75-2.75H6A2.25 2.25 0 0 0 3.75 19z"></path><path d="M20.25 5.75A2.25 2.25 0 0 0 18 3.5h-3.25A2.75 2.75 0 0 0 12 6.25v13.25a2.75 2.75 0 0 1 2.75-2.75H18A2.25 2.25 0 0 1 20.25 19z"></path></svg>',
    };
    return icons[name] || '';
  }

  function buildActionMenu(items = [], label = 'Mais ações') {
    return `<div class="action-menu"><button class="action-button action-menu-toggle" type="button" aria-label="${label}" title="${label}" aria-haspopup="true" aria-expanded="false">${icon('kebab')}</button><div class="action-menu-popover">${items.join('')}</div></div>`;
  }

  function actionMenuItem({ action, id, label, iconName, variant = '', entryId = null }) {
    return `<button class="action-menu-item ${variant}" type="button" data-action="${action}" data-id="${id}"${entryId ? ` data-entry-id="${entryId}"` : ''}>${icon(iconName)}<span>${label}</span></button>`;
  }

  function closeActionMenus() {
    $$('.action-menu.open').forEach((menu) => menu.classList.remove('open'));
    $$('.action-menu-toggle[aria-expanded="true"]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
  }

  function toggleActionMenu(button) {
    const menu = button?.closest('.action-menu');
    if (!menu) return;
    const shouldOpen = !menu.classList.contains('open');
    closeActionMenus();
    menu.classList.toggle('open', shouldOpen);
    button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  }

  function saveSidebarCollapsed() {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, state.sidebarCollapsed ? '1' : '0');
  }

  function applySidebarCollapsedState() {
    document.body.classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
    if (!els.sidebarCollapseButton) return;
    const label = state.sidebarCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral';
    els.sidebarCollapseButton.setAttribute('aria-label', label);
    els.sidebarCollapseButton.setAttribute('title', label);
  }

  function toggleSidebarCollapsed() {
    if (window.innerWidth <= 820) {
      els.sidebar.classList.toggle('open');
      return;
    }
    state.sidebarCollapsed = !state.sidebarCollapsed;
    saveSidebarCollapsed();
    applySidebarCollapsedState();
  }

  function getMaterialExamState(materialId) {
    const linkedExams = state.exams.filter((exam) => exam.materialIds.includes(materialId));
    const hasPendingExam = linkedExams.some((exam) => !hasExamResult(exam));
    const completedOnly = linkedExams.length > 0 && linkedExams.every(hasExamResult);
    return { linkedExams, hasPendingExam, completedOnly };
  }


  function renderExamMaterialList(exam, materials) {
    if (!materials.length) return '<span class="exam-no-materials">Nenhuma apostila vinculada</span>';
    const isExpanded = state.expandedExamIds.has(exam.id);
    const visibleMaterials = isExpanded ? materials : materials.slice(0, 3);
    const chips = visibleMaterials.map((m) => `<button type="button" class="exam-material-chip" data-action="open-topic" data-id="${m.id}">${escapeHtml(m.title)}</button>`).join('');
    const toggle = materials.length > 3 ? `<button type="button" class="exam-material-toggle ${isExpanded ? 'expanded' : ''}" data-action="toggle-exam-materials" data-id="${exam.id}">${isExpanded ? 'Mostrar menos' : `Ver todas (${materials.length})`}</button>` : '';
    return `${chips}${toggle}`;
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
    renderDashboard();
    renderMaterials();
    renderExams();
    renderPerformance();
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
      const actionMenu = buildActionMenu([
        actionMenuItem({ action: 'edit', id: m.id, label: 'Editar apostila', iconName: 'edit' }),
        actionMenuItem({ action: 'delete', id: m.id, label: 'Excluir apostila', iconName: 'trash', variant: 'danger' }),
      ], 'Mais ações da apostila');
      return `<article class="material-card ${m.read ? 'read' : ''}">
        <div class="material-order">${m.classOrder !== '' ? escapeHtml(m.classOrder) : index + 1}</div>
        <div class="material-info"><div class="material-title-row"><h3>${escapeHtml(m.title)}</h3><span class="status-badge ${m.read ? 'read' : 'pending'}">${m.read ? 'LIDA' : 'PENDENTE'}</span>${m.made ? '<span class="status-badge made">PRODUZIDA</span>' : ''}</div><p class="material-meta">${escapeHtml(m.subject)} · Aula: ${formatDate(m.classDate)}</p>${m.sketchyTags ? `<div class="anki-notes-block"><div class="anki-notes-header"><span>AnKing Notes · ${getAnkiNoteCount(m.sketchyTags)} ${getAnkiNoteCount(m.sketchyTags) === 1 ? 'nota' : 'notas'}</span><button class="copy-query-button" type="button" data-action="copy-sketchy" data-id="${m.id}">Copiar query</button></div></div>` : ''}</div>
        <div class="question-summary" aria-label="Resumo de questões"><div class="question-summary-total"><span>QUESTÕES</span><b>${m.questions}</b></div><div class="question-summary-correct good"><span>ACERTOS</span><b>${m.correct}</b></div><div class="question-summary-wrong bad"><span>ERROS</span><b>${m.wrong}</b></div></div>
        <div class="material-actions"><button class="action-button question-add-action" data-action="add-questions" data-id="${m.id}" title="Registrar questões" aria-label="Registrar questões">${icon('addQuestions')}</button><button class="action-button made-action ${m.made ? 'active' : ''}" data-action="toggle-made" data-id="${m.id}" title="${m.made ? 'Marcar como não produzida' : 'Marcar como produzida'}" aria-label="${m.made ? 'Marcar como não produzida' : 'Marcar como produzida'}">${icon(m.made ? 'madeOn' : 'madeOff')}</button><button class="action-button read-action ${m.read ? 'active' : ''}" data-action="toggle-read" data-id="${m.id}" title="${m.read ? 'Marcar como não lida' : 'Marcar como lida'}" aria-label="${m.read ? 'Marcar como não lida' : 'Marcar como lida'}">${icon(m.read ? 'readOn' : 'readOff')}</button>${actionMenu}</div>
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
          <div class="exam-syllabus"><span class="exam-section-label">APOSTILAS DA PROVA · ${materials.length}</span><div class="exam-material-chips">${renderExamMaterialList(exam, materials)}</div></div>
        </div>
        <div class="exam-result-box ${result ? '' : 'pending'}">${result ? `<div><span>QUESTÕES</span><b>${exam.total}</b></div><div class="good"><span>ACERTOS</span><b>${exam.correct}</b></div><div class="bad"><span>ERROS</span><b>${exam.wrong}</b></div><div><span>APROVEITAMENTO</span><b>${examAccuracy}%</b></div>` : '<div class="exam-result-pending-copy"><strong>Resultado ainda não lançado</strong><small>Edite a prova depois da avaliação para registrar total, acertos e erros.</small></div>'}</div>
        <div class="exam-card-actions">${buildActionMenu([
          actionMenuItem({ action: 'edit-exam', id: exam.id, label: result ? 'Editar prova' : 'Lançar resultado / editar', iconName: 'edit' }),
          actionMenuItem({ action: 'delete-exam', id: exam.id, label: 'Excluir prova', iconName: 'trash', variant: 'danger' }),
        ], 'Mais ações da prova')}</div>
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
    const scopedMaterials = state.materials.filter((m) => selectedSubject === 'all' || m.subject === selectedSubject);
    const stats = getStats(scopedMaterials);
    const subjectStats = getSubjectStats(scopedMaterials);
    const topicStats = getTopicStats(scopedMaterials);
    const answered = stats.correct + stats.wrong;
    const practicedTopics = topicStats.filter((row) => row.answered > 0);

    $('#performanceAccuracy').textContent = `${stats.accuracy}%`; $('#performanceAccuracyHero').textContent = `${stats.accuracy}%`; $('#performanceCorrect').textContent = stats.correct; $('#performanceWrong').textContent = stats.wrong; $('#performanceAnswered').textContent = `${answered} respondidas`; $('#performanceQuestions').textContent = stats.questions; $('#performanceQuestionAverage').textContent = `${stats.avgQuestions} por assunto`; $('#performanceTopics').textContent = stats.topics; $('#performanceTopicsPracticed').textContent = `${practicedTopics.length} com questões`; $('#performanceReadRate').textContent = `${stats.readRate}%`; $('#performanceReadCount').textContent = `${stats.read}/${stats.total} assuntos`; $('#pendingMaterials').textContent = stats.pending;
    $('#correctBar').style.width = `${answered ? (stats.correct / answered) * 100 : 0}%`; $('#wrongBar').style.width = `${answered ? (stats.wrong / answered) * 100 : 0}%`;

    const weakest = [...practicedTopics].sort((a, b) => a.accuracy - b.accuracy || b.questions - a.questions)[0];
    const best = [...practicedTopics].sort((a, b) => b.accuracy - a.accuracy || b.questions - a.questions)[0];
    const mostPracticed = [...topicStats].sort((a, b) => b.questions - a.questions)[0];
    $('#weakestTopic').textContent = weakest ? `${weakest.topic} (${weakest.accuracy}%)` : '—'; $('#bestTopic').textContent = best ? `${best.topic} (${best.accuracy}%)` : '—'; $('#mostPracticedTopic').textContent = mostPracticed?.questions ? `${mostPracticed.topic} (${mostPracticed.questions})` : '—';

    const subjectBody = $('#subjectTableBody');
    subjectBody.innerHTML = subjectStats.length ? subjectStats.map((row) => `<tr><td><strong>${escapeHtml(row.subject)}</strong></td><td>${row.topics}</td><td>${row.read}</td><td>${row.questions}</td><td>${row.correct}</td><td>${row.wrong}</td><td><span class="score-chip">${row.correct + row.wrong ? `${row.accuracy}%` : '—'}</span></td></tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:#66727f;padding:28px">Nenhum dado cadastrado.</td></tr>';
  }

  function updatePrimaryAction() {
    if (state.currentView === 'exams') els.primaryActionBtn.textContent = '+ Nova prova';
    else els.primaryActionBtn.textContent = '+ Nova apostila';
  }

  function setView(view) {
    const titles = { dashboard: 'Painel de estudos', materials: 'Biblioteca de apostilas', exams: 'Provas', performance: 'Análise de desempenho' };
    state.currentView = view;
    els.navItems.forEach((item) => item.classList.toggle('active', item.dataset.view === view));
    els.views.forEach((section) => section.classList.toggle('active', section.id === `${view}View`));
    els.pageTitle.textContent = titles[view] || titles.dashboard;
    els.sidebar.classList.remove('open');
    updatePrimaryAction();
    if (view === 'materials') renderMaterials();
    if (view === 'exams') renderExams();
    if (view === 'performance') renderPerformance();
  }

  function updateMaterialQuestionSummary(material = null) {
    const totals = material ? getQuestionTotals(material.questionEntries || []) : { questions: 0, correct: 0, wrong: 0 };
    els.modalQuestionsTotal.textContent = totals.questions; els.modalCorrectTotal.textContent = totals.correct; els.modalWrongTotal.textContent = totals.wrong;
    els.openQuestionManagerFromMaterial.disabled = !material; els.openQuestionManagerFromMaterial.dataset.id = material?.id || '';
    els.questionHistoryHint.textContent = material ? 'Use o botão abaixo para gerenciar o histórico de questões desta apostila.' : 'Salve a apostila primeiro; depois use o botão de questões no cartão para registrar suas sessões.';
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
    els.questionEntryList.innerHTML = entries.map((entry) => `<div class="question-entry-card"><div class="question-entry-date"><strong>${formatDate(entry.date)}</strong><small>Sessão registrada</small></div><div class="question-entry-metric"><span>QUESTÕES</span><b>${entry.questions}</b></div><div class="question-entry-metric good"><span>ACERTOS</span><b>${entry.correct}</b></div><div class="question-entry-metric bad"><span>ERROS</span><b>${entry.wrong}</b></div><div class="question-entry-metric"><span>APROVEITAMENTO</span><b>${entry.correct + entry.wrong ? `${accuracy(entry.correct, entry.wrong)}%` : '—'}</b></div><div class="question-entry-card-actions">${buildActionMenu([
      actionMenuItem({ action: 'edit-question-entry', id: material.id, entryId: entry.id, label: 'Editar entrada', iconName: 'edit' }),
      actionMenuItem({ action: 'delete-question-entry', id: material.id, entryId: entry.id, label: 'Excluir entrada', iconName: 'trash', variant: 'danger' }),
    ], 'Mais ações da entrada')}</div></div>`).join('');
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
    if (action === 'edit-exam') { const exam = state.exams.find((item) => item.id === id); if (exam) openExamForm(exam); return; }
    if (action === 'delete-exam') { const exam = state.exams.find((item) => item.id === id); if (!exam) return; if (!window.confirm(`Excluir ${exam.type} de ${exam.subject}?`)) return; state.exams = state.exams.filter((item) => item.id !== id); state.expandedExamIds.delete(id); saveExams(); renderAll(); showToast('Prova excluída.'); return; }
    if (action === 'toggle-exam-materials') { if (state.expandedExamIds.has(id)) state.expandedExamIds.delete(id); else state.expandedExamIds.add(id); renderExams(); return; }
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
    if (action === 'toggle-made') { material.made = !material.made; material.updatedAt = new Date().toISOString(); saveMaterials(); renderAll(); showToast(material.made ? 'Apostila marcada como produzida.' : 'Apostila marcada como não produzida.'); return; }
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
    const payload = { app: 'Peleja', version: 12, exportedAt: new Date().toISOString(), note: 'Backup com apostilas, histórico de questões, status de produção e provas independentes vinculadas às apostilas.', materials: state.materials, exams: state.exams };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `peleja-backup-${todayDateValue()}.json`; anchor.click(); URL.revokeObjectURL(url); showToast('Backup exportado.');
  }

  async function importData(file) {
    try {
      const text = await file.text(); const parsed = JSON.parse(text); const rawMaterials = Array.isArray(parsed) ? parsed : parsed.materials;
      if (!Array.isArray(rawMaterials)) throw new Error('Formato inválido');
      if (!window.confirm('Importar este backup substituirá os dados atuais. Continuar?')) return;
      const materials = rawMaterials.map(normalizeMaterial); let exams;
      if (!Array.isArray(parsed) && Array.isArray(parsed.exams)) exams = parsed.exams.map(normalizeExam); else exams = migrateLegacyExams(rawMaterials, materials);
      state.materials = materials; state.exams = exams; saveAll(); renderAll(); showToast('Backup importado.');
    } catch (error) { console.error(error); showToast('Arquivo de backup inválido.'); }
    finally { els.importInput.value = ''; }
  }

  let toastTimer;
  function showToast(message) { clearTimeout(toastTimer); els.toast.textContent = message; els.toast.classList.add('show'); toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2800); }

  function initDate() {
    const text = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date()); els.todayLabel.textContent = text.charAt(0).toUpperCase() + text.slice(1);
  }

  function bindEvents() {
    els.navItems.forEach((item) => item.addEventListener('click', () => setView(item.dataset.view)));
    $$('[data-go-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.goView)));
    els.menuButton.addEventListener('click', () => els.sidebar.classList.toggle('open'));
    els.sidebarCollapseButton?.addEventListener('click', toggleSidebarCollapsed);
    window.addEventListener('resize', () => {
      if (window.innerWidth > 820) els.sidebar.classList.remove('open');
    });
    els.primaryActionBtn.addEventListener('click', () => state.currentView === 'exams' ? openExamForm() : openMaterialModal());
    els.closeModal.addEventListener('click', closeMaterialModal); els.cancelModal.addEventListener('click', closeMaterialModal); els.materialForm.addEventListener('submit', handleMaterialSubmit);
    els.openQuestionManagerFromMaterial.addEventListener('click', () => { const material = state.materials.find((item) => item.id === els.openQuestionManagerFromMaterial.dataset.id); if (material) openQuestionModal(material); });
    els.closeQuestionModal.addEventListener('click', closeQuestionModal); els.cancelQuestionEntryEdit.addEventListener('click', resetQuestionEntryForm); els.questionEntryForm.addEventListener('submit', handleQuestionEntrySubmit);
    els.closeExamFormModal.addEventListener('click', closeExamForm); els.cancelExamForm.addEventListener('click', closeExamForm); els.examForm.addEventListener('submit', handleExamSubmit);
    els.examSubjectInput.addEventListener('change', () => renderExamMaterialOptions(els.examSubjectInput.value, []));
    els.examMaterialOptions.addEventListener('change', (event) => { if (event.target.matches('input[type="checkbox"]')) updateExamSelectionCount(); });
    els.materialModal.addEventListener('click', (event) => { if (event.target === els.materialModal) closeMaterialModal(); });
    els.questionModal.addEventListener('click', (event) => { if (event.target === els.questionModal) closeQuestionModal(); });
    els.examFormModal.addEventListener('click', (event) => { if (event.target === els.examFormModal) closeExamForm(); });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if ($$('.action-menu.open').length) {
        closeActionMenus();
        return;
      }
      if (els.examFormModal.classList.contains('open')) closeExamForm();
      else if (els.questionModal.classList.contains('open')) closeQuestionModal();
      else if (els.materialModal.classList.contains('open')) closeMaterialModal();
    });
    els.searchInput.addEventListener('input', renderMaterials); [els.subjectFilter, els.statusFilter, els.materialExamFilter, els.sortSelect].forEach((control) => control?.addEventListener('change', renderMaterials));
    [els.examSubjectFilter, els.examStatusFilter].forEach((control) => control.addEventListener('change', renderExams));
    els.performanceSubjectFilter.addEventListener('change', renderPerformance);
    document.addEventListener('click', (event) => {
      const toggle = event.target.closest('.action-menu-toggle');
      if (toggle) {
        toggleActionMenu(toggle);
        return;
      }
      if (!event.target.closest('.action-menu')) closeActionMenus();
      const button = event.target.closest('[data-action]');
      if (button) {
        closeActionMenus();
        handleAction(button.dataset.action, button.dataset.id, button.dataset.entryId || null);
      }
    });
    els.exportBtn.addEventListener('click', exportData); els.importInput.addEventListener('change', () => { const file = els.importInput.files[0]; if (file) importData(file); });
  }

  function registerServiceWorker() { if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Service Worker:', error)); }

  saveAll(); initDate(); bindEvents(); applySidebarCollapsedState(); renderAll(); registerServiceWorker();
})();
