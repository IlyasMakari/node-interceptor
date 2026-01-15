// code_interceptor.js
// Usage: require('./code_interceptor')(logger, options)
// logger(type, input, originals)

module.exports = function setupCodeInterceptor(
  logger = console.log,
  options = {}
) {
  const { override = false, include = null, ignore = null } = options;

  const GLOBAL_ORIGINALS_KEY = Symbol.for('simple-interceptor.originals');
  const STATE_KEY = Symbol.for('simple-interceptor.code.state');
  const g = globalThis;

  // Shared originals registry
  if (!g[GLOBAL_ORIGINALS_KEY]) {
    g[GLOBAL_ORIGINALS_KEY] = {};
  }
  const GLOBAL_ORIGINALS = g[GLOBAL_ORIGINALS_KEY];

  if (!g[STATE_KEY]) {
    g[STATE_KEY] = {
      patched: false,
      depth: 0,
      loggers: new Set(),
      originals: GLOBAL_ORIGINALS
    };
  }

  const S = g[STATE_KEY];
  const effectiveLogger = typeof logger === 'function' ? logger : console.log;

  if (override) S.loggers.clear();
  S.loggers.add(effectiveLogger);

  // Register originals (only once)
  if (!GLOBAL_ORIGINALS.eval) {
    GLOBAL_ORIGINALS.eval = g.eval;
    GLOBAL_ORIGINALS.Function = g.Function;
    GLOBAL_ORIGINALS.setTimeout = g.setTimeout;
    GLOBAL_ORIGINALS.setInterval = g.setInterval;
    GLOBAL_ORIGINALS.require = module.constructor.prototype.require;
  }

  const shouldIntercept = (type) => {
    if (Array.isArray(include) && !include.includes(type)) return false;
    if (Array.isArray(ignore) && ignore.includes(type)) return false;
    return true;
  };

  function runWithoutInterception(fn) {
    S.depth++;
    try {
      return fn();
    } finally {
      S.depth--;
    }
  }

  function emit(type, input) {
    if (!shouldIntercept(type)) return;

    runWithoutInterception(() => {
      for (const lg of S.loggers) {
        try {
          lg(type, input, GLOBAL_ORIGINALS);
        } catch {}
      }
    });
  }

  if (!S.patched) {
    S.patched = true;

    g.eval = function (input) {
      if (S.depth === 0) emit('eval', input);
      return GLOBAL_ORIGINALS.eval(input);
    };

    const OriginalFunction = GLOBAL_ORIGINALS.Function;
    function InterceptedFunction(...args) {
      if (S.depth === 0) emit('Function', args.at(-1));
      return OriginalFunction.apply(this, args);
    }
    g.Function = InterceptedFunction;
    InterceptedFunction.prototype = OriginalFunction.prototype;
    OriginalFunction.prototype.constructor = InterceptedFunction;

    g.setTimeout = function (fn, delay, ...rest) {
      if (S.depth === 0 && typeof fn === 'string') emit('setTimeout', fn);
      return GLOBAL_ORIGINALS.setTimeout(fn, delay, ...rest);
    };

    g.setInterval = function (fn, delay, ...rest) {
      if (S.depth === 0 && typeof fn === 'string') emit('setInterval', fn);
      return GLOBAL_ORIGINALS.setInterval(fn, delay, ...rest);
    };

    try {
      const vm = require('vm');

      if (!GLOBAL_ORIGINALS.vm) {
        GLOBAL_ORIGINALS.vm = {
          runInThisContext: vm.runInThisContext,
          runInNewContext: vm.runInNewContext,
          Script: vm.Script
        };
      }

      vm.runInThisContext = function (code, ...rest) {
        if (S.depth === 0) emit('vm.runInThisContext', code);
        return GLOBAL_ORIGINALS.vm.runInThisContext.call(vm, code, ...rest);
      };

      vm.runInNewContext = function (code, ...rest) {
        if (S.depth === 0) emit('vm.runInNewContext', code);
        return GLOBAL_ORIGINALS.vm.runInNewContext.call(vm, code, ...rest);
      };

      vm.Script = function (code, ...rest) {
        if (S.depth === 0) emit('vm.Script', code);
        return new GLOBAL_ORIGINALS.vm.Script(code, ...rest);
      };
      vm.Script.prototype = GLOBAL_ORIGINALS.vm.Script.prototype;
    } catch {}

    try {
      const cp = require('child_process');

      if (!GLOBAL_ORIGINALS.child_process) {
        GLOBAL_ORIGINALS.child_process = {};
        ['exec','execSync','spawn','spawnSync','execFile','execFileSync'].forEach((k) => {
          GLOBAL_ORIGINALS.child_process[k] = cp[k];
        });
      }

      const wrap = (name) => {
        if (!cp[name]) return;
        cp[name] = function (...args) {
          if (S.depth === 0) emit(`child_process.${name}`, args[0]);
          return GLOBAL_ORIGINALS.child_process[name].apply(cp, args);
        };
      };

      ['exec','execSync','spawn','spawnSync','execFile','execFileSync'].forEach(wrap);
    } catch {}

    module.constructor.prototype.require = function (path) {
      if (S.depth === 0) emit('require', path);
      return GLOBAL_ORIGINALS.require.call(this, path);
    };
  }
};
