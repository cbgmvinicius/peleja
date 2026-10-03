(() => {
  'use strict';

  const personalStore = globalThis.PELEJA_STORAGE;
  if (!personalStore) throw new Error('Armazenamento por conta indisponível.');

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
  function isPublicKey(value) {
    const key = String(value || '');
    if (key.startsWith('sb_publishable_')) return true;
    try { return JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'; }
    catch { return false; }
  }
  const factory = globalThis.supabase;
  const configured = Boolean(
    !personalStore.localOnly &&
    factory && factory.createClient &&
    /^https:\/\//i.test(String(cfg.supabaseUrl || '')) &&
    isPublicKey(cfg.supabasePublishableKey)
  );
  const db = configured
    ? factory.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

  const state = {
    session: null,
    authRevision: 0,
    profile: null,
    tab: 'simulations',
    data: null,
    syncing: false,
    timer: null,
    activeSimulationKey: null,
    activeEntryMode: 'answers',
    accessAllowed: personalStore.localOnly,
    invites: [],
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const html = (value) => String(value == null ? '' : value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);

  function read(key) {
    try {
      const value = JSON.parse(personalStore.getItem(key) || '[]');
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
    return !personalStore.localOnly;
  }

  function updateAccessGate() {
    const granted = !hostedMode() || (configured && Boolean(state.session?.user) && state.accessAllowed);
    const wasLocked = document.body.dataset.accessState === 'locked';
    document.body.dataset.accessState = granted ? 'granted' : 'locked';
    const modal = $('#accountModal');
    if (!granted && modal) {
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
    } else if (granted && wasLocked && modal) {
      // The automatic login gate is no longer needed. Explicit account opens
      // while already signed in remain under the user's control.
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
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
    const text = 'O acesso online está sendo preparado. Vinícius avisará quando as contas estiverem disponíveis.';
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
    const title = $('#accountModalTitle');
    const subtitle = $('#accountModalSubtitle');
    const storageNote = $('#storageModeNote');
    if (title) title.textContent = signed ? 'Minha conta' : 'Entrar no Peleja';
    if (subtitle) subtitle.textContent = signed ? 'Gerencie a sincronização dos seus dados.' : 'Use o usuário e a senha fornecidos por Vinícius.';
    if (storageNote) storageNote.textContent = personalStore.localOnly
      ? 'Modo local: seu progresso fica salvo neste navegador. Exporte backups para guardá-lo.'
      : signed ? 'Seu progresso é salvo neste navegador e sincronizado com sua conta. Alterações pendentes aparecem no painel.'
        : 'Entre na sua conta para acessar e sincronizar seu progresso.';
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
      if (email) email.textContent = 'Usuário: ' + (state.session.user.email || '').split('@')[0];
      if (role) role.textContent = isAdmin() ? 'Administrador do Peleja' : 'Participante';
    }
    const adminPanel = $('#inviteAdminPanel');
    if (adminPanel) adminPanel.hidden = !isAdmin();

    updateAccessGate();
    publishAccess();
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

  function accountContext() {
    const userId = state.session?.user?.id;
    if (!state.accessAllowed || !personalStore.matchesUser(userId)) return null;
    return { userId, revision: state.authRevision, generation: personalStore.generation };
  }

  function sameAccount(account) {
    return Boolean(account) && state.accessAllowed && state.authRevision === account.revision &&
      state.session?.user?.id === account.userId && personalStore.matchesUser(account.userId) &&
      personalStore.generation === account.generation;
  }

  function assertAccount(account) {
    if (!sameAccount(account)) throw new Error('A conta mudou; a operação anterior foi interrompida.');
  }

  async function loadProfile(user, revision) {
    if (!db || !user) return;
    const result = await db.from('profiles').select('id,display_name,role').eq('id', user.id).maybeSingle();
    if (result.error) throw result.error;
    if (revision !== state.authRevision) return;
    if (result.data) return result.data;
    throw new Error('Perfil ainda não configurado. Peça a Vinícius para concluir a criação das contas.');
  }

  async function login(event) {
    event.preventDefault();
    if (!db) return message('Configure o Supabase antes de entrar.', 'error');
    const username = $('#loginUsername').value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!['vinicius', 'wilton', 'ulisses', 'jonas', 'tiago'].includes(username)) return message('Usuário ou senha inválidos.', 'error');
    message('Entrando…');
    const result = await db.auth.signInWithPassword({
      email: username + '@peleja.invalid',
      password: $('#loginPassword').value,
    });
    if (result.error) return message(result.error.message, 'error');
    message('Verificando autorização…');
  }

  async function logout() {
    if (!db) return;
    await authChanged(null);
    await db.auth.signOut();
  }

  async function restoreWorkspace(workspace, { force = false } = {}) {
    const local = personalStore.snapshot();
    if (workspace.payload) {
      if (local.dirty && !force && local.revision !== workspace.revision) {
        throw new Error('CONFLICT: há alterações locais e em outro aparelho. Exporte um backup antes de recarregar da nuvem.');
      }
      if (!local.dirty || force) personalStore.replaceRemote(workspace.payload, workspace.revision, workspace.catalog_revision);
    }
    const current = personalStore.snapshot();
    if (!current.catalogDirty && workspace.catalog_revision > 0) {
      globalThis.PELEJA_APP.applySharedCatalog(workspace.catalog);
      personalStore.setCatalogRevision(workspace.catalog_revision);
    } else if (current.catalogDirty && current.catalogRevision !== workspace.catalog_revision) {
      throw new Error('CONFLICT: a estrutura também mudou na nuvem. Exporte um backup antes de recarregar.');
    }
  }

  async function reloadWorkspace() {
    const account = accountContext();
    if (!account) return;
    if (personalStore.snapshot().dirty && !window.confirm('Há alterações locais. Exporte um backup antes de continuar. Substituir pelos dados da nuvem?')) return;
    try {
      const result = await db.rpc('get_workspace'); assertAccount(account);
      if (result.error) throw result.error;
      if (!result.data.payload) return message('Ainda não há histórico desta conta na nuvem.', 'error');
      await restoreWorkspace(result.data, { force: true }); assertAccount(account);
      await loadRanking();
      syncNotice('');
      message('Dados da nuvem carregados.', 'success');
    } catch (error) { if (sameAccount(account)) message(error.message, 'error'); }
  }

  async function sync({ quiet = false } = {}) {
    const account = accountContext();
    if (!db || !account) {
      if (!quiet) message('Entre na conta para sincronizar os dados.', 'error');
      return;
    }
    if (state.syncing) {
      if (!quiet) message('Uma sincronização já está em andamento. Aguarde.', '');
      return;
    }
    const snapshot = personalStore.snapshot();
    if (!snapshot.dirty && !snapshot.catalogDirty) {
      if (!quiet) message('Não há alterações locais pendentes de envio.', 'success');
      return;
    }
    state.syncing = account;
    if (!quiet) message('Sincronizando dados…', '');
    let saved = false;
    const syncState = $('#rankingSyncState');
    if (syncState) syncState.textContent = 'Sincronizando…';
    try {
      const result = await db.rpc('save_workspace', {
        p_owner: account.userId,
        p_payload: snapshot.payload, p_revision: snapshot.revision,
        p_catalog_revision: snapshot.catalogRevision, p_publish_catalog: isAdmin() && snapshot.catalogDirty,
      });
      assertAccount(account);
      if (result.error) throw result.error;
      personalStore.markSynced(snapshot.payload, result.data.revision, result.data.catalog_revision);
      saved = true;
      syncNotice(personalStore.snapshot().dirty ? 'Enviando as alterações mais recentes…' : '');
      if (syncState) syncState.textContent = 'Dados sincronizados';
      if (!quiet) message('Progresso e resultados salvos na nuvem.', 'success');
    } catch (error) {
      if (!sameAccount(account)) return;
      if (syncState) syncState.textContent = 'Alterações locais ainda não sincronizadas';
      syncNotice('Alterações guardadas neste aparelho, mas ainda não enviadas. ' + error.message, true);
      message(error.message, 'error');
    } finally {
      if (state.syncing === account) state.syncing = false;
      if (saved && sameAccount(account) && personalStore.snapshot().dirty) scheduleSync();
    }
  }


  globalThis.PELEJA_CLOUD_BACKUP = {
    async exportAttempts() {
      const account = accountContext();
      if (!db || !account || personalStore.localOnly) return null;
      const result = await db.rpc('export_own_attempts'); assertAccount(account);
      if (result.error) throw result.error;
      return result.data;
    },
    async restore(backup) {
      const account = accountContext();
      if (!db || !account || state.syncing) throw new Error('Entre na conta e aguarde a sincronização antes de restaurar.');
      const snapshot = personalStore.snapshot();
      state.syncing = account;
      try {
        const result = await db.rpc('restore_personal_backup', {p_backup: backup, p_revision: snapshot.revision, p_catalog_revision: snapshot.catalogRevision});
        assertAccount(account); if (result.error) throw result.error;
        const current = personalStore.snapshot();
        if (JSON.stringify(current.payload) !== JSON.stringify(snapshot.payload)) {
          throw new Error('Backup restaurado na nuvem. Há alterações locais feitas durante a restauração; exporte-as antes de recarregar.');
        }
        const remote = await db.rpc('get_workspace'); assertAccount(account);
        if (remote.error) throw remote.error;
        await restoreWorkspace(remote.data, {force: true});
        await loadRanking();
      } finally { if (state.syncing === account) state.syncing = false; }
    },
  };
  function syncNotice(text, error = false) {
    const el = $('#cloudSyncNotice');
    if (!el) return;
    el.textContent = text; el.hidden = !text; el.dataset.error = String(error);
  }

  function scheduleSync() {
    clearTimeout(state.timer);
    const account = accountContext();
    if (!account) return;
    if (personalStore.snapshot().dirty) syncNotice('Alterações salvas neste aparelho. Aguardando sincronização…');
    state.timer = setTimeout(async () => {
      if (!sameAccount(account)) return;
      await sync({ quiet: true });
      if (!sameAccount(account)) return;
      if ($('#rankingView')?.classList.contains('active')) await loadRanking();
    }, 1200);
  }

  async function readPages(table, columns, order, userId = null) {
    const account = accountContext();
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      assertAccount(account);
      let query = db.from(table).select(columns);
      for (const column of order) query = query.order(column, { ascending: true });
      if (userId) query = query.eq('user_id', userId);
      const page = await query.range(offset, offset + 499);
      assertAccount(account);
      if (page.error) return page;
      rows.push(...(page.data || []));
      if ((page.data || []).length < 500) return { data: rows };
    }
  }

  async function loadRanking() {
    const account = accountContext();
    if (!db || !account) return renderLocked();
    const syncState = $('#rankingSyncState');
    if (syncState) syncState.textContent = 'Atualizando ranking…';
    try {
      const userId = account.userId;
      const [profiles, catalogs, questions, answers, votes, simulations, manualSimulations, university, materials, bases] = await Promise.all([
        readPages('profiles', 'id,display_name,role', ['id']),
        readPages('simulation_catalog', 'key,name,date,created_by', ['key']),
        readPages('simulation_questions', 'simulation_key,question_number,official_answer,accepted_area', ['simulation_key','question_number']),
        readPages('simulation_user_answers', 'user_id,simulation_key,question_number,answer', ['user_id','simulation_key','question_number'], userId),
        readPages('simulation_area_votes', 'user_id,simulation_key,question_number,area', ['user_id','simulation_key','question_number']),
        readPages('simulation_results', 'user_id,simulation_key,total,correct,wrong,area_stats,updated_at', ['user_id','simulation_key']),
        readPages('simulation_manual_results', 'user_id,simulation_key,total,correct,wrong,area_stats,updated_at,basis', ['user_id','simulation_key']),
        readPages('university_results', 'user_id,exam_key,exam_name,exam_date,area,total,correct,wrong,updated_at', ['user_id','exam_key']),
        readPages('material_area_results', 'user_id,area,total,correct,wrong', ['user_id','area']),
        db.rpc('simulation_bases'),
      ]);
      if (!sameAccount(account)) return;
      const failed = [profiles, catalogs, questions, answers, votes, simulations, manualSimulations, university, materials, bases].find((x) => x.error);
      if (failed) throw failed.error;
      state.data = {
        bases: bases.data || {},
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
      renderPersonalSimulationSummary();
      if (syncState) syncState.textContent = 'Ranking atualizado';
    } catch (error) {
      if (!sameAccount(account)) return;
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
    (state.data?.manualSimulations || []).filter(row => row.basis && row.basis === state.data.bases[row.simulation_key]).forEach((row) => put(row, 'quick'));
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
        rankAccuracy: row.total ? row.correct / row.total * 100 : 0,
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
    const complete = fullComplete || Boolean(manual?.basis && manual.basis === state.data?.bases[key]);
    const ready = questions.length > 0 && questions.every((q) => String(q.official_answer || '').trim());
    return { questions, valid, answered, fullComplete, manual, complete, ready };
  }

  function renderPersonalSimulationSummary() {
    const account = accountContext();
    if (!account || !state.data) return false;
    const own = mergedSimulationResults().filter(row => row.user_id === account.userId);
    const total = own.reduce((n, row) => n + Number(row.total), 0);
    const correct = own.reduce((n, row) => n + Number(row.correct), 0);
    $('#simulationCountKpi').textContent = own.length;
    $('#simulationCountNote').textContent = own.length + ' resultados registrados';
    $('#simulationAccuracyKpi').textContent = total ? (100 * correct / total).toFixed(1) + '%' : '—';
    $('#simulationAccuracyNote').textContent = correct + '/' + total + ' acertos';
    const areas = new Map();
    own.forEach(row => Object.entries(row.area_stats || {}).forEach(([name, item]) => {
      const current = areas.get(name) || { name, correct: 0, total: 0 };
      current.correct += Number(item.correct) || 0; current.total += Number(item.answered) || 0;
      areas.set(name, current);
    }));
    const sorted = [...areas.values()].filter(x => x.total > 0).sort((a,b) => a.correct/a.total - b.correct/b.total);
    for (const [kind, item] of [['Weak',sorted[0]],['Strong',sorted.at(-1)]]) {
      $('#simulation' + kind + 'AreaKpi').textContent = item?.name || '—';
      $('#simulation' + kind + 'AreaNote').textContent = item ? item.correct + '/' + item.total + ' acertos' : 'Sem dados por área';
    }
    $('#simulationAreaStats').innerHTML = sorted.map(item => {
      const percent = (100 * item.correct / item.total).toFixed(1);
      return '<div class="simulation-area-row"><div class="simulation-area-copy"><strong>' + html(item.name) + '</strong><span>' + item.correct + '/' + item.total + ' acertos</span></div><div class="simulation-area-track"><i style="width:' + percent + '%"></i></div><b>' + percent + '%</b></div>';
    }).join('') || '<div class="empty-state compact">Nenhum resultado por área neste perfil.</div>';
    const shown = isAdmin() ? state.data.catalogs : state.data.catalogs.filter(event => own.some(row => row.simulation_key === event.key));
    $('#simulationsList').innerHTML = shown.map(event => {
      const result = own.find(row => row.simulation_key === event.key);
      const id = event.key.startsWith('res::') ? event.key.slice(5) : '';
      const actions = isAdmin() && id ? '<div><button class="ghost-button" data-action="edit-simulation" data-id="' + html(id) + '">Editar evento</button><button class="ghost-button" data-action="delete-simulation" data-id="' + html(id) + '">Excluir evento</button></div>' : '';
      return '<article class="simulation-card"><div class="simulation-card-heading"><div><h4>' + html(event.name) + '</h4><p>' + html(event.date || '') + '</p></div></div><p>' + (result ? result.correct + '/' + result.total + ' acertos · ' + (100 * result.correct / result.total).toFixed(1) + '%' : 'Sem resultado pessoal') + '</p>' + actions + '</article>';
    }).join('') || '<div class="empty-state compact">Registre seu resultado em um evento compartilhado.</div>';
    return true;
  }
  globalThis.PELEJA_RENDER_SIMULATION_SUMMARY = renderPersonalSimulationSummary;

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
    const account = accountContext();
    if (!account || !state.data) return openAccount();
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
    $('#saveSharedSimulationButton').disabled = false;
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
    if (validation) {
      const manual = (state.data.manualSimulations || []).find(r => r.user_id === account.userId && r.simulation_key === key);
      validation.textContent = manual && manual.basis !== state.data.bases[key] ? 'A classificação ou o gabarito mudou. Revise e salve novamente o resultado rápido.' : '';
    }
    const modal = $('#sharedSimulationModal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  async function saveSharedSimulation(event) {
    event.preventDefault();
    const account = accountContext();
    if (!db || !account || !state.activeSimulationKey) return;
    const key = state.activeSimulationKey;
    const mode = $('#sharedEntryMode').value === 'quick' ? 'quick' : 'answers';
    const answers = {}, votes = {}, areas = {};
    const validation = $('#sharedSimulationValidation');
    const button = $('#saveSharedSimulationButton');
    let correct = null;
    if (mode === 'quick') {
      const raw = $('#sharedQuickCorrect').value.trim();
      if (!raw || !Number.isInteger(Number(raw))) { validation.textContent = 'Informe os acertos totais.'; return; }
      correct = Number(raw);
      for (const input of document.querySelectorAll('#sharedQuickAreas [data-quick-area]')) {
        if (input.value.trim()) areas[input.dataset.quickArea] = Number(input.value);
      }
    } else {
      for (const row of document.querySelectorAll('#sharedSimulationRows .shared-question-row')) {
        const number = row.dataset.question;
        const answer = row.querySelector('[data-shared-field="answer"]').value;
        const area = row.querySelector('[data-shared-field="area"]').value;
        if (answer) answers[number] = answer;
        if (area) votes[number] = area;
      }
    }
    validation.textContent = 'Salvando…'; button.disabled = true;
    try {
      const result = await db.rpc('save_simulation_attempt', {
        p_owner: account.userId,
        p_key: key, p_mode: mode, p_answers: answers, p_votes: votes, p_correct: correct,
        p_areas: areas, p_basis: state.data.bases[key],
      });
      assertAccount(account);
      if (result.error) throw result.error;
      await loadRanking(); assertAccount(account);
      openSharedSimulation(key);
      validation.textContent = 'Resultado salvo. O ranking foi atualizado.';
    } catch (error) { if (sameAccount(account)) validation.textContent = error.message; }
    finally { if (sameAccount(account)) button.disabled = false; }
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
    if (rankNote) rankNote.textContent = me >= 0 ? 'pela % do recorte e área selecionados' : 'Bronze → Lendário';

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

  async function authChanged(session, event) {
    // Supabase can confirm the same session when a tab regains focus.
    // Keep drafts and in-flight saves; a real identity change still resets them.
    if (['SIGNED_IN', 'TOKEN_REFRESHED'].includes(event) &&
        session?.user?.id === state.session?.user?.id && accountContext()) {
      state.session = session;
      return;
    }
    syncNotice('');
    const revision = ++state.authRevision;
    const stillCurrent = () => revision === state.authRevision;
    clearTimeout(state.timer);
    state.timer = null;
    state.syncing = false;
    state.session = session;
    state.profile = null;
    state.data = null;
    state.invites = [];
    state.activeSimulationKey = null;
    state.accessAllowed = personalStore.localOnly;
    renderAccount();
    closeSharedSimulation();
    if (!personalStore.localOnly && !personalStore.matchesUser(session?.user?.id)) personalStore.deactivate();
    updateAccessGate();
    publishAccess();
    renderLocked();
    renderSharedEvents();
    if (session?.user && db) {
      try {
        const access = await db.rpc('has_peleja_access');
        if (!stillCurrent()) return;
        if (access.error) throw access.error;
        if (!access.data) throw new Error('Esta conta não está autorizada a acessar o Peleja.');
        const profile = await loadProfile(session.user, revision);
        if (!stillCurrent()) return;
        const workspace = await db.rpc('get_workspace');
        if (!stillCurrent()) return;
        if (workspace.error) throw workspace.error;
        personalStore.setLegacyOwnerId(workspace.data.legacy_owner_id);
        state.profile = profile;
        // Switch local identity before enabling writes or starting any upload.
        personalStore.activateUser(session.user.id);
        await restoreWorkspace(workspace.data);
        if (!stillCurrent()) return;
        if (workspace.data.catalog_revision === 0 && session.user.id === workspace.data.legacy_owner_id) personalStore.markCatalogDirty();
        state.accessAllowed = true;
        publishAccess();

        if (!stillCurrent()) return;
        await sync({ quiet: true });
        if (!stillCurrent()) return;
        await loadRanking();
      } catch (error) {
        if (!stillCurrent()) return;
        console.error('Peleja account:', error);
        if (String(error.message).includes('CONFLICT') && personalStore.matchesUser(session.user.id)) {
          state.accessAllowed = true;
        } else {
          state.accessAllowed = false; state.profile = null; personalStore.deactivate();
        }
        message(error.message, 'error');
      }
    }
    if (!stillCurrent()) return;
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
    $('#loginForm')?.addEventListener('submit', login);
    $('#logoutButton')?.addEventListener('click', logout);
    $('#reloadCloudButton')?.addEventListener('click', reloadWorkspace);
    $('#syncAccountButton')?.addEventListener('click', async () => { await sync(); await loadRanking(); });
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
    fillAreaFilter();
    bind();
    renderAccount();
    renderLocked();
    renderSharedEvents();
    publishAccess();
    if (!db) return;
    db.auth.onAuthStateChange((event, session) => setTimeout(() => authChanged(session, event), 0));
    const revision = state.authRevision;
    const result = await db.auth.getSession();
    if (revision === state.authRevision) await authChanged(result.data.session || null);
  }

  init().catch((error) => {
    console.error('Peleja cloud init:', error);
    const stateEl = $('#rankingSyncState');
    if (stateEl) stateEl.textContent = 'Falha ao iniciar modo online';
  });
})();
