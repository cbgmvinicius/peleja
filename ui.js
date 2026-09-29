/* Modal focus management shared by local forms and account/result dialogs. */
(() => {
  const modals = [...document.querySelectorAll('.modal-backdrop')];
  const stack = [];
  const returnFocus = new WeakMap();
  const pendingFocus = new WeakMap();
  let previousFocus = document.activeElement;
  document.addEventListener('focusin', (event) => {
    const modal = event.target.closest('.modal-backdrop');
    if (modal && !stack.includes(modal) && !pendingFocus.has(modal)) pendingFocus.set(modal, previousFocus);
    previousFocus = event.target;
  });
  const shell = document.querySelector('.app-shell');
  const isOpen = (el) => el.classList.contains('open') ||
    (el.id === 'accountModal' && document.body.dataset.accessState === 'locked');
  const controls = (modal) => [...modal.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')]
    .filter((el) => !el.disabled && el.tabIndex >= 0 && !el.closest('[hidden],[inert]') &&
      getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.type !== 'hidden');
  function refresh() {
    let restore;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (!isOpen(stack[i])) {
        restore ||= returnFocus.get(stack[i]);
        stack.splice(i, 1);
      }
    }
    for (const modal of modals) if (isOpen(modal) && !stack.includes(modal)) {
      returnFocus.set(modal, pendingFocus.get(modal) || document.activeElement);
      pendingFocus.delete(modal);
      stack.push(modal);
    }
    const top = stack.at(-1);
    shell.inert = Boolean(top);
    document.body.classList.toggle('has-open-modal', Boolean(top));
    modals.forEach((modal) => { modal.inert = Boolean(top && modal !== top); });
    if (top && !top.contains(document.activeElement)) {
      const dialog = top.querySelector('[role="dialog"]');
      dialog.tabIndex = -1;
      (controls(top)[0] || dialog).focus();
    } else if (!top && restore?.isConnected && !restore.closest('[inert],[hidden]')) restore.focus();
  }
  new MutationObserver(refresh).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class', 'data-access-state'] });
  document.addEventListener('keydown', (event) => {
    const top = stack.at(-1);
    if (!top) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation();
      if (top.id !== 'accountModal' || document.body.dataset.accessState !== 'locked') top.querySelector('button[id^="close"]')?.click();
    }
    if (event.key === 'Tab') {
      const items = controls(top);
      const first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !items.includes(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    }
  }, true);
  refresh();
})();
