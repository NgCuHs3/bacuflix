export function createDoubleBack(timeout, onReset) {
  let timer = 0;
  let pendingAction = null;

  function reset() {
    window.clearTimeout(timer);
    timer = 0;
    pendingAction = null;
    if (onReset) {
      onReset();
    }
  }

  return {
    handle(onPrompt, onConfirm) {
      if (pendingAction) {
        const action = pendingAction;
        reset();
        action();
        return;
      }

      pendingAction = onConfirm;
      if (onPrompt) {
        onPrompt();
      }
      timer = window.setTimeout(reset, timeout);
    },
    reset,
    destroy: reset
  };
}
