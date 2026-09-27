(() => {
  'use strict';

  const KEYS = {
    materials: 'medstudy_materials_v1',
    exams: 'medstudy_exams_v1',
    simulations: 'medstudy_simulations_v1',
  };
  const AREAS = [
    'Clínica Médica',
    'Cirurgia',
    'Pediatria',
    'Ginecologia e Obstetrícia',
    'Medicina Preventiva / Saúde Coletiva',
    'Outra / Interdisciplinar',
  ];
  const RANKS = [
    { key: 'bronze', name: 'Bronze', min: 0, image: 'https://clash-wiki.com/images/progress/leagues/bronze_league.png' },
    { key: 'prata', name: 'Prata', min: 50, image: 'https://clash-wiki.com/images/progress/leagues/silver_league.png' },
    { key: 'ouro', name: 'Ouro', min: 60, image: 'https://clash-wiki.com/images/progress/leagues/gold_league.png' },
    { key: 'cristal', name: 'Cristal', min: 65, image: 'https://clash-wiki.com/images/progress/leagues/crystal_league.png' },
    { key: 'mestre', name: 'Mestre', min: 70, image: 'https://clash-wiki.com/images/progress/leagues/master_league.png' },
    { key: 'campeao', name: 'Campeão', min: 75, image: 'https://clash-wiki.com/images/progress/leagues/champion_league.png' },
    { key: 'tita', name: 'Titã', min: 80, image: 'https://clash-wiki.com/images/progress/leagues/titan_league.png' },
    { key: 'lendario', name: 'Lendário', min: 90, image: 'https://clash-wiki.com/images/progress/leagues/legend_league.png' },
  ];
  const cfg = globalThis.PELEJA_BACKEND || {};
  const factory = globalThis.supabase;
  const configured = Boolean(
    factory && factory.createClient &&
    /^https:\/\//i.test(String(cfg.supabaseUrl || '')) &&
    String(cfg.supabasePublishableKey || '').trim().length > 20
  );
  const db = configured
    ? factory.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

  const state = {
    session: null,
    profile: null,
    tab: 'simulations',
    data: null,
    syncing: false,
    timer: null,
    activeSimulationKey: null,
    activeEntryMode: 'answers',
    accessAllowed: location.protocol === 'file:',
    invites: [],
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const html = (value) => String(value == null ? '' : value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);

  function personalStorageKey(baseKey) {
    if (!hostedMode()) return baseKey;
    const userId = state.accessAllowed ? state.session?.user?.id : null;
    return userId ? `${baseKey}:user:${userId}` : null;
  }

  function read(baseKey) {
    const key = personalStorageKey(baseKey);
    if (!key) return [];
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function slug(value) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '').slice(0, 90);
  }

  function stableKey(prefix, name, date) {
    return prefix + ':' + String(date || '').slice(0, 10) + ':' + (slug(name) || 'sem-nome');
  }

  function rankForAccuracy(accuracy) {
    const value = Math.max(0, Math.min(100, Number(accuracy) || 0));
    return [...RANKS].reverse().find((rank) => value >= rank.min) || RANKS[0];
  }

  function rankBadge(accuracy) {
    const rank = rankForAccuracy(accuracy);
    return '<span class="rank-badge rank-' + rank.key + '"><span class="rank-icon-slot" aria-hidden="true"><img src="' + html(rank.image) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'" /></span>' + html(rank.name) + '</span>';
  }

  function semesterOf(date) {
    const raw = String(date || '').slice(0, 10);
    const match = raw.match(/^(\d{4})-(\d{2})-/);
    if (!match) return '';
    return match[1] + '.' + (Number(match[2]) <= 6 ? '1' : '2');
  }

  function yearOf(date) {
    const raw = String(date || '').slice(0, 4);
    return /^\d{4}$/.test(raw) ? raw : '';
  }

  function matchesRankingCut(unit, key, date) {
    if (!unit || unit === 'all') return true;
    if (unit.startsWith('semester:')) return semesterOf(date) === unit.slice('semester:'.length);
    if (unit.startsWith('year:')) return yearOf(date) === unit.slice('year:'.length);
    return unit === key;
  }

  function areaOf(area, subject) {
    const raw = (String(area || '') + ' ' + String(subject || ''))
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (raw.includes('clinica medica')) return 'Clínica Médica';
    if (raw.includes('cirurgia') || raw.includes('clinica cirurgica')) return 'Cirurgia';
    if (raw.includes('pediatria')) return 'Pediatria';
    if (raw.includes('gine') || raw.includes('obstetric')) return 'Ginecologia e Obstetrícia';
    if (raw.includes('prevent') || raw.includes('saude coletiva')) return 'Medicina Preventiva / Saúde Coletiva';
    return 'Outra / Interdisciplinar';
  }

  function answerResult(question) {
    const user = String(question.userAnswer || question.answer || '').trim().toUpperCase();
    const official = String(question.correctAnswer || question.key || '').trim().toUpperCase();
    const normalized = official.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!user || !official || ['ANULADA', 'ANULADO', 'ANUL'].includes(normalized)) return null;
    return user === official;
  }

  function simulationSummary(simulation) {
    const areas = {};
    let correct = 0;
    let wrong = 0;
    (simulation.questions || []).forEach((question) => {
      const result = answerResult(question);
      if (result == null) return;
      const area = areaOf(question.area, '');
      if (!areas[area]) areas[area] = { answered: 0, correct: 0, wrong: 0 };
      areas[area].answered += 1;
      if (result) {
        correct += 1;
        areas[area].correct += 1;
      } else {
        wrong += 1;
        areas[area].wrong += 1;
      }
    });
    return { total: correct + wrong, correct, wrong, areas };
  }

  function materialSummaries(materials) {
    const map = new Map();
    materials.forEach((material) => {
      const entries = Array.isArray(material.questionEntries) ? material.questionEntries : [];
      const total = entries.reduce((n, x) => n + Math.max(0, Number(x.questions) || 0), 0);
      const correct = entries.reduce((n, x) => n + Math.max(0, Number(x.correct) || 0), 0);
      const wrong = entries.reduce((n, x) => n + Math.max(0, Number(x.wrong) || 0), 0);
      if (!total || correct + wrong <= 0) return;
      const area = areaOf(material.area, material.subject);
      if (!map.has(area)) map.set(area, { area, total: 0, correct: 0, wrong: 0 });
      const row = map.get(area);
      row.total += total;
      row.correct += correct;
      row.wrong += wrong;
    });
    return Array.from(map.values());
  }

  function displayName() {
    return state.profile?.display_name ||
      state.session?.user?.user_metadata?.display_name ||
      state.session?.user?.email?.split('@')[0] ||
      'Usuário';
  }

  function isAdmin() {
    return state.accessAllowed && state.profile?.role === 'admin';
  }

  function hostedMode() {
    return location.protocol === 'http:' || location.protocol === 'https:';
  }

  function updateAccessGate() {
    const granted = !hostedMode() || (configured && Boolean(state.session?.user) && state.accessAllowed);
    document.body.dataset.accessState = granted ? 'granted' : 'locked';
    const modal = $('#accountModal');
    if (!granted && modal) {
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function publishAccess() {
    const access = {
      ready: true,
      configured,
      signedIn: Boolean(state.session?.user),
      accessAllowed: state.accessAllowed,
      role: isAdmin() ? 'admin' : (state.session?.user && state.accessAllowed ? 'member' : 'guest'),
      isAdmin: isAdmin(),
      userId: state.session?.user?.id || null,
    };
    globalThis.PELEJA_ACCESS = access;
    document.body.dataset.pelejaRole = access.role;
    window.dispatchEvent(new CustomEvent('peleja:access-changed', { detail: access }));
    const roleEl = $('#sharedEventsRole');
    if (roleEl) roleEl.textContent = access.role === 'admin' ? 'Administrador' : (access.role === 'member' ? 'Participante' : 'Entre para participar');
  }

  function simulationKey(simulation) {
    return stableKey('res', simulation.id || simulation.name || simulation.title, '');
  }

  function validOfficialAnswer(value) {
    const answer = String(value || '').trim().toUpperCase();
    const normalized = answer.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return Boolean(answer) && !['ANULADA', 'ANULADO', 'ANUL'].includes(normalized);
  }

  function message(text, kind) {
    const el = $('#authMessage');
    if (!el) return;
    el.textContent = text || '';
    el.dataset.kind = kind || '';
  }

  function backendNotices() {
    const text = 'O modo online ainda não está configurado. Preencha supabase-config.js e rode supabase-schema.sql para ativar contas e ranking compartilhado.';
    ['#accountBackendNotice', '#rankingBackendNotice', '#simulationOnlineNotice'].forEach((selector) => {
      const el = $(selector);
      if (!el) return;
      el.hidden = configured;
      el.textContent = configured ? '' : text;
    });
  }

  function renderAccount() {
    backendNotices();
    const signed = Boolean(state.session?.user) && state.accessAllowed;
    const guest = $('#authGuestPanel');
    const userPanel = $('#authUserPanel');
    if (guest) guest.hidden = signed;
    if (userPanel) userPanel.hidden = !signed;
    const label = $('#accountButtonText');
    if (label) label.textContent = signed ? displayName() : 'Entrar';
    if (signed) {
      const name = $('#accountDisplayName');
      const email = $('#accountEmail');
      const role = $('#accountRole');
      if (name) name.textContent = displayName();
      if (email) email.textContent = state.session.user.email || '';
      if (role) role.textContent = isAdmin() ? 'Administrador do Peleja' : 'Participante';
    }
    const adminPanel = $('#inviteAdminPanel');
    if (adminPanel) adminPanel.hidden = !isAdmin();
    if (isAdmin()) renderInvites();
    updateAccessGate();
    publishAccess();
  }

  function setAuthMode(mode) {
    const selected = mode === 'register' ? 'register' : 'login';
    $$('.auth-tab').forEach((button) => button.classList.toggle('active', button.dataset.authMode === selected));
    const login = $('#loginForm');
    const register = $('#registerForm');
    if (login) login.hidden = selected !== 'login';
    if (register) register.hidden = selected !== 'register';
    message('');
  }

  function openAccount() {
    const modal = $('#accountModal');
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    renderAccount();
  }

  function closeAccount() {
    if (hostedMode() && !state.accessAllowed) return;
    const modal = $('#accountModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    message('');
  }

  function inviteMessage(text, kind) {
    const el = $('#inviteMessage');
    if (!el) return;
    el.textContent = text || '';
    el.dataset.kind = kind || '';
  }

  function renderInvites() {
    const list = $('#inviteList');
    if (!list) return;
    if (!isAdmin()) { list.innerHTML = ''; return; }
    if (!state.invites.length) {
      list.innerHTML = '<div class="empty-state compact"><strong>Nenhum participante autorizado ainda.</strong>Adicione o e-mail de um amigo para liberar cadastro e acesso.</div>';
      return;
    }
    const own = String(state.session?.user?.email || '').trim().toLowerCase();
    list.innerHTML = state.invites.map((invite) => {
      const email = String(invite.email || '').toLowerCase();
      const self = email === own;
      return '<div class="invite-row"><div><strong>' + html(email) + '</strong><small>' + (invite.active ? 'Acesso liberado' : 'Acesso revogado') + '</small></div>' +
        '<button type="button" class="ghost-button" data-invite-action="' + (invite.active ? 'revoke' : 'restore') + '" data-invite-email="' + html(email) + '"' + (self ? ' disabled title="Seu próprio acesso é protegido aqui"' : '') + '>' +
        (invite.active ? 'Revogar' : 'Restaurar') + '</button></div>';
    }).join('');
  }

  async function loadInvites() {
    if (!db || !isAdmin()) { state.invites = []; renderInvites(); return; }
    const result = await db.from('access_allowlist').select('email,active,created_at').order('created_at', { ascending: true });
    if (result.error) throw result.error;
    state.invites = result.data || [];
    renderInvites();
  }

  async function authorizeInvite(event) {
    event.preventDefault();
    if (!db || !isAdmin()) return;
    const input = $('#inviteEmailInput');
    const email = String(input?.value || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return inviteMessage('Informe um e-mail válido.', 'error');
    inviteMessage('Autorizando…');
    const result = await db.from('access_allowlist').upsert({
      email,
      desired_role: 'member',
      active: true,
      invited_by: state.session.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'email' });
    if (result.error) return inviteMessage(result.error.message, 'error');
    if (input) input.value = '';
    await loadInvites();
    inviteMessage('E-mail autorizado. Essa pessoa já pode criar a conta.', 'success');
  }

  async function changeInvite(email, active) {
    if (!db || !isAdmin()) return;
    inviteMessage(active ? 'Restaurando acesso…' : 'Revogando acesso…');
    const result = await db.from('access_allowlist').update({ active, updated_at: new Date().toISOString() }).eq('email', email);
    if (result.error) return inviteMessage(result.error.message, 'error');
    await loadInvites();
    inviteMessage(active ? 'Acesso restaurado.' : 'Acesso revogado.', 'success');
  }

  async function loadProfile() {
    if (!db || !state.session?.user) return;
    const user = state.session.user;
    const fallback = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Usuário';
    const result = await db.from('profiles').select('id,display_name,role').eq('id', user.id).maybeSingle();
    if (result.error) throw result.error;
    if (result.data) {
      state.profile = result.data;
      return;
    }
    const created = await db.from('profiles')
      .upsert({ id: user.id, display_name: fallback }, { onConflict: 'id' })
      .select('id,display_name,role').single();
    if (created.error) throw created.error;
    state.profile = created.data;
  }

  async function login(event) {
    event.preventDefault();
    if (!db) return message('Configure o Supabase antes de entrar.', 'error');
    message('Entrando…');
    const result = await db.auth.signInWithPassword({
      email: $('#loginEmail').value.trim(),
      password: $('#loginPassword').value,
    });
    if (result.error) return message(result.error.message, 'error');
    message('Verificando autorização…');
  }

  async function register(event) {
    event.preventDefault();
    if (!db) return message('Configure o Supabase antes de criar a conta.', 'error');
    const name = $('#registerName').value.trim();
    if (name.length < 2) return message('Informe o nome que aparecerá no ranking.', 'error');
    const options = { data: { display_name: name } };
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      options.emailRedirectTo = location.origin + location.pathname;
    }
    message('Criando conta…');
    const result = await db.auth.signUp({
      email: $('#registerEmail').value.trim(),
      password: $('#registerPassword').value,
      options,
    });
    if (result.error) {
      const raw = String(result.error.message || '');
      const friendly = /database error|saving new user|not invited|convid/i.test(raw)
        ? 'Este e-mail não está autorizado a criar conta no Peleja.'
        : raw;
      return message(friendly, 'error');
    }
    message(result.data.session ? 'Conta criada e conectada.' : 'Conta criada. Confirme o e-mail para entrar.', 'success');
  }

  async function logout() {
    if (!db) return;
    await db.auth.signOut();
  }

  async function sync({ quiet = false } = {}) {
    if (!db || !state.session?.user || !state.accessAllowed || state.syncing) return;
    state.syncing = true;
    const syncState = $('#rankingSyncState');
    const syncButton = $('#rankingSyncButton');
    const accountSync = $('#syncAccountButton');
    if (syncState) syncState.textContent = 'Sincronizando…';
    if (syncButton) syncButton.disabled = true;
    if (accountSync) accountSync.disabled = true;

    try {
      const userId = state.session.user.id;
      const simulations = read(KEYS.simulations);
      const exams = read(KEYS.exams);
      const materials = read(KEYS.materials);

      if (isAdmin()) {
        const catalogs = [];
        const questionRows = [];
        const ownAnswers = [];
        const ownVotes = [];
        simulations.forEach((simulation) => {
          const key = simulationKey(simulation);
          const questions = Array.isArray(simulation.questions) ? simulation.questions : [];
          if (!questions.length) return;
          catalogs.push({
            key,
            name: String(simulation.name || simulation.title || 'Prova de residência'),
            date: String(simulation.date || '').slice(0, 10) || null,
            created_by: userId,
            updated_at: new Date().toISOString(),
          });
          questions.forEach((question, index) => {
            const number = Math.max(1, Number(question.number) || index + 1);
            questionRows.push({
              simulation_key: key,
              question_number: number,
              official_answer: String(question.correctAnswer || question.key || '').trim().toUpperCase(),
              updated_at: new Date().toISOString(),
            });
            const answer = String(question.userAnswer || question.answer || '').trim().toUpperCase();
            if (answer) ownAnswers.push({
              user_id: userId,
              simulation_key: key,
              question_number: number,
              answer,
              updated_at: new Date().toISOString(),
            });
            const area = String(question.area || '').trim();
            if (area) ownVotes.push({
              user_id: userId,
              simulation_key: key,
              question_number: number,
              area,
              updated_at: new Date().toISOString(),
            });
          });
        });

        if (catalogs.length) {
          const r = await db.from('simulation_catalog').upsert(catalogs, { onConflict: 'key' });
          if (r.error) throw r.error;
        }
        if (questionRows.length) {
          const r = await db.from('simulation_questions').upsert(questionRows, { onConflict: 'simulation_key,question_number' });
          if (r.error) throw r.error;
        }
        if (ownAnswers.length) {
          const r = await db.from('simulation_user_answers').upsert(ownAnswers, { onConflict: 'user_id,simulation_key,question_number' });
          if (r.error) throw r.error;
        }
        if (ownVotes.length) {
          const r = await db.from('simulation_area_votes').upsert(ownVotes, { onConflict: 'user_id,simulation_key,question_number' });
          if (r.error) throw r.error;
        }
      }

      const universityRows = exams
        .filter((exam) => Number(exam.total) > 0 &&
          Number(exam.correct) >= 0 &&
          Number(exam.wrong) >= 0 &&
          Number(exam.correct) + Number(exam.wrong) === Number(exam.total))
        .map((exam) => {
          const examName = String(exam.subject || 'Faculdade') + ' — ' + String(exam.type || 'Prova');
          return {
            user_id: userId,
            exam_key: stableKey('fac', examName, exam.date),
            exam_name: examName,
            exam_date: String(exam.date || '').slice(0, 10) || null,
            area: areaOf(exam.area, exam.subject),
            total: Number(exam.total),
            correct: Number(exam.correct),
            wrong: Number(exam.wrong),
            updated_at: new Date().toISOString(),
          };
        });

      if (universityRows.length) {
        const r = await db.from('university_results').upsert(universityRows, { onConflict: 'user_id,exam_key' });
        if (r.error) throw r.error;
      }

      const materialRows = materialSummaries(materials).map((row) => ({
        user_id: userId,
        area: row.area,
        total: row.total,
        correct: row.correct,
        wrong: row.wrong,
        updated_at: new Date().toISOString(),
      }));
      if (materialRows.length) {
        const r = await db.from('material_area_results').upsert(materialRows, { onConflict: 'user_id,area' });
        if (r.error) throw r.error;
      }

      if (syncState) syncState.textContent = 'Sincronizado às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      if (!quiet) message('Dados de desempenho sincronizados com o ranking.', 'success');
    } catch (error) {
      console.error('Peleja cloud sync:', error);
      if (syncState) syncState.textContent = 'Falha na sincronização';
      if (!quiet) message('Não foi possível sincronizar: ' + error.message, 'error');
    } finally {
      state.syncing = false;
      if (syncButton) syncButton.disabled = false;
      if (accountSync) accountSync.disabled = false;
    }
  }

  function scheduleSync() {
    clearTimeout(state.timer);
    if (!state.session?.user || !state.accessAllowed) return;
    state.timer = setTimeout(async () => {
      await sync({ quiet: true });
      if ($('#rankingView')?.classList.contains('active')) await loadRanking();
    }, 1200);
  }

  async function loadRanking() {
    if (!db || !state.session?.user) return renderLocked();
    const syncState = $('#rankingSyncState');
    if (syncState) syncState.textContent = 'Atualizando ranking…';
    try {
      const userId = state.session.user.id;
      const [profiles, catalogs, questions, answers, votes, simulations, manualSimulations, university, materials] = await Promise.all([
        db.from('profiles').select('id,display_name,role'),
        db.from('simulation_catalog').select('key,name,date,created_by').order('date', { ascending: false }),
        db.from('simulation_questions').select('simulation_key,question_number,official_answer,accepted_area').order('question_number', { ascending: true }),
        db.from('simulation_user_answers').select('user_id,simulation_key,question_number,answer').eq('user_id', userId),
        db.from('simulation_area_votes').select('user_id,simulation_key,question_number,area'),
        db.from('simulation_results').select('user_id,simulation_key,total,correct,wrong,area_stats,updated_at'),
        db.from('simulation_manual_results').select('user_id,simulation_key,total,correct,wrong,area_stats,updated_at'),
        db.from('university_results').select('user_id,exam_key,exam_name,exam_date,area,total,correct,wrong,updated_at'),
        db.from('material_area_results').select('user_id,area,total,correct,wrong'),
      ]);
      const failed = [profiles, catalogs, questions, answers, votes, simulations, manualSimulations, university, materials].find((x) => x.error);
      if (failed) throw failed.error;
      state.data = {
        profiles: profiles.data || [],
        catalogs: catalogs.data || [],
        questions: questions.data || [],
        answers: answers.data || [],
        votes: votes.data || [],
        simulations: simulations.data || [],
        manualSimulations: manualSimulations.data || [],
        university: university.data || [],
        materials: materials.data || [],
      };
      fillFilters();
      renderRanking();
      renderSharedEvents();
      if (syncState) syncState.textContent = 'Ranking atualizado';
    } catch (error) {
      console.error('Peleja ranking:', error);
      state.data = null;
      if (syncState) syncState.textContent = 'Ranking indisponível';
      const table = $('#rankingTable');
      if (table) table.innerHTML = '<div class="ranking-error"><strong>Não foi possível carregar o ranking.</strong><span>' + html(error.message) + '</span></div>';
    }
  }

  function mergedSimulationResults() {
    const map = new Map();
    const put = (row, source) => {
      const key = String(row.user_id) + '|' + String(row.simulation_key);
      const current = map.get(key);
      const time = Date.parse(row.updated_at || '') || 0;
      if (!current || time >= current._time) map.set(key, { ...row, source, _time: time });
    };
    (state.data?.simulations || []).forEach((row) => put(row, 'answers'));
    (state.data?.manualSimulations || []).forEach((row) => put(row, 'quick'));
    return [...map.values()];
  }

  function ownEventResult(key) {
    const userId = state.session?.user?.id;
    return mergedSimulationResults().find((row) => row.user_id === userId && row.simulation_key === key) || null;
  }

  function fillAreaFilter() {
    const select = $('#rankingAreaFilter');
    if (!select) return;
    const current = select.value || 'all';
    select.innerHTML = '<option value="all">Todas as áreas</option>' +
      AREAS.map((area) => '<option value="' + html(area) + '">' + html(area) + '</option>').join('');
    if (Array.from(select.options).some((option) => option.value === current)) select.value = current;
  }

  function fillFilters() {
    fillAreaFilter();
    if (!state.data) return;
    const select = $('#rankingUnitFilter');
    const wrap = $('#rankingUnitWrap');
    if (!select) return;
    const current = select.value || 'all';
    let options = [];
    let label = 'Unidade';

    if (state.tab === 'simulations') {
      label = 'Recorte';
      const semesters = [...new Set(state.data.catalogs.map((item) => semesterOf(item.date)).filter(Boolean))].sort().reverse();
      const years = [...new Set(state.data.catalogs.map((item) => yearOf(item.date)).filter(Boolean))].sort().reverse();
      options = [
        ...semesters.map((value) => ({ value: 'semester:' + value, label: 'Semestre ' + value })),
        ...years.map((value) => ({ value: 'year:' + value, label: 'Ano ' + value })),
        ...state.data.catalogs.map((item) => ({
          value: item.key,
          label: item.name + (item.date ? ' · ' + new Date(item.date + 'T12:00:00').toLocaleDateString('pt-BR') : ''),
        })),
      ];
    } else if (state.tab === 'faculty') {
      label = 'Recorte';
      const seen = new Set();
      const exams = state.data.university
        .filter((item) => {
          if (seen.has(item.exam_key)) return false;
          seen.add(item.exam_key);
          return true;
        })
        .sort((a, b) => String(b.exam_date || '').localeCompare(String(a.exam_date || '')));
      const semesters = [...new Set(exams.map((item) => semesterOf(item.exam_date)).filter(Boolean))].sort().reverse();
      const years = [...new Set(exams.map((item) => yearOf(item.exam_date)).filter(Boolean))].sort().reverse();
      options = [
        ...semesters.map((value) => ({ value: 'semester:' + value, label: 'Semestre ' + value })),
        ...years.map((value) => ({ value: 'year:' + value, label: 'Ano ' + value })),
        ...exams.map((item) => ({
          value: item.exam_key,
          label: item.exam_name + (item.exam_date ? ' · ' + new Date(item.exam_date + 'T12:00:00').toLocaleDateString('pt-BR') : ''),
        })),
      ];
    }

    const labelEl = wrap?.querySelector('span');
    if (labelEl) labelEl.textContent = label;
    if (wrap) wrap.hidden = state.tab === 'materials';
    select.innerHTML = '<option value="all">Comparação total</option>' +
      options.map((x) => '<option value="' + html(x.value) + '">' + html(x.label) + '</option>').join('');
    if (Array.from(select.options).some((option) => option.value === current)) select.value = current;
  }

  function totalAccuracyForUser(userId, unit) {
    let correct = 0;
    let total = 0;
    if (state.tab === 'simulations') {
      const catalogDates = new Map(state.data.catalogs.map((item) => [item.key, item.date || '']));
      mergedSimulationResults().forEach((item) => {
        if (item.user_id !== userId) return;
        if (!matchesRankingCut(unit, item.simulation_key, catalogDates.get(item.simulation_key))) return;
        correct += Number(item.correct) || 0;
        total += Number(item.total) || 0;
      });
    } else if (state.tab === 'faculty') {
      state.data.university.forEach((item) => {
        if (item.user_id !== userId) return;
        if (!matchesRankingCut(unit, item.exam_key, item.exam_date)) return;
        correct += Number(item.correct) || 0;
        total += Number(item.total) || 0;
      });
    } else {
      state.data.materials.forEach((item) => {
        if (item.user_id !== userId) return;
        correct += Number(item.correct) || 0;
        total += Number(item.total) || 0;
      });
    }
    return total ? correct / total * 100 : 0;
  }

  function rows() {
    if (!state.data) return [];
    const area = $('#rankingAreaFilter')?.value || 'all';
    const unit = $('#rankingUnitFilter')?.value || 'all';
    const grouped = new Map();
    const names = new Map(state.data.profiles.map((p) => [p.id, p.display_name || 'Usuário']));

    function add(userId, correct, total, unitId) {
      total = Number(total) || 0;
      if (!total) return;
      if (!grouped.has(userId)) grouped.set(userId, {
        userId, name: names.get(userId) || 'Usuário', correct: 0, total: 0, units: new Set(),
      });
      const row = grouped.get(userId);
      row.correct += Number(correct) || 0;
      row.total += total;
      if (unitId) row.units.add(unitId);
    }

    if (state.tab === 'simulations') {
      const catalogDates = new Map(state.data.catalogs.map((item) => [item.key, item.date || '']));
      mergedSimulationResults().forEach((item) => {
        if (!matchesRankingCut(unit, item.simulation_key, catalogDates.get(item.simulation_key))) return;
        if (area === 'all') add(item.user_id, item.correct, item.total, item.simulation_key);
        else {
          const s = item.area_stats?.[area];
          if (s?.answered) add(item.user_id, s.correct, s.answered, item.simulation_key);
        }
      });
    } else if (state.tab === 'faculty') {
      state.data.university.forEach((item) => {
        if (!matchesRankingCut(unit, item.exam_key, item.exam_date)) return;
        if (area !== 'all' && item.area !== area) return;
        add(item.user_id, item.correct, item.total, item.exam_key);
      });
    } else {
      state.data.materials.forEach((item) => {
        if (area !== 'all' && item.area !== area) return;
        add(item.user_id, item.correct, item.total, item.area);
      });
    }

    return Array.from(grouped.values())
      .map((row) => ({
        ...row,
        unitCount: row.units.size,
        accuracy: row.total ? row.correct / row.total * 100 : 0,
        rankAccuracy: totalAccuracyForUser(row.userId, unit),
      }))
      .sort((a, b) => b.accuracy - a.accuracy || b.correct - a.correct || b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'));
  }

  function eventQuestions(key) {
    return (state.data?.questions || [])
      .filter((question) => question.simulation_key === key)
      .sort((a, b) => Number(a.question_number) - Number(b.question_number));
  }

  function ownEventAnswers(key) {
    const map = new Map();
    (state.data?.answers || []).forEach((row) => {
      if (row.simulation_key === key) map.set(Number(row.question_number), String(row.answer || '').toUpperCase());
    });
    return map;
  }

  function ownEventVotes(key) {
    const map = new Map();
    const userId = state.session?.user?.id;
    (state.data?.votes || []).forEach((row) => {
      if (row.simulation_key === key && row.user_id === userId) map.set(Number(row.question_number), row.area || '');
    });
    return map;
  }

  function voteSummary(key, number) {
    const counts = new Map();
    (state.data?.votes || []).forEach((row) => {
      if (row.simulation_key !== key || Number(row.question_number) !== Number(number)) return;
      const area = String(row.area || '').trim();
      if (!area) return;
      counts.set(area, (counts.get(area) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
  }

  function eventProgress(key) {
    const questions = eventQuestions(key);
    const answers = ownEventAnswers(key);
    const valid = questions.filter((q) => validOfficialAnswer(q.official_answer));
    const answered = valid.filter((q) => answers.get(Number(q.question_number))).length;
    const fullComplete = valid.length > 0 && answered === valid.length;
    const manual = (state.data?.manualSimulations || []).find((row) => row.user_id === state.session?.user?.id && row.simulation_key === key) || null;
    const complete = fullComplete || Boolean(manual);
    const ready = questions.length > 0 && questions.every((q) => String(q.official_answer || '').trim());
    return { questions, valid, answered, fullComplete, manual, complete, ready };
  }

  function renderSharedEvents() {
    backendNotices();
    const container = $('#sharedSimulationEvents');
    if (!container) return;
    publishAccess();
    if (!configured) {
      container.innerHTML = '<div class="empty-state compact"><strong>Eventos online ainda não configurados.</strong>O modo local continua funcionando normalmente.</div>';
      return;
    }
    if (!state.session?.user) {
      container.innerHTML = '<div class="shared-events-locked"><strong>Entre para acessar os eventos da turma.</strong><span>O administrador publica a prova e o gabarito; cada participante envia o próprio gabarito.</span><button type="button" class="primary-button" data-open-account>Entrar</button></div>';
      return;
    }
    const catalogs = state.data?.catalogs || [];
    if (!catalogs.length) {
      container.innerHTML = '<div class="empty-state compact"><strong>Nenhum evento de Residência publicado.</strong>' + (isAdmin() ? 'Crie um simulado no Peleja e sincronize para publicá-lo.' : 'Quando o administrador publicar uma prova, ela aparecerá aqui.') + '</div>';
      return;
    }
    container.innerHTML = catalogs.map((event) => {
      const progress = eventProgress(event.key);
      const accepted = progress.questions.filter((q) => q.accepted_area).length;
      const result = ownEventResult(event.key);
      const resultLabel = result && result.total ? ((Number(result.correct) / Number(result.total)) * 100).toFixed(1) + '% · ' + rankForAccuracy((Number(result.correct) / Number(result.total)) * 100).name : '';
      const status = !progress.ready ? 'Gabarito oficial incompleto' : (resultLabel || (progress.answered ? progress.answered + '/' + progress.valid.length + ' respondidas' : 'Pendente'));
      const button = progress.ready
        ? '<button type="button" class="ghost-button" data-shared-event="' + html(event.key) + '">' + (progress.complete ? 'Revisar resultado' : 'Registrar resultado') + '</button>'
        : '<button type="button" class="ghost-button" disabled>Aguardando gabarito oficial</button>';
      return '<article class="shared-event-card">' +
        '<div><span class="shared-event-kicker">RESIDÊNCIA</span><strong>' + html(event.name) + '</strong><small>' + (event.date ? new Date(event.date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Data não informada') + ' · ' + progress.questions.length + ' questões · ' + accepted + ' áreas consensuais</small></div>' +
        '<div class="shared-event-status"><span>' + html(status) + '</span>' + button + '</div></article>';
    }).join('');
  }

  function acceptedAreaCounts(questions) {
    const map = new Map();
    questions.filter((q) => validOfficialAnswer(q.official_answer) && q.accepted_area).forEach((q) => {
      map.set(q.accepted_area, (map.get(q.accepted_area) || 0) + 1);
    });
    return map;
  }

  function setSharedEntryMode(mode) {
    const selected = mode === 'quick' ? 'quick' : 'answers';
    state.activeEntryMode = selected;
    const hidden = $('#sharedEntryMode');
    if (hidden) hidden.value = selected;
    document.querySelectorAll('.shared-entry-tab').forEach((button) => button.classList.toggle('active', button.dataset.sharedEntryMode === selected));
    const answers = $('#sharedAnswersPanel');
    const quick = $('#sharedQuickPanel');
    if (answers) answers.hidden = selected !== 'answers';
    if (quick) quick.hidden = selected !== 'quick';
    const save = $('#saveSharedSimulationButton');
    if (save) save.textContent = selected === 'quick' ? 'Salvar resultado rápido' : 'Salvar meu gabarito';
  }

  function renderSharedQuick(key) {
    const questions = eventQuestions(key);
    const valid = questions.filter((q) => validOfficialAnswer(q.official_answer));
    const manual = (state.data?.manualSimulations || []).find((row) => row.user_id === state.session?.user?.id && row.simulation_key === key) || null;
    const total = $('#sharedQuickTotal');
    const correct = $('#sharedQuickCorrect');
    if (total) total.value = valid.length;
    if (correct) {
      correct.max = String(valid.length);
      correct.value = manual ? String(manual.correct) : '';
    }
    const counts = acceptedAreaCounts(questions);
    const container = $('#sharedQuickAreas');
    if (container) {
      container.innerHTML = AREAS.filter((area) => counts.get(area)).map((area) => {
        const answered = counts.get(area);
        const saved = manual?.area_stats?.[area]?.correct;
        return '<label class="shared-quick-area-row"><span><b>' + html(area) + '</b><small>' + answered + ' questões aceitas</small></span><input type="number" min="0" max="' + answered + '" step="1" inputmode="numeric" data-quick-area="' + html(area) + '" value="' + (saved == null ? '' : Number(saved)) + '" placeholder="Acertos" /></label>';
      }).join('') || '<div class="empty-state compact"><strong>As grandes áreas ainda estão em consenso.</strong>Você já pode lançar os acertos totais; o detalhamento por área fica disponível conforme as questões ganham uma área aceita.</div>';
    }
    const classified = [...counts.values()].reduce((sum, value) => sum + value, 0);
    const note = $('#sharedQuickAreaNote');
    if (note) note.textContent = classified === valid.length
      ? 'Todas as questões válidas já têm grande área aceita.'
      : classified + '/' + valid.length + ' questões válidas já têm grande área aceita.';

    const voteContainer = $('#sharedQuickVotes');
    if (voteContainer) {
      const ownVotes = ownEventVotes(key);
      voteContainer.innerHTML = questions.map((question) => {
        const number = Number(question.question_number);
        const selected = ownVotes.get(number) || '';
        const options = [''].concat(AREAS).map((area) => '<option value="' + html(area) + '"' + (selected === area ? ' selected' : '') + '>' + (area || 'Sem sugestão') + '</option>').join('');
        const summary = voteSummary(key, number).slice(0, 2).map(([area, count]) => area + ' ' + count).join(' · ');
        return '<div class="shared-quick-vote-row" data-question="' + number + '"><b>' + number + '</b><select data-quick-vote-area>' + options + '</select><span><strong>' + html(question.accepted_area || 'Em aberto') + '</strong><small>' + html(summary || 'Sem votos') + '</small></span></div>';
      }).join('');
    }
  }

  function closeSharedSimulation() {
    const modal = $('#sharedSimulationModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    state.activeSimulationKey = null;
    const validation = $('#sharedSimulationValidation');
    if (validation) validation.textContent = '';
  }

  function openSharedSimulation(key) {
    if (!state.session?.user || !state.data) return openAccount();
    const event = (state.data.catalogs || []).find((item) => item.key === key);
    if (!event) return;
    const progress = eventProgress(key);
    if (!progress.ready) return;
    state.activeSimulationKey = key;
    const title = $('#sharedSimulationTitle');
    const meta = $('#sharedSimulationMeta');
    const keyInput = $('#sharedSimulationKey');
    const rows = $('#sharedSimulationRows');
    if (title) title.textContent = event.name;
    if (meta) meta.textContent = (event.date ? new Date(event.date + 'T12:00:00').toLocaleDateString('pt-BR') + ' · ' : '') + progress.questions.length + ' questões';
    if (keyInput) keyInput.value = key;
    const answers = ownEventAnswers(key);
    const votes = ownEventVotes(key);
    const reveal = progress.fullComplete;
    rows.innerHTML = progress.questions.map((question) => {
      const number = Number(question.question_number);
      const answer = answers.get(number) || '';
      const suggestion = votes.get(number) || '';
      const voteText = voteSummary(key, number).slice(0, 3).map(([area, count]) => area + ' ' + count).join(' · ');
      let result = '—';
      if (reveal && validOfficialAnswer(question.official_answer)) {
        result = answer === String(question.official_answer || '').toUpperCase()
          ? '✓ ' + String(question.official_answer || '').toUpperCase()
          : '✕ ' + String(question.official_answer || '').toUpperCase();
      } else if (reveal && !validOfficialAnswer(question.official_answer)) {
        result = 'Anulada';
      }
      const answerOptions = ['','A','B','C','D','E'].map((value) => '<option value="' + value + '"' + (value === answer ? ' selected' : '') + '>' + (value || '—') + '</option>').join('');
      const areaOptions = [''].concat(AREAS).map((value) => '<option value="' + html(value) + '"' + (value === suggestion ? ' selected' : '') + '>' + (value || 'Sem sugestão') + '</option>').join('');
      return '<div class="shared-question-row" data-question="' + number + '">' +
        '<b>' + number + '</b>' +
        '<select data-shared-field="answer" aria-label="Resposta da questão ' + number + '">' + answerOptions + '</select>' +
        '<select data-shared-field="area" aria-label="Sugestão de área da questão ' + number + '">' + areaOptions + '</select>' +
        '<div class="shared-accepted-area"><strong>' + html(question.accepted_area || 'Em aberto') + '</strong><small>' + html(voteText || 'Sem votos') + '</small></div>' +
        '<span class="shared-result">' + html(result) + '</span></div>';
    }).join('');
    renderSharedQuick(key);
    setSharedEntryMode(progress.manual ? 'quick' : 'answers');
    const validation = $('#sharedSimulationValidation');
    if (validation) validation.textContent = '';
    const modal = $('#sharedSimulationModal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  async function saveSharedSimulation(event) {
    event.preventDefault();
    if (!db || !state.session?.user || !state.activeSimulationKey) return;
    const key = state.activeSimulationKey;
    const questions = eventQuestions(key);
    const mode = $('#sharedEntryMode')?.value === 'quick' ? 'quick' : 'answers';
    const validation = $('#sharedSimulationValidation');

    if (mode === 'quick') {
      const valid = questions.filter((q) => validOfficialAnswer(q.official_answer));
      const total = valid.length;
      const correct = Number($('#sharedQuickCorrect')?.value);
      if (!Number.isInteger(correct) || correct < 0 || correct > total) {
        validation.textContent = 'Informe os acertos totais entre 0 e ' + total + '.';
        return;
      }
      const counts = acceptedAreaCounts(questions);
      const areaStats = {};
      let areaCorrectSum = 0;
      for (const input of document.querySelectorAll('#sharedQuickAreas [data-quick-area]')) {
        const area = input.dataset.quickArea;
        const answered = counts.get(area) || 0;
        const raw = input.value.trim();
        if (!raw) continue;
        const value = Number(raw);
        if (!Number.isInteger(value) || value < 0 || value > answered) {
          validation.textContent = 'Revise os acertos informados em ' + area + '.';
          return;
        }
        areaStats[area] = { answered, correct: value, wrong: answered - value };
        areaCorrectSum += value;
      }
      const classified = [...counts.values()].reduce((sum, value) => sum + value, 0);
      if (classified === total && areaCorrectSum !== correct) {
        validation.textContent = 'Como todas as questões já têm área aceita, a soma dos acertos por área deve ser igual aos acertos totais.';
        return;
      }
      if (areaCorrectSum > correct) {
        validation.textContent = 'A soma dos acertos por área não pode ultrapassar os acertos totais.';
        return;
      }
      const quickVotes = [];
      const quickClearVotes = [];
      for (const row of document.querySelectorAll('#sharedQuickVotes .shared-quick-vote-row')) {
        const number = Number(row.dataset.question);
        const area = row.querySelector('[data-quick-vote-area]')?.value || '';
        if (area) quickVotes.push({
          user_id: state.session.user.id,
          simulation_key: key,
          question_number: number,
          area,
          updated_at: new Date().toISOString(),
        });
        else quickClearVotes.push(number);
      }

      validation.textContent = 'Salvando…';
      try {
        const removeAnswers = await db.from('simulation_user_answers').delete().eq('user_id', state.session.user.id).eq('simulation_key', key);
        if (removeAnswers.error) throw removeAnswers.error;
        if (quickVotes.length) {
          const voteResult = await db.from('simulation_area_votes').upsert(quickVotes, { onConflict: 'user_id,simulation_key,question_number' });
          if (voteResult.error) throw voteResult.error;
        }
        for (const number of quickClearVotes) {
          const clearResult = await db.from('simulation_area_votes')
            .delete()
            .eq('user_id', state.session.user.id)
            .eq('simulation_key', key)
            .eq('question_number', number);
          if (clearResult.error) throw clearResult.error;
        }
        const result = await db.from('simulation_manual_results').upsert({
          user_id: state.session.user.id,
          simulation_key: key,
          total,
          correct,
          wrong: total - correct,
          area_stats: areaStats,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,simulation_key' });
        if (result.error) throw result.error;
        await loadRanking();
        openSharedSimulation(key);
        $('#sharedSimulationValidation').textContent = 'Resultado rápido salvo. Rank: ' + rankForAccuracy(total ? correct / total * 100 : 0).name + '.';
      } catch (error) {
        console.error('Peleja quick result:', error);
        validation.textContent = 'Não foi possível salvar: ' + error.message;
      }
      return;
    }

    const rows = document.querySelectorAll('#sharedSimulationRows .shared-question-row');
    const answers = [];
    const votes = [];
    const clearVotes = [];
    for (const row of rows) {
      const number = Number(row.dataset.question);
      const answer = row.querySelector('[data-shared-field="answer"]')?.value || '';
      const area = row.querySelector('[data-shared-field="area"]')?.value || '';
      const question = questions.find((q) => Number(q.question_number) === number);
      if (validOfficialAnswer(question?.official_answer) && !answer) {
        $('#sharedSimulationValidation').textContent = 'Preencha todas as respostas antes de enviar o gabarito.';
        return;
      }
      if (answer) answers.push({
        user_id: state.session.user.id,
        simulation_key: key,
        question_number: number,
        answer,
        updated_at: new Date().toISOString(),
      });
      if (area) votes.push({
        user_id: state.session.user.id,
        simulation_key: key,
        question_number: number,
        area,
        updated_at: new Date().toISOString(),
      });
      else clearVotes.push(number);
    }

    validation.textContent = 'Salvando…';
    try {
      const removeManual = await db.from('simulation_manual_results').delete().eq('user_id', state.session.user.id).eq('simulation_key', key);
      if (removeManual.error) throw removeManual.error;
      if (answers.length) {
        const r = await db.from('simulation_user_answers').upsert(answers, { onConflict: 'user_id,simulation_key,question_number' });
        if (r.error) throw r.error;
      }
      if (votes.length) {
        const r = await db.from('simulation_area_votes').upsert(votes, { onConflict: 'user_id,simulation_key,question_number' });
        if (r.error) throw r.error;
      }
      for (const number of clearVotes) {
        const r = await db.from('simulation_area_votes')
          .delete()
          .eq('user_id', state.session.user.id)
          .eq('simulation_key', key)
          .eq('question_number', number);
        if (r.error) throw r.error;
      }
      await loadRanking();
      openSharedSimulation(key);
      const latest = eventProgress(key);
      validation.textContent = latest.complete ? 'Gabarito salvo. O resultado já entrou no ranking.' : 'Gabarito salvo.';
    } catch (error) {
      console.error('Peleja shared simulation:', error);
      validation.textContent = 'Não foi possível salvar: ' + error.message;
    }
  }

  function renderLocked() {
    backendNotices();
    const table = $('#rankingTable');
    if (!table) return;
    const text = configured
      ? 'Entre na sua conta para comparar seus resultados com os demais.'
      : 'Configure o backend para habilitar contas e ranking compartilhado.';
    table.innerHTML = '<div class="ranking-locked"><strong>Ranking online</strong><span>' + html(text) + '</span><button type="button" class="primary-button" data-open-account>' + (configured ? 'Entrar' : 'Ver configuração') + '</button></div>';
    ['#rankingParticipantsKpi', '#rankingMyPositionKpi', '#rankingMyAccuracyKpi', '#rankingMyRankKpi'].forEach((selector) => {
      const el = $(selector);
      if (el) el.textContent = '—';
    });
  }

  function renderRanking() {
    backendNotices();
    if (!state.session?.user || !state.data) return renderLocked();
    const list = rows();
    const me = list.findIndex((row) => row.userId === state.session.user.id);
    const participants = $('#rankingParticipantsKpi');
    const position = $('#rankingMyPositionKpi');
    const accuracy = $('#rankingMyAccuracyKpi');
    const rank = $('#rankingMyRankKpi');
    const rankNote = $('#rankingMyRankNote');
    if (participants) participants.textContent = list.length;
    if (position) position.textContent = me >= 0 ? String(me + 1) + 'º' : '—';
    if (accuracy) accuracy.textContent = me >= 0 ? list[me].accuracy.toFixed(1) + '%' : '—';
    if (rank) rank.innerHTML = me >= 0 ? rankBadge(list[me].rankAccuracy) : '—';
    if (rankNote) rankNote.textContent = me >= 0 ? 'pela % total do recorte' : 'Bronze → Lendário';

    const table = $('#rankingTable');
    if (!table) return;
    if (!list.length) {
      table.innerHTML = '<div class="empty-state compact"><strong>Ainda não há resultados para este recorte.</strong>Sincronize os dados ou mude os filtros.</div>';
      return;
    }

    const unitLabel = state.tab === 'materials' ? 'Áreas com dados' : 'Provas';
    table.innerHTML =
      '<div class="ranking-table-head"><span>#</span><span>Pessoa</span><span>Aproveitamento</span><span>Acertos</span><span>' + unitLabel + '</span></div>' +
      list.map((row, index) => {
        const mine = row.userId === state.session.user.id;
        return '<div class="ranking-row' + (mine ? ' is-me' : '') + '">' +
          '<b class="ranking-position">' + (index + 1) + '</b>' +
          '<div class="ranking-person"><strong>' + html(row.name) + (mine ? ' <em>você</em>' : '') + '</strong><div class="ranking-person-rank">' + rankBadge(row.rankAccuracy) + '</div><small>' + row.total + ' questões consideradas</small></div>' +
          '<div class="ranking-score"><b>' + row.accuracy.toFixed(1) + '%</b><div><i style="width:' + Math.max(0, Math.min(100, row.accuracy)) + '%"></i></div></div>' +
          '<span>' + row.correct + '/' + row.total + '</span><span>' + row.unitCount + '</span></div>';
      }).join('');
  }

  function setTab(tab) {
    state.tab = ['simulations', 'faculty', 'materials'].includes(tab) ? tab : 'simulations';
    $$('.ranking-tab').forEach((button) => button.classList.toggle('active', button.dataset.rankingTab === state.tab));
    const unit = $('#rankingUnitFilter');
    const area = $('#rankingAreaFilter');
    if (unit) unit.value = 'all';
    if (area) area.value = 'all';
    fillFilters();
    renderRanking();
  }

  async function authChanged(session) {
    state.session = session;
    state.profile = null;
    state.accessAllowed = !hostedMode();
    publishAccess();
    if (session?.user && db) {
      try {
        const access = await db.rpc('has_peleja_access');
        if (access.error) throw access.error;
        if (!access.data) {
          state.accessAllowed = false;
          message('Este e-mail não está autorizado a acessar o Peleja.', 'error');
          await db.auth.signOut();
          state.session = null;
          state.data = null;
          renderLocked();
          renderSharedEvents();
          renderAccount();
          return;
        }
        state.accessAllowed = true;
        await loadProfile();
        if (isAdmin()) await loadInvites();
        publishAccess();
        await sync({ quiet: true });
        await loadRanking();
      } catch (error) {
        console.error('Peleja account:', error);
        state.accessAllowed = false;
        message(error.message, 'error');
      }
    } else {
      state.accessAllowed = !hostedMode();
      state.data = null;
      state.invites = [];
      renderLocked();
      renderSharedEvents();
    }
    renderAccount();
    updateAccessGate();
    publishAccess();
  }

  function bind() {
    $('#accountButton')?.addEventListener('click', openAccount);
    $('#closeAccountModal')?.addEventListener('click', closeAccount);
    $('#accountModal')?.addEventListener('click', (event) => {
      if (event.target === $('#accountModal')) closeAccount();
    });
    $$('.auth-tab').forEach((button) => button.addEventListener('click', () => setAuthMode(button.dataset.authMode)));
    $('#loginForm')?.addEventListener('submit', login);
    $('#registerForm')?.addEventListener('submit', register);
    $('#logoutButton')?.addEventListener('click', logout);
    $('#syncAccountButton')?.addEventListener('click', async () => { await sync(); await loadRanking(); });
    $('#inviteEmailForm')?.addEventListener('submit', authorizeInvite);
    $('#inviteList')?.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-invite-action]');
      if (!button || button.disabled) return;
      const email = button.dataset.inviteEmail;
      await changeInvite(email, button.dataset.inviteAction === 'restore');
    });
    $$('.ranking-tab').forEach((button) => button.addEventListener('click', () => setTab(button.dataset.rankingTab)));
    $('#rankingUnitFilter')?.addEventListener('change', renderRanking);
    $('#rankingAreaFilter')?.addEventListener('change', renderRanking);
    $('#rankingSyncButton')?.addEventListener('click', async () => { await sync({ quiet: true }); await loadRanking(); });
    $('#sharedSimulationEvents')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-shared-event]');
      if (button) openSharedSimulation(button.dataset.sharedEvent);
    });
    $('#sharedSimulationForm')?.addEventListener('submit', saveSharedSimulation);
    document.querySelectorAll('.shared-entry-tab').forEach((button) => button.addEventListener('click', () => setSharedEntryMode(button.dataset.sharedEntryMode)));
    $('#closeSharedSimulationModal')?.addEventListener('click', closeSharedSimulation);
    $('#cancelSharedSimulationModal')?.addEventListener('click', closeSharedSimulation);
    $('#sharedSimulationModal')?.addEventListener('click', (event) => {
      if (event.target === $('#sharedSimulationModal')) closeSharedSimulation();
    });
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-open-account]')) openAccount();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && $('#sharedSimulationModal')?.classList.contains('open')) closeSharedSimulation();
      else if (event.key === 'Escape' && $('#accountModal')?.classList.contains('open') && (!hostedMode() || state.accessAllowed)) closeAccount();
    });
    window.addEventListener('peleja:data-changed', scheduleSync);
    window.addEventListener('peleja:view-changed', async (event) => {
      if (event.detail?.view !== 'ranking') return;
      if (!state.session?.user) return renderLocked();
      await sync({ quiet: true });
      await loadRanking();
    });
  }

  async function init() {
    backendNotices();
    setAuthMode('login');
    fillAreaFilter();
    bind();
    renderAccount();
    renderLocked();
    renderSharedEvents();
    publishAccess();
    if (!db) return;
    const result = await db.auth.getSession();
    await authChanged(result.data.session || null);
    db.auth.onAuthStateChange((_event, session) => setTimeout(() => authChanged(session), 0));
  }

  init().catch((error) => {
    console.error('Peleja cloud init:', error);
    const stateEl = $('#rankingSyncState');
    if (stateEl) stateEl.textContent = 'Falha ao iniciar modo online';
  });
})();
