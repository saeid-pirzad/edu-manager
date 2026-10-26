"use strict";

// Stable compatibility facade. Public entry points never change identity;
// implementations are installed once after the workspace has been assembled.
globalThis.EduRuntimeAPI = (() => {
  let implementations = null;
  return Object.freeze({
    install(handlers) {
      if (implementations) throw Error("Runtime API is already installed");
      const entries = Object.entries(handlers);
      if (entries.some(([, handler]) => typeof handler !== "function"))
        throw TypeError("Runtime API handlers must be functions");
      implementations = Object.freeze(Object.fromEntries(entries));
    },
    invoke(name, fallback, receiver, args) {
      const handler =
        implementations && Object.hasOwn(implementations, name)
          ? implementations[name]
          : fallback;
      if (typeof handler !== "function")
        throw Error("Runtime API is not ready: " + name);
      return Reflect.apply(handler, receiver, args);
    },
  });
})();
