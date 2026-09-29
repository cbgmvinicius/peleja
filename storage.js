(() => {
  'use strict';

  // One atomic document per identity. Legacy keys remain untouched for recovery.
  const LEGACY_KEYS = ['medstudy_materials_v1', 'medstudy_exams_v1', 'medstudy_simulations_v1'];
  const PREFIX = 'peleja_account_v1:';
  const LOCAL_OWNER = 'local:vinicius';
  const BACKUP_KEY = 'peleja_legacy_backup_v1:vinicius';
  const cfg = globalThis.PELEJA_BACKEND || {};
  let legacyOwnerId = String(cfg.legacyOwnerUserId || '');
  const localOnly = location.protocol === 'file:';
  let scope = null;
  let generation = 0;

  function keyFor(identity) { return PREFIX + encodeURIComponent(identity); }
  function validateValues(values) {
    for (const key of LEGACY_KEYS) {
      if (values[key] != null && !Array.isArray(JSON.parse(values[key]))) {
        throw new Error('Histórico inválido; os dados originais foram preservados.');
      }
    }
    return values;
  }
  function record(identity) {
    const raw = localStorage.getItem(keyFor(identity));
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    if (parsed.version !== 1 || parsed.owner !== identity || !parsed.values) {
      throw new Error('Não foi possível validar o histórico desta conta.');
    }
    validateValues(parsed.values);
    return parsed;
  }
  function saveRecord(identity, values, metadata = {}) {
    const payload = { ...metadata, version: 1, owner: identity, values: validateValues(values) };
    localStorage.setItem(keyFor(identity), JSON.stringify(payload));
  }
  function legacyValues() {
    return validateValues(Object.fromEntries(LEGACY_KEYS.map(key => [key, localStorage.getItem(key)])));
  }
  function migrateOwner(identity) {
    if (record(identity)) return; // Never overwrite a pre-existing account history.
    const local = identity !== LOCAL_OWNER ? record(LOCAL_OWNER) : null;
    const values = local ? { ...local.values } : legacyValues();
    if (!LEGACY_KEYS.some(key => values[key] != null)) return;
    // Backup must succeed before the new record is written. Quota errors abort migration.
    if (localStorage.getItem(BACKUP_KEY) == null) {
      localStorage.setItem(BACKUP_KEY, JSON.stringify({
        version: 1, owner: LOCAL_OWNER, createdAt: new Date().toISOString(), values: legacyValues(),
      }));
    }
    saveRecord(identity, values, { dirty: true, catalogDirty: true, migratedFrom: local ? LOCAL_OWNER : 'legacy', migratedAt: new Date().toISOString() });
  }
  function isLegacyOwner(userId) {
    return Boolean(legacyOwnerId) && String(userId) === legacyOwnerId;
  }
  function changeScope(next) {
    if (scope === next) return;
    scope = next;
    generation++;
    window.dispatchEvent(new CustomEvent('peleja:storage-changed', { detail: { scope, generation } }));
  }

  const store = {
    localOnly,
    get scope() { return scope; },
    get generation() { return generation; },
    get userId() { return scope?.startsWith('user:') ? scope.slice(5) : null; },
    get writable() { return scope !== null; },
    get isLocalOwner() { return scope === LOCAL_OWNER; },
    isLegacyOwner,
    setLegacyOwnerId(id) { if (id) legacyOwnerId = String(id); },
    matchesUser(userId) { return Boolean(userId) && scope === 'user:' + userId; },
    activateUser(userId) {
      if (!userId || typeof userId !== 'string') throw new Error('Identidade de usuário inválida.');
      const next = 'user:' + userId;
      if (isLegacyOwner(userId)) migrateOwner(next);
      record(next); // Validate before exposing or overwriting any saved data.
      changeScope(next);
    },
    deactivate() { changeScope(null); },
    getItem(key) {
      if (!LEGACY_KEYS.includes(key)) throw new Error('Chave pessoal desconhecida.');
      return scope ? (record(scope)?.values[key] ?? null) : null;
    },
    setItem(key, value, { seed = false } = {}) {
      if (!scope) return false; // No authenticated owner: no personal persistence.
      if (!LEGACY_KEYS.includes(key)) throw new Error('Chave pessoal desconhecida.');
      const current = record(scope);
      if (current?.values[key] === value) return false;
      saveRecord(scope, { ...(current?.values || {}), [key]: value }, { ...(current || {}), dirty: Boolean(current?.dirty || !seed) });
      return true;
    },
    snapshot() {
      const current = scope ? record(scope) : null;
      const payload = Object.fromEntries(['materials','exams','simulations'].map((name,index) => [name, JSON.parse(current?.values[LEGACY_KEYS[index]] || '[]')]));
      return { payload, revision: current?.revision || 0, catalogRevision: current?.catalogRevision || 0,
        dirty: Boolean(current?.dirty), catalogDirty: Boolean(current?.catalogDirty) };
    },
    markCatalogDirty() {
      if (!scope) return;
      const current = record(scope);
      saveRecord(scope, current?.values || {}, { ...(current || {}), dirty: true, catalogDirty: true });
    },
    replaceRemote(payload, revision, catalogRevision) {
      if (!scope) throw new Error('Nenhuma conta ativa.');
      const previous = record(scope);
      if (previous?.dirty) localStorage.setItem(keyFor(scope) + ':recovery', JSON.stringify(previous));
      const values = Object.fromEntries(LEGACY_KEYS.map((key,index) => [key, JSON.stringify(payload[['materials','exams','simulations'][index]] || [])]));
      saveRecord(scope, values, { revision, catalogRevision, dirty: false, catalogDirty: false });
      window.dispatchEvent(new CustomEvent('peleja:storage-changed', { detail: { scope, generation } }));
    },
    markSynced(sent, revision, catalogRevision) {
      const current = record(scope);
      const unchanged = JSON.stringify(store.snapshot().payload) === JSON.stringify(sent);
      saveRecord(scope, current.values, { ...current, revision, catalogRevision,
        dirty: !unchanged, catalogDirty: unchanged ? false : current.catalogDirty });
    },
    setCatalogRevision(revision) {
      if (!scope) return;
      const current = record(scope);
      saveRecord(scope, current?.values || {}, { ...(current || {}), catalogRevision: revision });
    },
    canImport(owner) {
      if (!scope) return false;
      if (owner === scope) return true;
      // Old/unlabelled exports and the local owner's export belong only to Vinícius.
      return (!owner || owner === LOCAL_OWNER) && (scope === LOCAL_OWNER || isLegacyOwner(store.userId));
    },
  };
  globalThis.PELEJA_STORAGE = Object.freeze(store);
  if (localOnly) {
    migrateOwner(LOCAL_OWNER);
    changeScope(LOCAL_OWNER);
  }
})();
