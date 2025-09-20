export function useRunApp() {
  // In the research-oriented experience man no longer boots local preview apps
  // or streams runtime output. The legacy hook now returns a collection of
  // no-op callbacks so existing components that still call into it continue to
  // function without triggering errors. This keeps the refactor focused on the
  // new academic workflows while avoiding a sweeping removal of the hook.
  const noopAsync = async () => {};
  const noop = () => {};

  return {
    runApp: noopAsync,
    stopApp: noopAsync,
    restartApp: noopAsync,
    refreshAppIframe: noopAsync,
    loading: false,
    app: null,
    onHotModuleReload: noop,
  };
}
