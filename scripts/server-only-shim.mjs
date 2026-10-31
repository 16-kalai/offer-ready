/**
 * Preload for scripts that run app server code outside Next (worker, evals).
 * `server-only` exists to keep modules out of browser bundles; a Node script
 * is already server-side, so it resolves to an empty module here. This lets
 * scripts run with normal Node conditions (React's server renderer, used for
 * emails, refuses to load under the react-server condition).
 */
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const EMPTY = pathToFileURL(new URL("./empty-module.cjs", import.meta.url).pathname).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: EMPTY, format: "commonjs", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
