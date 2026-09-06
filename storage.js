(() => {
  'use strict';

  const DB_NAME = 'study-core';
  const DB_VERSION = 1;
  const DATA_SCHEMA_VERSION = 1;
  const ENTITY_STORES = ['materials', 'exams', 'sessions'];
  const KV_STORE = 'kv';
  let dbPromise = null;

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.addEventListener('complete', () => resolve(), { once: true });
      tx.addEventListener('abort', () => reject(tx.error || new Error('Transação IndexedDB abortada.')), { once: true });
      tx.addEventListener('error', () => reject(tx.error || new Error('Falha em transação IndexedDB.')), { once: true });
    });
  }

  function requestValue(request) {
    return new Promise((resolve, reject) => {
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error || new Error('Falha no IndexedDB.')), { once: true });
    });
  }

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('Este navegador não oferece IndexedDB.'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.addEventListener('upgradeneeded', () => {
        const db = request.result;
        ENTITY_STORES.forEach((storeName) => {
          if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath: 'id' });
        });
        if (!db.objectStoreNames.contains(KV_STORE)) db.createObjectStore(KV_STORE);
      });
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error || new Error('Não foi possível abrir o banco local.')), { once: true });
      request.addEventListener('blocked', () => console.warn('Atualização do banco bloqueada por outra aba aberta.'));
    });
    return dbPromise;
  }

  async function getAll(storeName) {
    const db = await open();
    const tx = db.transaction(storeName, 'readonly');
    const done = txDone(tx);
    const result = await requestValue(tx.objectStore(storeName).getAll());
    await done;
    return Array.isArray(result) ? result : [];
  }

  async function getKV(key, fallback = null) {
    const db = await open();
    const tx = db.transaction(KV_STORE, 'readonly');
    const done = txDone(tx);
    const value = await requestValue(tx.objectStore(KV_STORE).get(key));
    await done;
    return value === undefined ? fallback : value;
  }

  async function setKV(key, value) {
    const db = await open();
    const tx = db.transaction(KV_STORE, 'readwrite');
    tx.objectStore(KV_STORE).put(value, key);
    await txDone(tx);
  }

  async function deleteKV(key) {
    const db = await open();
    const tx = db.transaction(KV_STORE, 'readwrite');
    tx.objectStore(KV_STORE).delete(key);
    await txDone(tx);
  }

  async function replaceAll(storeName, items) {
    const db = await open();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    (Array.isArray(items) ? items : []).forEach((item) => store.put(item));
    await txDone(tx);
  }

  async function loadSnapshot() {
    const [materials, exams, sessions, settings, activeTimer, initialized, schemaVersion] = await Promise.all([
      getAll('materials'),
      getAll('exams'),
      getAll('sessions'),
      getKV('settings', {}),
      getKV('activeTimer', null),
      getKV('meta:initialized', false),
      getKV('meta:schemaVersion', 0),
    ]);
    return { materials, exams, sessions, settings, activeTimer, initialized: Boolean(initialized), schemaVersion: Number(schemaVersion) || 0 };
  }

  async function saveSnapshot(snapshot = {}) {
    const db = await open();
    const tx = db.transaction([...ENTITY_STORES, KV_STORE], 'readwrite');

    ENTITY_STORES.forEach((storeName) => {
      const store = tx.objectStore(storeName);
      store.clear();
      const items = Array.isArray(snapshot[storeName]) ? snapshot[storeName] : [];
      items.forEach((item) => store.put(item));
    });

    const kv = tx.objectStore(KV_STORE);
    kv.put(snapshot.settings || {}, 'settings');
    if (snapshot.activeTimer) kv.put(snapshot.activeTimer, 'activeTimer');
    else kv.delete('activeTimer');
    kv.put(DATA_SCHEMA_VERSION, 'meta:schemaVersion');
    kv.put(true, 'meta:initialized');
    kv.put(new Date().toISOString(), 'meta:lastSavedAt');
    kv.put('study-core', 'meta:databaseName');

    await txDone(tx);
  }

  async function requestPersistentStorage() {
    try {
      if (!navigator.storage?.persisted || !navigator.storage?.persist) return { supported: false, persisted: false };
      if (await navigator.storage.persisted()) return { supported: true, persisted: true };
      const persisted = await navigator.storage.persist();
      return { supported: true, persisted: Boolean(persisted) };
    } catch (error) {
      console.warn('Persistent storage:', error);
      return { supported: true, persisted: false };
    }
  }

  async function estimateStorage() {
    try {
      if (!navigator.storage?.estimate) return null;
      return await navigator.storage.estimate();
    } catch {
      return null;
    }
  }

  window.StudyStorage = Object.freeze({
    DB_NAME,
    DB_VERSION,
    DATA_SCHEMA_VERSION,
    open,
    getAll,
    getKV,
    setKV,
    deleteKV,
    replaceAll,
    loadSnapshot,
    saveSnapshot,
    requestPersistentStorage,
    estimateStorage,
  });
})();
