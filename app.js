(() => {
  'use strict';

  // Keep the stored area key compatible with existing results.
  const areaLabel = value => value === 'Medicina Preventiva / Saúde Coletiva' ? 'Medicina Preventiva' : value;

  const personalStore = globalThis.PELEJA_STORAGE;
  if (!personalStore) throw new Error('Armazenamento por conta indisponível. Recarregue o Peleja.');
  let currentAcademicData = globalThis.PELEJA_ACADEMIC_DATA;

  const MATERIALS_KEY = 'medstudy_materials_v1';
  const EXAMS_KEY = 'medstudy_exams_v1';
  const SIMULATIONS_KEY = 'medstudy_simulations_v1';
  const SIDEBAR_COLLAPSED_KEY = 'medstudy_sidebar_collapsed_v1';
  const EXAM_TYPES = ['PR1.1', 'PR1.2', 'PR2.1', 'PR2.2', 'PR1', 'PR2', 'Segunda chamada', 'Prova final', 'Prova'];
  const GRAND_AREAS = ['Clínica Médica', 'Cirurgia', 'Pediatria', 'Ginecologia e Obstetrícia', 'Medicina Preventiva / Saúde Coletiva', 'Outra / Interdisciplinar'];

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const makeId = (prefix = 'id') => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`);

  function canManageStructure() {
    if (personalStore.isLocalOwner) return true;
    return globalThis.PELEJA_ACCESS?.isAdmin === true;
  }

  function requireAdmin(label = 'alterar a estrutura do Peleja') {
    if (canManageStructure()) return true;
    showToast(`Apenas o administrador pode ${label}.`);
    return false;
  }

  function todayDateValue() {
    const now = new Date();
    const local = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
    return local.toISOString().slice(0, 10);
  }

  function parseStoredArray(key) {
    try {
      const parsed = JSON.parse(personalStore.getItem(key) || '[]');
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

    if (!Array.isArray(item.questionEntries)) {
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
      code: String(item.code || '').trim(),
      period: String(item.period || '').trim(),
      area: item.area == null ? null : String(item.area).trim(),
      specialty: item.specialty == null ? null : String(item.specialty).trim(),
      standalone: Boolean(item.standalone),
      dateConfidence: String(item.dateConfidence || '').trim(),
      source: String(item.source || '').trim(),
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
      performed: item.performed === true,
      total: completeNumbers ? total : null,
      correct: completeNumbers ? correct : null,
      wrong: completeNumbers ? wrong : null,
      period: String(item.period || '').trim(),
      source: String(item.source || '').trim(),
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
    };
  }

  function normalizeSimulationAnswer(value = '') { return String(value || '').trim().toUpperCase(); }

  function isAnnulledSimulationAnswer(value = '') {
    const normalized = normalizeSimulationAnswer(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return ['ANULADA', 'ANULADO', 'ANUL'].includes(normalized);
  }

  function normalizeSimulationQuestion(item = {}, index = 0) {
    return {
      id: String(item.id || makeId('sq')),
      number: Math.max(1, Number(item.number) || index + 1),
      area: String(item.area || '').trim(),
      userAnswer: normalizeSimulationAnswer(item.userAnswer ?? item.answer ?? ''),
      correctAnswer: normalizeSimulationAnswer(item.correctAnswer ?? item.key ?? ''),
      flashFront: String(item.flashFront ?? item.discriminatorFront ?? '').trim(),
      flashBack: String(item.flashBack ?? item.discriminatorBack ?? item.discriminator ?? '').trim(),
      flagged: Boolean(item.flagged),
    };
  }

  function normalizeSimulation(item = {}) {
    const rawDate = String(item.date || '').slice(0, 10);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayDateValue();
    return {
      id: String(item.id || makeId('sim')),
      name: String(item.name || item.title || 'Simulado').trim() || 'Simulado',
      date,
      questions: (Array.isArray(item.questions) ? item.questions : []).map((question, index) => normalizeSimulationQuestion(question, index)),
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
    };
  }

  function simulationQuestionResult(question = {}) {
    const userAnswer = normalizeSimulationAnswer(question.userAnswer);
    const correctAnswer = normalizeSimulationAnswer(question.correctAnswer);
    if (!userAnswer || !correctAnswer || isAnnulledSimulationAnswer(correctAnswer)) return null;
    return userAnswer === correctAnswer;
  }

  function simulationStats(simulations = []) {
    const questions = simulations.flatMap((simulation) => simulation.questions || []);
    let correct = 0, wrong = 0, annulled = 0;
    questions.forEach((question) => {
      if (isAnnulledSimulationAnswer(question.correctAnswer)) { annulled += 1; return; }
      const result = simulationQuestionResult(question);
      if (result === true) correct += 1;
      else if (result === false) wrong += 1;
    });
    const answered = correct + wrong;
    return { total: questions.length, answered, correct, wrong, annulled, pending: Math.max(0, questions.length - answered - annulled), accuracy: answered ? Math.round((correct / answered) * 100) : null };
  }

  function simulationAreaStats(simulations = []) {
    const map = new Map();
    simulations.forEach((simulation) => (simulation.questions || []).forEach((question) => {
      const result = simulationQuestionResult(question);
      if (result == null) return;
      const area = String(question.area || 'Sem área').trim() || 'Sem área';
      if (!map.has(area)) map.set(area, { area, answered: 0, correct: 0, wrong: 0, accuracy: 0 });
      const row = map.get(area);
      row.answered += 1;
      if (result) row.correct += 1; else row.wrong += 1;
      row.accuracy = Math.round((row.correct / row.answered) * 100);
    }));
    const order = new Map(GRAND_AREAS.map((area, index) => [area, index]));
    return [...map.values()].sort((a, b) => (order.get(a.area) ?? 999) - (order.get(b.area) ?? 999) || a.area.localeCompare(b.area, 'pt-BR'));
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
  const hadExamStorage = personalStore.getItem(EXAMS_KEY) !== null;
  const rawExamsAtStart = parseStoredArray(EXAMS_KEY);
  const rawSimulationsAtStart = parseStoredArray(SIMULATIONS_KEY);

  const state = {
    materials: normalizedMaterialsAtStart,
    exams: rawExamsAtStart.map(normalizeExam),
    simulations: rawSimulationsAtStart.map(normalizeSimulation),
    currentView: 'dashboard',
    sidebarCollapsed: localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1',
    expandedExamIds: new Set(),
  };

  if (!hadExamStorage && !state.exams.length) {
    state.exams = migrateLegacyExams(rawMaterialsAtStart, state.materials);
  }

  function structuralCode(item = {}) {
    const explicit = String(item.code || '').trim().toUpperCase();
    if (explicit) return explicit.replace(/\s+/g, '');
    const title = String(item.title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const match = title.match(/^([A-Z]+)\s*0?(\d{1,2})(?:\.(\d+))?/);
    return match ? `${match[1]}${String(Number(match[2])).padStart(2, '0')}${match[3] ? `.${match[3]}` : ''}` : '';
  }

  function materialStructuralKey(item = {}) {
    const subject = String(item.subject || '').trim().toLocaleLowerCase('pt-BR');
    const code = structuralCode(item);
    const title = String(item.title || '').trim().toLocaleLowerCase('pt-BR');
    return `${subject}\u0000${code || title}`;
  }

  function applyAcademicData(academicData) {
    if (!academicData || !Array.isArray(academicData.materials)) return false;

    let localMaterials = [...state.materials];
    const migrationRekeys = new Map();

    (Array.isArray(academicData.materialMigrations) ? academicData.materialMigrations : []).forEach((migration) => {
      const fromId = String(migration?.fromId || '');
      const toId = String(migration?.toId || '');
      if (!fromId || !toId || fromId === toId) return;

      const source = localMaterials.find((item) => item.id === fromId);
      if (!source) return;
      const target = localMaterials.find((item) => item.id === toId);

      if (target) {
        const questionEntries = [...(target.questionEntries || []), ...(source.questionEntries || [])];
        const seenEntryIds = new Set();
        target.questionEntries = questionEntries.filter((entry) => {
          const key = String(entry?.id || '');
          if (key && seenEntryIds.has(key)) return false;
          if (key) seenEntryIds.add(key);
          return true;
        });
        target.made = Boolean(target.made || source.made);
        target.read = Boolean(target.read || source.read);
        target.sketchyTags = target.sketchyTags || source.sketchyTags || '';
        target.notes = target.notes || source.notes || '';
        target.createdAt = target.createdAt || source.createdAt;
        target.updatedAt = [target.updatedAt, source.updatedAt].filter(Boolean).sort().at(-1) || new Date().toISOString();
        localMaterials = localMaterials.filter((item) => item.id !== fromId);
      } else {
        source.id = toId;
      }

      migrationRekeys.set(fromId, toId);
    });

    const localById = new Map(localMaterials.map((item) => [item.id, item]));
    const localByKey = new Map(localMaterials.map((item) => [materialStructuralKey(item), item]));
    const consumedLocalIds = new Set();
    const rekeyedMaterialIds = new Map(migrationRekeys);

    const mergedMaterials = academicData.materials.map((canonical) => {
      const existing = localById.get(String(canonical.id || '')) || localByKey.get(materialStructuralKey(canonical));
      if (existing) consumedLocalIds.add(existing.id);
      const canonicalId = String(canonical.id || existing?.id || makeId('m'));
      if (existing && existing.id !== canonicalId) rekeyedMaterialIds.set(existing.id, canonicalId);

      return normalizeMaterial({
        ...(existing || {}),
        id: canonicalId,
        subject: canonical.subject || existing?.subject,
        title: canonical.title || existing?.title,
        code: canonical.code || structuralCode(canonical) || structuralCode(existing || {}),
        classDate: canonical.classDate ?? existing?.classDate ?? '',
        classOrder: canonical.classOrder ?? existing?.classOrder ?? '',
        period: canonical.period || academicData.periods?.find((period) => period.active)?.id || existing?.period || '',
        area: canonical.area ?? existing?.area ?? null,
        specialty: canonical.specialty ?? existing?.specialty ?? null,
        standalone: canonical.standalone ?? existing?.standalone ?? false,
        dateConfidence: canonical.dateConfidence || existing?.dateConfidence || '',
        source: canonical.source || existing?.source || 'academic-data',
        sketchyTags: existing?.sketchyTags || '',
        made: existing?.made || false,
        questionEntries: existing?.questionEntries || [],
        read: existing?.read || false,
        notes: existing?.notes || '',
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: existing?.updatedAt || new Date().toISOString(),
      });
    });

    localMaterials.forEach((item) => {
      if (!consumedLocalIds.has(item.id)) mergedMaterials.push(item);
    });

    const localExams = [...state.exams];
    const localExamById = new Map(localExams.map((exam) => [exam.id, exam]));
    const consumedExamIds = new Set();
    const canonicalExams = Array.isArray(academicData.exams) ? academicData.exams : [];
    const mergedExams = canonicalExams.map((canonical) => {
      const existing = localExamById.get(String(canonical.id || ''));
      if (existing) consumedExamIds.add(existing.id);
      const canonicalMaterialIds = (Array.isArray(canonical.materialIds) ? canonical.materialIds : []).map((id) => rekeyedMaterialIds.get(String(id)) || String(id));
      return normalizeExam({
        ...(existing || {}),
        id: canonical.id || existing?.id || makeId('p'),
        subject: canonical.subject || existing?.subject,
        type: canonical.type || existing?.type,
        date: canonical.date || existing?.date,
        materialIds: canonicalMaterialIds,
        period: canonical.period || existing?.period || '',
        source: canonical.source || existing?.source || 'academic-data',
        total: existing?.total ?? null,
        correct: existing?.correct ?? null,
        wrong: existing?.wrong ?? null,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: existing?.updatedAt || new Date().toISOString(),
      });
    });

    localExams.forEach((exam) => {
      if (consumedExamIds.has(exam.id)) return;
      mergedExams.push(normalizeExam({
        ...exam,
        materialIds: exam.materialIds.map((id) => rekeyedMaterialIds.get(id) || id),
      }));
    });

    state.materials = mergedMaterials;
    state.exams = mergedExams;
    return true;
  }

  if (personalStore.getItem(MATERIALS_KEY) === null) applyAcademicData(currentAcademicData);

  const els = {
    sidebar: $('#sidebar'), menuButton: $('#menuButton'), sidebarCollapseButton: $('#sidebarCollapseButton'), navItems: $$('.nav-item'), views: $$('.view'), pageTitle: $('#pageTitle'), todayLabel: $('#todayLabel'), primaryActionBtn: $('#primaryActionBtn'),
    materialModal: $('#materialModal'), closeModal: $('#closeModal'), cancelModal: $('#cancelModal'), materialForm: $('#materialForm'), materialId: $('#materialId'), modalTitle: $('#modalTitle'), subjectInput: $('#subjectInput'), titleInput: $('#titleInput'), classDateInput: $('#classDateInput'), classOrderInput: $('#classOrderInput'), sketchyTagsInput: $('#sketchyTagsInput'), madeInput: $('#madeInput'), readInput: $('#readInput'), notesInput: $('#notesInput'), validationMessage: $('#validationMessage'),
    openQuestionManagerFromMaterial: $('#openQuestionManagerFromMaterial'), modalQuestionsTotal: $('#modalQuestionsTotal'), modalCorrectTotal: $('#modalCorrectTotal'), modalWrongTotal: $('#modalWrongTotal'), questionHistoryHint: $('#questionHistoryHint'),
    questionModal: $('#questionModal'), closeQuestionModal: $('#closeQuestionModal'), questionModalTitle: $('#questionModalTitle'), questionModalSubtitle: $('#questionModalSubtitle'), questionEntryForm: $('#questionEntryForm'), questionMaterialId: $('#questionMaterialId'), questionEntryId: $('#questionEntryId'), questionDateInput: $('#questionDateInput'), questionTotalInput: $('#questionTotalInput'), questionCorrectInput: $('#questionCorrectInput'), questionWrongInput: $('#questionWrongInput'), questionValidationMessage: $('#questionValidationMessage'), questionEntryFormKicker: $('#questionEntryFormKicker'), saveQuestionEntry: $('#saveQuestionEntry'), cancelQuestionEntryEdit: $('#cancelQuestionEntryEdit'), questionModalTotal: $('#questionModalTotal'), questionModalCorrect: $('#questionModalCorrect'), questionModalWrong: $('#questionModalWrong'), questionModalAccuracy: $('#questionModalAccuracy'), questionEntryCount: $('#questionEntryCount'), questionEntryList: $('#questionEntryList'),
    searchInput: $('#searchInput'), subjectFilter: $('#subjectFilter'), statusFilter: $('#statusFilter'), ankiFilter: $('#ankiFilter'), materialExamFilter: $('#materialExamFilter'), sortSelect: $('#sortSelect'), materialsList: $('#materialsList'),
    examSubjectFilter: $('#examSubjectFilter'), examStatusFilter: $('#examStatusFilter'), examsList: $('#examsList'), examFormModal: $('#examFormModal'), closeExamFormModal: $('#closeExamFormModal'), cancelExamForm: $('#cancelExamForm'), examForm: $('#examForm'), examId: $('#examId'), examFormTitle: $('#examFormTitle'), examSubjectInput: $('#examSubjectInput'), examTypeInput: $('#examTypeInput'), examDateInput: $('#examDateInput'), examMaterialOptions: $('#examMaterialOptions'), examMaterialSelectionCount: $('#examMaterialSelectionCount'), examTotalInput: $('#examTotalInput'), examCorrectInput: $('#examCorrectInput'), examWrongInput: $('#examWrongInput'), examValidationMessage: $('#examValidationMessage'),
    simulationCountKpi: $('#simulationCountKpi'), simulationCountNote: $('#simulationCountNote'), simulationAccuracyKpi: $('#simulationAccuracyKpi'), simulationAccuracyNote: $('#simulationAccuracyNote'), simulationWeakAreaKpi: $('#simulationWeakAreaKpi'), simulationWeakAreaNote: $('#simulationWeakAreaNote'), simulationStrongAreaKpi: $('#simulationStrongAreaKpi'), simulationStrongAreaNote: $('#simulationStrongAreaNote'), simulationAreaStats: $('#simulationAreaStats'), simulationsList: $('#simulationsList'), errorSimulationFilter: $('#errorSimulationFilter'), errorAreaFilter: $('#errorAreaFilter'), errorCardFilter: $('#errorCardFilter'), errorNotebookCount: $('#errorNotebookCount'), errorNotebookList: $('#errorNotebookList'), exportSimulationFlashcardsBtn: $('#exportSimulationFlashcardsBtn'),
    simulationModal: $('#simulationModal'), closeSimulationModal: $('#closeSimulationModal'), cancelSimulationModal: $('#cancelSimulationModal'), simulationForm: $('#simulationForm'), simulationId: $('#simulationId'), simulationModalTitle: $('#simulationModalTitle'), simulationNameInput: $('#simulationNameInput'), simulationDateInput: $('#simulationDateInput'), simulationQuestionCountInput: $('#simulationQuestionCountInput'), generateSimulationQuestionsBtn: $('#generateSimulationQuestionsBtn'), simulationQuestionRows: $('#simulationQuestionRows'), simulationValidationMessage: $('#simulationValidationMessage'), simulationDraftTotal: $('#simulationDraftTotal'), simulationDraftAnswered: $('#simulationDraftAnswered'), simulationDraftCorrect: $('#simulationDraftCorrect'), simulationDraftWrong: $('#simulationDraftWrong'), simulationDraftAccuracy: $('#simulationDraftAccuracy'),
    toast: $('#toast'), exportBtn: $('#exportBtn'), importInput: $('#importInput'),
  };

  let seedingAccount = true;

  function notifyDataChanged(kind) { window.dispatchEvent(new CustomEvent('peleja:data-changed', { detail: { kind } })); }
  function saveMaterials() { if (personalStore.setItem(MATERIALS_KEY, JSON.stringify(state.materials), { seed: seedingAccount })) notifyDataChanged('materials'); }
  function saveExams() { if (personalStore.setItem(EXAMS_KEY, JSON.stringify(state.exams), { seed: seedingAccount })) notifyDataChanged('exams'); }
  function saveSimulations() { if (personalStore.setItem(SIMULATIONS_KEY, JSON.stringify(state.simulations), { seed: seedingAccount })) notifyDataChanged('simulations'); }
  function saveAll() { saveMaterials(); saveExams(); saveSimulations(); }

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
  function isExamPerformed(exam) { return exam.performed === true || hasExamResult(exam); }
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
    return `<button class="action-menu-item ${variant}" type="button" data-action="${action}" data-id="${escapeHtml(id)}"${entryId ? ` data-entry-id="${escapeHtml(entryId)}"` : ''}>${icon(iconName)}<span>${label}</span></button>`;
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
    const hasPendingExam = linkedExams.some((exam) => !isExamPerformed(exam));
    const completedOnly = linkedExams.length > 0 && linkedExams.every(isExamPerformed);
    return { linkedExams, hasPendingExam, completedOnly };
  }

  function renderExamMaterialList(exam, materials) {
    if (!materials.length) return '<span class="exam-no-materials">Nenhuma apostila vinculada</span>';
    const isExpanded = state.expandedExamIds.has(exam.id);
    const visibleMaterials = isExpanded ? materials : materials.slice(0, 3);
    const chips = visibleMaterials.map((m) => `<button type="button" class="exam-material-chip" data-action="open-topic" data-id="${escapeHtml(m.id)}">${escapeHtml(m.title)}</button>`).join('');
    const toggle = materials.length > 3 ? `<button type="button" class="exam-material-toggle ${isExpanded ? 'expanded' : ''}" data-action="toggle-exam-materials" data-id="${escapeHtml(exam.id)}">${isExpanded ? 'Mostrar menos' : `Ver todas (${materials.length})`}</button>` : '';
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
    renderSimulations();
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
    fill(els.examSubjectFilter, subjects, 'Todas as disciplinas');
  }

  function renderDashboard() {
    renderReadingQueue();
    renderUpcomingExamQueue();
  }

  function renderReadingQueue() {
    const today = todayDateValue();
    const queue = [...state.materials].filter((m) => {
      if (m.read) return false;
      const exams = state.exams.filter(exam => exam.materialIds.includes(m.id));
      return !exams.length || exams.some(exam => !isExamPerformed(exam) && (!exam.date || exam.date >= today));
    }).sort(classSort).slice(0, 5);
    const container = $('#readingQueue');
    if (!queue.length) {
      container.innerHTML = state.materials.length ? '<div class="empty-state"><strong>Nenhuma leitura pendente para as próximas provas.</strong>As apostilas de provas passadas continuam na biblioteca.</div>' : '<div class="empty-state"><strong>Nenhuma apostila cadastrada.</strong>Adicione sua primeira aula para começar.</div>';
      return;
    }
    container.innerHTML = queue.map((m, index) => `<div class="queue-item"><div class="queue-number">${m.classOrder !== '' ? escapeHtml(m.classOrder) : index + 1}</div><div><strong>${escapeHtml(m.title)}</strong><small>${escapeHtml(m.subject)} · ${formatDate(m.classDate)}</small></div><button class="queue-action" data-action="toggle-read" data-id="${escapeHtml(m.id)}">Marcar lida</button></div>`).join('');
  }

  function renderUpcomingExamQueue() {
    const today = todayDateValue();
    const exams = [...state.exams].filter((exam) => !isExamPerformed(exam) && exam.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
    const container = $('#upcomingExamQueue');
    if (!exams.length) {
      container.innerHTML = '<div class="empty-state"><strong>Nenhuma prova próxima.</strong>Cadastre as datas na seção Provas.</div>';
      return;
    }
    container.innerHTML = exams.map((exam) => `<div class="queue-item exam-queue-item"><div class="queue-number exam-queue-number">${escapeHtml(exam.type.replace('Prova', 'PF').slice(0, 4))}</div><div><strong>${escapeHtml(exam.subject)} · ${escapeHtml(exam.type)}</strong><small>${formatDate(exam.date)} · ${plural(exam.materialIds.length, 'apostila', 'apostilas')}</small></div><button class="queue-action" data-action="edit-exam" data-id="${escapeHtml(exam.id)}">Abrir</button></div>`).join('');
  }

  function getFilteredMaterials() {
    const query = els.searchInput.value.trim().toLocaleLowerCase('pt-BR');
    const subject = els.subjectFilter.value;
    const status = els.statusFilter.value;
    const ankiFilter = els.ankiFilter?.value || 'all';
    const examFilter = els.materialExamFilter?.value || 'active';
    const sort = els.sortSelect.value;
    const filtered = state.materials.filter((m) => {
      const matchesQuery = !query || `${m.title} ${m.subject} ${m.notes} ${m.sketchyTags}`.toLocaleLowerCase('pt-BR').includes(query);
      const matchesSubject = subject === 'all' || m.subject === subject;
      const matchesStatus = status === 'all' || (status === 'read' ? m.read : !m.read);
      const hasAnkiNotes = Boolean(String(m.sketchyTags || '').trim());
      const matchesAnki = ankiFilter === 'all'
        || (ankiFilter === 'with' && hasAnkiNotes)
        || (ankiFilter === 'without' && !hasAnkiNotes);
      const examState = getMaterialExamState(m.id);
      const matchesExam = examFilter === 'all'
        || (examFilter === 'active' && !examState.completedOnly)
        || (examFilter === 'pending-exam' && examState.hasPendingExam)
        || (examFilter === 'completed-exam' && examState.completedOnly)
        || (examFilter === 'no-exam' && examState.linkedExams.length === 0);
      return matchesQuery && matchesSubject && matchesStatus && matchesAnki && matchesExam;
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
        <div class="material-info"><div class="material-title-row"><h3>${escapeHtml(m.title)}</h3><span class="status-badge ${m.read ? 'read' : 'pending'}">${m.read ? 'LIDA' : 'PENDENTE'}</span>${m.made ? '<span class="status-badge made">PRODUZIDA</span>' : ''}</div><p class="material-meta">${escapeHtml(m.subject)} · Aula: ${formatDate(m.classDate)}</p>${m.sketchyTags ? `<div class="anki-notes-block"><div class="anki-notes-header"><span>AnKing Notes · ${getAnkiNoteCount(m.sketchyTags)} ${getAnkiNoteCount(m.sketchyTags) === 1 ? 'nota' : 'notas'}</span><button class="copy-query-button" type="button" data-action="copy-sketchy" data-id="${escapeHtml(m.id)}">Copiar query</button></div></div>` : ''}</div>
        <div class="question-summary" aria-label="Resumo de questões"><div class="question-summary-total"><span>QUESTÕES</span><b>${m.questions}</b></div><div class="question-summary-correct good"><span>ACERTOS</span><b>${m.correct}</b></div><div class="question-summary-wrong bad"><span>ERROS</span><b>${m.wrong}</b></div></div>
        <div class="material-actions"><button class="action-button question-add-action" data-action="add-questions" data-id="${escapeHtml(m.id)}" title="Registrar questões" aria-label="Registrar questões">${icon('addQuestions')}</button><button class="action-button made-action ${m.made ? 'active' : ''}" data-action="toggle-made" data-id="${escapeHtml(m.id)}" title="${m.made ? 'Marcar como não produzida' : 'Marcar como produzida'}" aria-label="${m.made ? 'Marcar como não produzida' : 'Marcar como produzida'}">${icon(m.made ? 'madeOn' : 'madeOff')}</button><button class="action-button read-action ${m.read ? 'active' : ''}" data-action="toggle-read" data-id="${escapeHtml(m.id)}" title="${m.read ? 'Marcar como não lida' : 'Marcar como lida'}" aria-label="${m.read ? 'Marcar como não lida' : 'Marcar como lida'}">${icon(m.read ? 'readOn' : 'readOff')}</button>${actionMenu}</div>
      </article>`;
    }).join('');
  }

  function getFilteredExams() {
    const subject = els.examSubjectFilter.value || 'all';
    const status = els.examStatusFilter.value || 'all';
    const today = todayDateValue();
    return [...state.exams].filter((exam) => {
      if (subject !== 'all' && exam.subject !== subject) return false;
      if (status === 'upcoming' && (isExamPerformed(exam) || exam.date < today)) return false;
      if (status === 'completed' && !hasExamResult(exam)) return false;
      if (status === 'pending-result' && hasExamResult(exam)) return false;
      return true;
    }).sort(examChronologicalSort);
  }

  function examTimingLabel(exam) {
    const today = todayDateValue();
    if (isExamPerformed(exam)) return 'REALIZADA';
    if (exam.date === today) return 'HOJE';
    const diff = Math.round((new Date(`${exam.date}T12:00:00`) - new Date(`${today}T12:00:00`)) / 86400000);
    if (diff > 0) return diff === 1 ? 'AMANHÃ' : `EM ${diff} DIAS`;
    return 'DATA PASSADA';
  }

  function renderExams() {
    const filtered = getFilteredExams();
    const today = todayDateValue();
    const upcoming = filtered.filter((exam) => !isExamPerformed(exam) && exam.date >= today);
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
        ], 'Mais ações da prova')}<button type="button" class="exam-performed-toggle ${isExamPerformed(exam) ? 'is-performed' : ''}" data-action="toggle-exam-performed" data-id="${escapeHtml(exam.id)}" aria-pressed="${isExamPerformed(exam)}" aria-label="${isExamPerformed(exam) ? 'Prova realizada' : 'Marcar prova como realizada'}" title="${result ? 'Prova com resultado registrado' : (exam.performed ? 'Desmarcar prova realizada' : 'Marcar prova como realizada')}" ${result ? 'disabled' : ''}>✓</button></div>
      </article>`;
    }).join('');
  }

  function simulationAreaOptions(selected = '') {
    const known = new Set(GRAND_AREAS);
    const values = selected && !known.has(selected) ? [...GRAND_AREAS, selected] : GRAND_AREAS;
    return `<option value="">Selecione...</option>${values.map((area) => `<option value="${escapeHtml(area)}"${area === selected ? ' selected' : ''}>${escapeHtml(areaLabel(area))}</option>`).join('')}`;
  }

  function simulationResultMeta(question) {
    if (isAnnulledSimulationAnswer(question.correctAnswer)) return { key: 'annulled', label: 'Anulada' };
    const result = simulationQuestionResult(question);
    if (result === true) return { key: 'correct', label: 'Acerto' };
    if (result === false) return { key: 'wrong', label: 'Erro' };
    return { key: 'pending', label: 'Pendente' };
  }

  function renderSimulationAreaStats() {
    if (!els.simulationAreaStats) return;
    const rows = simulationAreaStats(state.simulations);
    if (!rows.length) { els.simulationAreaStats.innerHTML = '<div class="empty-state compact"><strong>Ainda não há questões corrigidas por área.</strong>Preencha a grande área, sua resposta e o gabarito oficial em um simulado.</div>'; return; }
    els.simulationAreaStats.innerHTML = rows.map((row) => `<div class="simulation-area-row"><div class="simulation-area-copy"><strong>${escapeHtml(areaLabel(row.area))}</strong><span>${row.correct}/${row.answered} acertos · ${row.wrong} erros</span></div><div class="simulation-area-track" aria-label="${row.accuracy}% de acerto"><i style="width:${row.accuracy}%"></i></div><b>${row.accuracy}%</b></div>`).join('');
  }

  function renderSimulationList() {
    if (!els.simulationsList) return;
    if (!state.simulations.length) { els.simulationsList.innerHTML = '<div class="empty-state compact"><strong>Nenhum simulado registrado.</strong>Use “Novo simulado” para começar o histórico semanal.</div>'; return; }
    const simulations = [...state.simulations].sort((a, b) => b.date.localeCompare(a.date));
    els.simulationsList.innerHTML = simulations.map((simulation) => {
      const stats = simulationStats([simulation]);
      const accuracyLabel = stats.accuracy == null ? '—' : `${stats.accuracy}%`;
      return `<article class="simulation-card"><div class="simulation-card-heading"><div><h4>${escapeHtml(simulation.name)}</h4><p>${formatDate(simulation.date)}</p></div>${buildActionMenu([actionMenuItem({ action: 'edit-simulation', id: simulation.id, label: 'Editar simulado', iconName: 'edit' }),actionMenuItem({ action: 'delete-simulation', id: simulation.id, label: 'Excluir simulado', iconName: 'trash', variant: 'danger' })], 'Mais ações do simulado')}</div><div class="simulation-card-metrics"><div><span>ACERTO</span><b>${accuracyLabel}</b></div><div><span>CORRIGIDAS</span><b>${stats.answered}/${stats.total}</b></div><div class="bad"><span>ERROS</span><b>${stats.wrong}</b></div><div><span>QUESTÕES</span><b>${stats.total}</b></div></div></article>`;
    }).join('');
  }

  function renderSimulationKpis() {
    if (!els.simulationCountKpi) return;
    const stats = simulationStats(state.simulations);
    const areas = simulationAreaStats(state.simulations).filter((row) => row.answered > 0);
    const weak = [...areas].sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered)[0];
    const strong = [...areas].sort((a, b) => b.accuracy - a.accuracy || b.answered - a.answered)[0];
    els.simulationCountKpi.textContent = state.simulations.length;
    els.simulationCountNote.textContent = state.simulations.length ? plural(stats.total, 'questão registrada', 'questões registradas') : 'Nenhum registrado';
    els.simulationAccuracyKpi.textContent = stats.accuracy == null ? '—' : `${stats.accuracy}%`;
    els.simulationAccuracyNote.textContent = plural(stats.answered, 'questão corrigida', 'questões corrigidas');
    els.simulationWeakAreaKpi.textContent = weak ? areaLabel(weak.area) : '—';
    els.simulationWeakAreaNote.textContent = weak ? `${weak.accuracy}% · ${weak.answered} questões` : 'Sem dados por área';
    els.simulationStrongAreaKpi.textContent = strong ? areaLabel(strong.area) : '—';
    els.simulationStrongAreaNote.textContent = strong ? `${strong.accuracy}% · ${strong.answered} questões` : 'Sem dados por área';
  }

  function renderSimulations() { if (!els.simulationsList) return; if (globalThis.PELEJA_RENDER_SIMULATION_SUMMARY?.()) return; renderSimulationKpis(); renderSimulationAreaStats(); renderSimulationList(); }

  let simulationLegacyFields = new Map();

  function readSimulationQuestionsFromDom() {
    return $$('#simulationQuestionRows .simulation-question-row').map((row, index) => normalizeSimulationQuestion({
      ...(simulationLegacyFields.get(row.dataset.questionId) || {}),
      id: row.dataset.questionId || makeId('sq'), number: Number(row.dataset.number) || index + 1, flagged: row.dataset.flagged === '1',
      area: row.querySelector('[data-field="area"]')?.value || '', userAnswer: row.querySelector('[data-field="userAnswer"]')?.value || '',
      correctAnswer: row.querySelector('[data-field="correctAnswer"]')?.value || '',
    }, index));
  }

  function renderSimulationQuestionRows(questions = []) {
    if (!els.simulationQuestionRows) return;
    simulationLegacyFields = new Map(questions.map(q => [q.id, { flashFront: q.flashFront || '', flashBack: q.flashBack || '' }]));
    els.simulationQuestionRows.innerHTML = questions.map((question, index) => {
      const normalized = normalizeSimulationQuestion(question, index), result = simulationResultMeta(normalized), isWrong = result.key === 'wrong';
      return `<div class="simulation-question-row ${isWrong ? 'is-wrong' : ''}" data-question-id="${escapeHtml(normalized.id)}" data-number="${normalized.number}" data-flagged="${normalized.flagged ? '1' : '0'}"><div class="simulation-question-core"><b class="simulation-question-number">${normalized.number}${normalized.flagged ? '*' : ''}</b><select data-field="area" aria-label="Grande área da questão ${normalized.number}">${simulationAreaOptions(normalized.area)}</select><input data-field="userAnswer" value="${escapeHtml(normalized.userAnswer)}" autocomplete="off" aria-label="Minha resposta da questão ${normalized.number}" placeholder="Minha resposta" /><input data-field="correctAnswer" value="${escapeHtml(normalized.correctAnswer)}" autocomplete="off" aria-label="Gabarito da questão ${normalized.number}" placeholder="Gabarito" /><span class="simulation-result-badge ${result.key}">${result.label}</span></div></div>`;
    }).join('');
    syncSimulationDraftUI();
  }

  function syncSimulationDraftUI() {
    const rows = $$('#simulationQuestionRows .simulation-question-row'); let correct = 0, wrong = 0;
    rows.forEach((row, index) => {
      const question = normalizeSimulationQuestion({ id: row.dataset.questionId, number: Number(row.dataset.number) || index + 1, area: row.querySelector('[data-field="area"]')?.value || '', userAnswer: row.querySelector('[data-field="userAnswer"]')?.value || '', correctAnswer: row.querySelector('[data-field="correctAnswer"]')?.value || '' }, index);
      const meta = simulationResultMeta(question), badge = row.querySelector('.simulation-result-badge');
      badge.className = `simulation-result-badge ${meta.key}`; badge.textContent = meta.label;
      const isWrong = meta.key === 'wrong'; row.classList.toggle('is-wrong', isWrong);
      if (meta.key === 'correct') correct += 1; if (meta.key === 'wrong') wrong += 1;
    });
    const answered = correct + wrong;
    els.simulationDraftTotal.textContent = rows.length; els.simulationDraftAnswered.textContent = answered; els.simulationDraftCorrect.textContent = correct; els.simulationDraftWrong.textContent = wrong; els.simulationDraftAccuracy.textContent = answered ? `${Math.round((correct / answered) * 100)}%` : '—';
  }

  function generateSimulationQuestions() {
    const count = Math.max(0, Number(els.simulationQuestionCountInput.value) || 0);
    if (!Number.isInteger(count) || count < 1 || count > 1000) { els.simulationValidationMessage.textContent = 'Informe de 1 a 1000 questões, usando um número inteiro.'; return; }
    const current = readSimulationQuestionsFromDom();
    if (count < current.length && !window.confirm(`Reduzir para ${count} questões removerá ${current.length - count} linha(s) do fim. Continuar?`)) return;
    const next = current.slice(0, count); while (next.length < count) next.push(normalizeSimulationQuestion({}, next.length));
    els.simulationValidationMessage.textContent = ''; renderSimulationQuestionRows(next);
  }

  function applySimulationPaste() {
    const feedback = $('#simulationPasteStatus');
    const parse = (value, official) => {
      if (!value.trim()) return null;
      const compact = value.toUpperCase().replace(/[\s,;]+/g, '').replace(/—/g, '-');
      if (!(official ? /^[A-EX-]+$/ : /^[A-E-]+$/).test(compact)) throw new Error('Use apenas A–E, — para branco e X somente para anulada no gabarito. Não inclua números.');
      return [...compact].map(letter => letter === '-' ? '' : letter === 'X' ? 'ANULADA' : letter);
    };
    try {
      const answers = parse($('#simulationPasteAnswers').value, false);
      const key = parse($('#simulationPasteKey').value, true);
      if (!answers && !key) throw new Error('Cole pelo menos uma lista de respostas.');
      const current = readSimulationQuestionsFromDom();
      const count = Number(els.simulationQuestionCountInput.value || current.length || answers?.length || key?.length);
      if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error('Informe de 1 a 1000 questões.');
      if ((answers && answers.length !== count) || (key && key.length !== count)) throw new Error(`Cada lista preenchida precisa ter ${count} entradas. Nenhuma questão foi alterada.`);
      if (current.length && current.length !== count) throw new Error('Ajuste o número de questões pelo botão Gerar / ajustar questões antes de aplicar as listas.');
      const next = Array.from({ length: count }, (_, index) => normalizeSimulationQuestion({
        ...(current[index] || {}),
        ...(answers ? { userAnswer: answers[index] } : {}),
        ...(key ? { correctAnswer: key[index] } : {}),
      }, index));
      els.simulationQuestionCountInput.value = count;
      renderSimulationQuestionRows(next);
      feedback.textContent = `${count} questões preenchidas. Confira as respostas e salve o simulado.`;
    } catch (error) { feedback.textContent = error.message; }
  }

  function openSimulationModal(simulation = null) {
    if (!requireAdmin(simulation ? 'editar eventos de residência' : 'criar eventos de residência')) return;
    const current = simulation ? normalizeSimulation(simulation) : null;
    els.simulationId.value = current?.id || ''; els.simulationModalTitle.textContent = current ? 'Editar simulado' : 'Novo simulado';
    els.simulationNameInput.value = current?.name || ''; els.simulationDateInput.value = current?.date || todayDateValue(); els.simulationQuestionCountInput.value = current?.questions.length || '';
    els.simulationValidationMessage.textContent = ''; renderSimulationQuestionRows(current?.questions || []);
    $('#simulationPasteAnswers').value = ''; $('#simulationPasteKey').value = ''; $('#simulationPasteStatus').textContent = '';
    els.simulationModal.classList.add('open'); els.simulationModal.setAttribute('aria-hidden', 'false'); setTimeout(() => { if (els.simulationModal.classList.contains('open') && !els.simulationModal.inert) els.simulationNameInput.focus(); }, 50);
  }

  function closeSimulationModal() { els.simulationModal.classList.remove('open'); els.simulationModal.setAttribute('aria-hidden', 'true'); els.simulationValidationMessage.textContent = ''; }

  function handleSimulationSubmit(event) {
    event.preventDefault();
    if (!requireAdmin('salvar eventos e gabaritos oficiais de residência')) return;
    const name = els.simulationNameInput.value.trim(), date = els.simulationDateInput.value, questions = readSimulationQuestionsFromDom();
    if (!name || !date) { els.simulationValidationMessage.textContent = 'Informe nome e data do simulado.'; return; }
    if (!questions.length) { els.simulationValidationMessage.textContent = 'Gere pelo menos uma questão antes de salvar.'; return; }
    const existing = state.simulations.find((simulation) => simulation.id === els.simulationId.value), now = new Date().toISOString();
    const simulation = normalizeSimulation({ id: existing?.id || makeId('sim'), name, date, questions, createdAt: existing?.createdAt || now, updatedAt: now });
    state.simulations = existing ? state.simulations.map((item) => item.id === existing.id ? simulation : item) : [...state.simulations, simulation];
    personalStore.markCatalogDirty();
    saveSimulations(); renderAll(); closeSimulationModal(); showToast(existing ? 'Simulado atualizado.' : 'Simulado adicionado.');
  }

  function handlePrimaryActionClick() {
    if (!canManageStructure()) {
      showToast('A criação de apostilas, provas e eventos de residência é exclusiva do administrador.');
      return;
    }
    if (state.currentView === 'exams') { openExamForm(); return; }
    if (state.currentView === 'simulations') { openSimulationModal(); return; }
    openMaterialModal();
  }

  function updatePrimaryAction() {
    const rankingView = state.currentView === 'ranking';
    const structuralView = ['dashboard', 'materials', 'exams', 'simulations'].includes(state.currentView);
    els.primaryActionBtn.hidden = rankingView || (structuralView && !canManageStructure());
    if (els.primaryActionBtn.hidden) return;
    if (state.currentView === 'exams') els.primaryActionBtn.textContent = '+ Nova prova';
    else if (state.currentView === 'simulations') els.primaryActionBtn.textContent = '+ Novo evento';
    else els.primaryActionBtn.textContent = '+ Nova apostila';
  }

  function setView(view) {
    const titles = { dashboard: 'Painel', materials: 'Biblioteca de apostilas', exams: 'Provas', simulations: 'Simulados', ranking: 'Ranking' };
    state.currentView = view;
    els.navItems.forEach((item) => item.classList.toggle('active', item.dataset.view === view));
    els.views.forEach((section) => section.classList.toggle('active', section.id === `${view}View`));
    els.pageTitle.textContent = titles[view] || titles.dashboard;
    els.sidebar.classList.remove('open');
    updatePrimaryAction();
    if (view === 'materials') renderMaterials();
    if (view === 'exams') renderExams();
    if (view === 'simulations') renderSimulations();
    window.dispatchEvent(new CustomEvent('peleja:view-changed', { detail: { view } }));
  }

  function updateMaterialQuestionSummary(material = null) {
    const totals = material ? getQuestionTotals(material.questionEntries || []) : { questions: 0, correct: 0, wrong: 0 };
    els.modalQuestionsTotal.textContent = totals.questions; els.modalCorrectTotal.textContent = totals.correct; els.modalWrongTotal.textContent = totals.wrong;
    els.openQuestionManagerFromMaterial.disabled = !material; els.openQuestionManagerFromMaterial.dataset.id = material?.id || '';
    els.questionHistoryHint.textContent = material ? 'Use o botão abaixo para gerenciar o histórico de questões desta apostila.' : 'Salve a apostila primeiro; depois use o botão de questões no cartão para registrar suas sessões.';
  }

  function renderMaterialExamOptions(initial = false) {
    const subject = els.subjectInput.value.trim();
    const material = state.materials.find(m => m.id === els.materialId.value);
    const container = $('#materialExamOptions');
    const selected = new Set(initial
      ? state.exams.filter(e => material && e.materialIds.includes(material.id)).map(e => e.id)
      : [...container.querySelectorAll('input:checked')].map(input => input.value));
    const exams = state.exams.filter(e => e.subject === subject).sort((a,b) => a.date.localeCompare(b.date));
    let suggested = null;
    if (!material && !exams.some(e => selected.has(e.id))) {
      const upcoming = exams.filter(e => e.date >= todayDateValue());
      if (upcoming.length && upcoming.filter(e => e.date === upcoming[0].date).length === 1) {
        suggested = upcoming[0].id; selected.add(suggested);
      }
    }
    $('#materialExamHint').textContent = !subject ? 'Escolha a disciplina para ver as provas.'
      : !exams.length ? 'Ainda não há prova cadastrada para esta disciplina. Você pode vincular depois.'
      : suggested ? 'A próxima prova da disciplina já está marcada. Altere se necessário.'
      : 'Marque as provas que incluem esta apostila. Você pode escolher mais de uma.';
    container.innerHTML = exams.map(e => `<label class="exam-material-option"><input type="checkbox" value="${escapeHtml(e.id)}" ${selected.has(e.id) ? 'checked' : ''}/><span><strong>${escapeHtml(e.type)}</strong><small>${formatDate(e.date)}${e.date && e.date < todayDateValue() ? ' · já realizada' : ''}</small></span></label>`).join('');
  }

  function openMaterialModal(material = null) {
    if (!requireAdmin(material ? 'editar apostilas' : 'criar apostilas')) return;
    els.materialForm.reset(); els.validationMessage.textContent = '';
    $('#materialSubjects').innerHTML = [...new Set([...state.materials, ...state.exams].map(item => item.subject).filter(Boolean))].sort().map(subject => `<option value="${escapeHtml(subject)}"></option>`).join('');
    updateMaterialQuestionSummary(material);
    if (material) {
      els.modalTitle.textContent = 'Editar apostila'; els.materialId.value = material.id; els.subjectInput.value = material.subject; els.titleInput.value = material.title; els.classDateInput.value = material.classDate; els.classOrderInput.value = material.classOrder; els.sketchyTagsInput.value = material.sketchyTags; els.madeInput.checked = material.made; els.readInput.checked = material.read; els.notesInput.value = material.notes;
    } else {
      els.modalTitle.textContent = 'Adicionar nova apostila'; els.materialId.value = ''; els.madeInput.checked = false; els.classDateInput.value = todayDateValue();
    }
    renderMaterialExamOptions(true);
    els.materialModal.classList.add('open'); els.materialModal.setAttribute('aria-hidden', 'false'); setTimeout(() => { if (els.materialModal.classList.contains('open') && !els.materialModal.inert) els.subjectInput.focus(); }, 30);
  }

  function closeMaterialModal() { els.materialModal.classList.remove('open'); els.materialModal.setAttribute('aria-hidden', 'true'); }

  function handleMaterialSubmit(event) {
    event.preventDefault();
    if (!requireAdmin('salvar apostilas')) return;
    els.validationMessage.textContent = '';
    const subject = els.subjectInput.value.trim(); const title = els.titleInput.value.trim();
    if (!subject || !title) { els.validationMessage.textContent = 'Preencha a disciplina e o título da apostila.'; return; }
    const existingId = els.materialId.value; const existing = state.materials.find((m) => m.id === existingId); const id = existingId || makeId('m'); const now = new Date().toISOString();
    const selectedExams = new Set([...$('#materialExamOptions').querySelectorAll('input:checked')].map(input => input.value));
    if ([...selectedExams].some(examId => !state.exams.some(e => e.id === examId && e.subject === subject))) {
      els.validationMessage.textContent = 'A lista de provas mudou. Confira a disciplina e selecione novamente.'; return;
    }
    const material = normalizeMaterial({ ...(existing || {}), id, subject, title, classDate: els.classDateInput.value, classOrder: els.classOrderInput.value, sketchyTags: els.sketchyTagsInput.value, made: els.madeInput.checked, questionEntries: existing?.questionEntries || [], read: els.readInput.checked, notes: els.notesInput.value.trim(), createdAt: existing?.createdAt || now, updatedAt: now });
    if (existing) state.materials = state.materials.map((m) => m.id === id ? material : m); else state.materials.push(material);

    let removedLinks = 0;
    if (existing && existing.subject !== subject) {
      state.exams = state.exams.map((exam) => {
        if (exam.subject === subject || !exam.materialIds.includes(id)) return exam;
        removedLinks += 1;
        return normalizeExam({ ...exam, materialIds: exam.materialIds.filter((materialId) => materialId !== id), updatedAt: now });
      });
    }
    state.exams = state.exams.map(exam => {
      if (exam.subject !== subject) return exam;
      const linked = exam.materialIds.includes(id), wanted = selectedExams.has(exam.id);
      if (linked === wanted) return exam;
      return normalizeExam({ ...exam, materialIds: wanted ? [...exam.materialIds, id] : exam.materialIds.filter(value => value !== id), updatedAt: now });
    });
    personalStore.markCatalogDirty();
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

  function openQuestionModal(material) { if (!material) return; if (els.materialModal.classList.contains('open')) closeMaterialModal(); els.questionMaterialId.value = material.id; resetQuestionEntryForm(); renderQuestionModal(material.id); els.questionModal.classList.add('open'); els.questionModal.setAttribute('aria-hidden', 'false'); setTimeout(() => { if (els.questionModal.classList.contains('open') && !els.questionModal.inert) els.questionTotalInput.focus(); }, 30); }
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
    const admin = canManageStructure();
    if (!admin && !exam) { showToast('Apenas o administrador pode criar provas da faculdade.'); return; }
    if (!state.materials.length && !exam) { showToast('Cadastre ao menos uma apostila antes de criar uma prova.'); setView('materials'); return; }
    els.examForm.reset(); els.examValidationMessage.textContent = ''; els.examId.value = exam?.id || ''; els.examFormTitle.textContent = exam ? (admin ? 'Editar prova' : 'Registrar meu resultado') : 'Adicionar prova';
    populateExamSubjectInput(exam?.subject || '');
    els.examTypeInput.value = exam?.type || '';
    if (exam?.type && !EXAM_TYPES.includes(exam.type)) { const option = document.createElement('option'); option.value = exam.type; option.textContent = exam.type; els.examTypeInput.appendChild(option); els.examTypeInput.value = exam.type; }
    els.examDateInput.value = exam?.date || todayDateValue();
    els.examTotalInput.value = hasExamResult(exam || {}) ? exam.total : ''; els.examCorrectInput.value = hasExamResult(exam || {}) ? exam.correct : ''; els.examWrongInput.value = hasExamResult(exam || {}) ? exam.wrong : '';
    renderExamMaterialOptions(exam?.subject || '', exam?.materialIds || []);
    [els.examSubjectInput, els.examTypeInput, els.examDateInput].forEach((control) => { if (control) control.disabled = !admin; });
    els.examMaterialOptions.querySelectorAll('input[type="checkbox"]').forEach((control) => { control.disabled = !admin; });
    els.examFormModal.classList.add('open'); els.examFormModal.setAttribute('aria-hidden', 'false'); setTimeout(() => { if (els.examFormModal.classList.contains('open') && !els.examFormModal.inert) (admin ? (exam ? els.examTypeInput : els.examSubjectInput) : els.examTotalInput).focus(); }, 30);
  }

  function closeExamForm() { els.examFormModal.classList.remove('open'); els.examFormModal.setAttribute('aria-hidden', 'true'); els.examValidationMessage.textContent = ''; }

  function handleExamSubmit(event) {
    event.preventDefault(); els.examValidationMessage.textContent = '';
    const admin = canManageStructure();
    const existing = state.exams.find((item) => item.id === els.examId.value);
    if (!admin && !existing) { showToast('Apenas o administrador pode criar provas da faculdade.'); return; }
    const subject = admin ? els.examSubjectInput.value : existing.subject;
    const type = admin ? els.examTypeInput.value : existing.type;
    const date = admin ? els.examDateInput.value : existing.date;
    const materialIds = admin ? getExamFormSelectedIds() : [...existing.materialIds];
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

    const now = new Date().toISOString();
    const exam = normalizeExam({ ...(existing || {}), id: existing?.id || makeId('p'), subject, type, date, materialIds, total, correct, wrong, createdAt: existing?.createdAt || now, updatedAt: now });
    if (existing) state.exams = state.exams.map((item) => item.id === exam.id ? exam : item); else state.exams.push(exam);
    if (admin) personalStore.markCatalogDirty();
    saveExams(); renderAll(); closeExamForm(); showToast(existing ? 'Prova atualizada.' : 'Prova adicionada.');
  }

  async function handleAction(action, id, entryId = null) {
    if (action === 'toggle-exam-performed') {
      const exam = state.exams.find(item => item.id === id);
      if (!exam || hasExamResult(exam)) return;
      exam.performed = !exam.performed; exam.updatedAt = new Date().toISOString();
      saveExams(); renderAll(); showToast(exam.performed ? 'Prova marcada como realizada.' : 'Marcação de realizada removida.'); return;
    }
    if (action === 'edit-simulation') { if (!requireAdmin('editar eventos de residência')) return; const simulation = state.simulations.find((item) => item.id === id); if (simulation) openSimulationModal(simulation); return; }
    if (action === 'delete-simulation') { if (!requireAdmin('excluir eventos de residência')) return; const simulation = state.simulations.find((item) => item.id === id); if (!simulation) return; if (!window.confirm(`Excluir “${simulation.name}”?`)) return; state.simulations = state.simulations.filter((item) => item.id !== id); personalStore.markCatalogDirty(); saveSimulations(); renderAll(); showToast('Simulado excluído.'); return; }
    if (action === 'edit-exam') { const exam = state.exams.find((item) => item.id === id); if (exam) openExamForm(exam); return; }
    if (action === 'delete-exam') { if (!requireAdmin('excluir provas da faculdade')) return; const exam = state.exams.find((item) => item.id === id); if (!exam) return; if (!window.confirm(`Excluir ${exam.type} de ${exam.subject}?`)) return; personalStore.markCatalogDirty(); state.exams = state.exams.filter((item) => item.id !== id); state.expandedExamIds.delete(id); saveExams(); renderAll(); showToast('Prova excluída.'); return; }
    if (action === 'toggle-exam-materials') { if (state.expandedExamIds.has(id)) state.expandedExamIds.delete(id); else state.expandedExamIds.add(id); renderExams(); return; }
    if (action === 'open-topic') {
      const target = state.materials.find((m) => m.id === id); if (!target) return;
      els.searchInput.value = target.title; renderSubjectFilters(); els.subjectFilter.value = target.subject; els.statusFilter.value = 'all'; if (els.ankiFilter) els.ankiFilter.value = 'all'; if (els.materialExamFilter) els.materialExamFilter.value = 'all'; setView('materials'); renderMaterials(); return;
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
    if (action === 'edit') { if (!requireAdmin('editar apostilas')) return; openMaterialModal(material); return; }
    if (action === 'delete') {
      if (!requireAdmin('excluir apostilas')) return;
      if (!window.confirm(`Excluir “${material.title}”?`)) return;
      personalStore.markCatalogDirty();
      state.materials = state.materials.filter((m) => m.id !== id); state.exams = state.exams.map((exam) => exam.materialIds.includes(id) ? normalizeExam({ ...exam, materialIds: exam.materialIds.filter((materialId) => materialId !== id), updatedAt: new Date().toISOString() }) : exam); saveAll(); renderAll(); showToast('Apostila excluída. Vínculos com provas foram atualizados.'); return;
    }
    if (action === 'copy-sketchy') {
      const text = String(material.sketchyTags || '').trim(); if (!text) return;
      try { if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text); else { const textarea = document.createElement('textarea'); textarea.value = text; textarea.style.position = 'fixed'; textarea.style.opacity = '0'; document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); textarea.remove(); } showToast('Query do Anki copiada.'); } catch (error) { console.error(error); showToast('Não foi possível copiar a query.'); }
    }
  }

  async function exportData() {
    if (!personalStore.writable) { showToast('Entre na sua conta para exportar.'); return; }
    const owner = personalStore.scope, generation = personalStore.generation;
    const payload = { app: 'Peleja', version: 14, owner: personalStore.scope, exportedAt: new Date().toISOString(), note: 'Backup pessoal com apostilas, histórico de questões, provas e simulados. Campos legados são preservados para recuperação.', materials: state.materials, exams: state.exams, simulations: state.simulations };
    try { payload.cloudAttempts = await globalThis.PELEJA_CLOUD_BACKUP?.exportAttempts() || undefined; }
    catch { payload.note += ' Exportação local: tentativas online não puderam ser incluídas.'; }
    if (personalStore.scope !== owner || personalStore.generation !== generation) { showToast('A conta mudou. Exporte novamente.'); return; }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `peleja-backup-${todayDateValue()}.json`; anchor.click(); URL.revokeObjectURL(url); showToast(payload.cloudAttempts || personalStore.localOnly ? 'Backup exportado.' : 'Backup local exportado; tentativas online não incluídas.');
  }

  async function importData(file) {
    const owner = personalStore.scope;
    const generation = personalStore.generation;
    try {
      if (!owner) throw new Error('Entre na sua conta para importar.');
      const text = await file.text(); const parsed = JSON.parse(text); const rawMaterials = Array.isArray(parsed) ? parsed : parsed.materials;
      if (personalStore.scope !== owner || personalStore.generation !== generation) throw new Error('A conta mudou. Importe novamente na conta correta.');
      if (!personalStore.canImport(Array.isArray(parsed) ? null : parsed.owner)) throw new Error('Este backup pertence a outra conta. Backups antigos são exclusivos de Vinícius.');
      if (!Array.isArray(rawMaterials)) throw new Error('Formato inválido');
      if (!window.confirm('Importar este backup substituirá os dados atuais. Continuar?')) return;
      if (parsed.cloudAttempts) {
        await globalThis.PELEJA_CLOUD_BACKUP.restore(parsed); showToast('Backup e resultados online restaurados.'); return;
      }
      const materials = rawMaterials.map(normalizeMaterial); let exams;
      if (!Array.isArray(parsed) && Array.isArray(parsed.exams)) exams = parsed.exams.map(normalizeExam); else exams = migrateLegacyExams(rawMaterials, materials);
      const simulations = !Array.isArray(parsed) && Array.isArray(parsed.simulations) ? parsed.simulations.map(normalizeSimulation) : [];
      if (canManageStructure()) personalStore.markCatalogDirty();
      state.materials = materials; state.exams = exams; state.simulations = simulations; saveAll(); renderAll(); showToast('Backup importado.');
    } catch (error) { console.error(error); showToast(error.message || 'Arquivo de backup inválido.'); }
    finally { els.importInput.value = ''; }
  }

  let toastTimer;
  function showToast(message) { clearTimeout(toastTimer); els.toast.textContent = message; els.toast.classList.add('show'); toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2800); }

  function initDate() {
    const text = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date()); els.todayLabel.textContent = text.charAt(0).toUpperCase() + text.slice(1);
  }

  function reloadAccountData() {
    const rawMaterials = parseStoredArray(MATERIALS_KEY);
    state.materials = rawMaterials.map(normalizeMaterial);
    state.exams = parseStoredArray(EXAMS_KEY).map(normalizeExam);
    state.simulations = parseStoredArray(SIMULATIONS_KEY).map(normalizeSimulation);
    if (personalStore.getItem(EXAMS_KEY) === null && !state.exams.length) {
      state.exams = migrateLegacyExams(rawMaterials, state.materials);
    }
    state.expandedExamIds.clear();
    if (personalStore.getItem(MATERIALS_KEY) === null) applyAcademicData(currentAcademicData);
    // Discard old drafts and rendered private details before the new identity is shown.
    $$('.modal-backdrop').filter((modal) => modal.id !== 'accountModal').forEach((modal) => {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      modal.querySelectorAll('input, textarea').forEach((input) => { input.value = ''; });
    });
    ['questionEntryList', 'examMaterialOptions', 'simulationQuestionRows'].forEach((id) => {
      document.getElementById(id)?.replaceChildren();
    });
    seedingAccount = true;
    saveAll();
    seedingAccount = false;
    renderAll();
    updatePrimaryAction();
  }

  function bindEvents() {
    window.addEventListener('peleja:storage-changed', reloadAccountData);
    els.navItems.forEach((item) => item.addEventListener('click', () => setView(item.dataset.view)));
    $$('[data-go-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.goView)));
    els.menuButton.addEventListener('click', () => els.sidebar.classList.toggle('open'));
    els.sidebarCollapseButton?.addEventListener('click', toggleSidebarCollapsed);
    window.addEventListener('resize', () => {
      if (window.innerWidth > 820) els.sidebar.classList.remove('open');
    });
    window.addEventListener('peleja:access-changed', () => {
      updatePrimaryAction();
      renderAll();
    });
    els.primaryActionBtn.addEventListener('click', handlePrimaryActionClick);
    els.closeModal.addEventListener('click', closeMaterialModal); els.cancelModal.addEventListener('click', closeMaterialModal); els.materialForm.addEventListener('submit', handleMaterialSubmit);
    els.subjectInput.addEventListener('input', () => renderMaterialExamOptions());
    els.openQuestionManagerFromMaterial.addEventListener('click', () => { const material = state.materials.find((item) => item.id === els.openQuestionManagerFromMaterial.dataset.id); if (material) openQuestionModal(material); });
    els.closeQuestionModal.addEventListener('click', closeQuestionModal); els.cancelQuestionEntryEdit.addEventListener('click', resetQuestionEntryForm); els.questionEntryForm.addEventListener('submit', handleQuestionEntrySubmit);
    els.closeExamFormModal.addEventListener('click', closeExamForm); els.cancelExamForm.addEventListener('click', closeExamForm); els.examForm.addEventListener('submit', handleExamSubmit);
    els.closeSimulationModal.addEventListener('click', closeSimulationModal); els.cancelSimulationModal.addEventListener('click', closeSimulationModal); els.simulationForm.addEventListener('submit', handleSimulationSubmit); els.generateSimulationQuestionsBtn.addEventListener('click', generateSimulationQuestions);
    $('#applySimulationPaste').addEventListener('click', applySimulationPaste);
    els.simulationQuestionRows.addEventListener('input', syncSimulationDraftUI); els.simulationQuestionRows.addEventListener('change', syncSimulationDraftUI);
    els.examSubjectInput.addEventListener('change', () => renderExamMaterialOptions(els.examSubjectInput.value, []));
    els.examMaterialOptions.addEventListener('change', (event) => { if (event.target.matches('input[type="checkbox"]')) updateExamSelectionCount(); });
    els.materialModal.addEventListener('click', (event) => { if (event.target === els.materialModal) closeMaterialModal(); });
    els.questionModal.addEventListener('click', (event) => { if (event.target === els.questionModal) closeQuestionModal(); });
    els.examFormModal.addEventListener('click', (event) => { if (event.target === els.examFormModal) closeExamForm(); });
    els.simulationModal.addEventListener('click', (event) => { if (event.target === els.simulationModal) closeSimulationModal(); });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if ($$('.action-menu.open').length) {
        closeActionMenus();
        return;
      }
      if (els.simulationModal.classList.contains('open')) closeSimulationModal();
      else if (els.examFormModal.classList.contains('open')) closeExamForm();
      else if (els.questionModal.classList.contains('open')) closeQuestionModal();
      else if (els.materialModal.classList.contains('open')) closeMaterialModal();
    });
    els.searchInput.addEventListener('input', renderMaterials); [els.subjectFilter, els.statusFilter, els.ankiFilter, els.materialExamFilter, els.sortSelect].forEach((control) => control?.addEventListener('change', renderMaterials));
    [els.examSubjectFilter, els.examStatusFilter].forEach((control) => control.addEventListener('change', renderExams));
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

  function applySharedCatalog(catalog) {
    const oldMaterials = new Map(state.materials.map(item => [item.id, item]));
    const oldExams = new Map(state.exams.map(item => [item.id, item]));
    const oldSimulations = new Map(state.simulations.map(item => [item.id, item]));
    state.materials = (catalog.materials || []).map(item => {
      const old = oldMaterials.get(item.id) || {};
      return normalizeMaterial({ ...item, made: old.made, read: old.read, questionEntries: old.questionEntries || [],
        notes: old.notes, sketchyTags: old.sketchyTags, source: old.source || item.source,
        dateConfidence: old.dateConfidence || item.dateConfidence, createdAt: old.createdAt, updatedAt: old.updatedAt });
    });
    state.exams = (catalog.exams || []).map(item => {
      const old = oldExams.get(item.id) || {};
      return normalizeExam({ ...item, performed: old.performed, total: old.total, correct: old.correct, wrong: old.wrong, source: old.source || item.source, createdAt: old.createdAt, updatedAt: old.updatedAt });
    });
    state.simulations = (catalog.simulations || []).map(item => {
      const old = oldSimulations.get(item.id);
      return normalizeSimulation({ ...item, createdAt: old?.createdAt || item.createdAt,
        updatedAt: old?.updatedAt || item.updatedAt, questions: (item.questions || []).map(q => {
        const personal = old?.questions.find(x => x.number === q.number) || {};
        return { ...q, userAnswer: personal.userAnswer, flashFront: personal.flashFront, flashBack: personal.flashBack };
      }) });
    });
    seedingAccount = true; saveAll(); seedingAccount = false; renderAll();
  }
  globalThis.PELEJA_APP = Object.freeze({ applySharedCatalog });

  function registerServiceWorker() { if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Service Worker:', error)); }

  async function refreshAcademicDataFromJson() {
    if (!location.protocol.startsWith('http')) return;
    try {
      const response = await fetch('./academic-data.json', { cache: 'no-store' });
      if (!response.ok) return;
      const academicData = await response.json();
      currentAcademicData = academicData;
      if (personalStore.getItem(MATERIALS_KEY) === null && applyAcademicData(academicData)) {
        saveAll();
        renderAll();
      }
    } catch (error) {
      console.warn('academic-data.json:', error);
    }
  }

  saveAll(); seedingAccount = false; initDate(); bindEvents(); applySidebarCollapsedState(); renderAll(); registerServiceWorker(); refreshAcademicDataFromJson();
})();
