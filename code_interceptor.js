// code_interceptor.js
// Usage: require('./code_interceptor')(logger)
// logger(type, input)

module.exports = function setupCodeInterceptor(logger = console.log) {
  const STATE_KEY = Symbol.for('simple-interceptor.code.state');
  const g = globalThis;

  if (!g[STATE_KEY]) {
    g[STATE_KEY] = {
      patched: false,
      depth: 0,
      loggers: new Set(),
      originals: {
        eval: g.eval,
        Function: g.Function,
        setTimeout: g.setTimeout,
        setInterval: g.setInterval,
      },
    };
  }

  const S = g[STATE_KEY];
  S.loggers.add(typeof logger === 'function' ? logger : console.log);

  function runWithoutInterception(fn) {
    S.depth++;
    try {
      return fn();
    } finally {
      S.depth--;
    }
  }

  function emit(type, input) {
    runWithoutInterception(() => {
      for (const lg of S.loggers) {
        try {
          lg(type, input);
        } catch {
          // swallow
        }
      }
    });
  }

  if (!S.patched) {
    S.patched = true;

    // ---------------------- eval ----------------------
    g.eval = function (input) {
      if (S.depth === 0) emit('eval', input);
      return S.originals.eval(input);
    };

    // ---------------------- Function constructor ----------------------
    const OriginalFunction = S.originals.Function;

    function InterceptedFunction(...args) {
      const body = args[args.length - 1];
      if (S.depth === 0) emit('Function', body);
      return OriginalFunction.apply(this, args);
    }

    g.Function = InterceptedFunction;
    InterceptedFunction.prototype = OriginalFunction.prototype;
    OriginalFunction.prototype.constructor = InterceptedFunction;

    // ---------------------- setTimeout / setInterval ----------------------
    g.setTimeout = function (fn, delay, ...rest) {
      if (S.depth === 0 && typeof fn === 'string') emit('setTimeout', fn);
      return S.originals.setTimeout(fn, delay, ...rest);
    };

    g.setInterval = function (fn, delay, ...rest) {
      if (S.depth === 0 && typeof fn === 'string') emit('setInterval', fn);
      return S.originals.setInterval(fn, delay, ...rest);
    };

    // ---------------------- vm methods ----------------------
    try {
      const vm = require('vm');

      const originalRunInThisContext = vm.runInThisContext;
      vm.runInThisContext = function (code, ...rest) {
        if (S.depth === 0) emit('vm.runInThisContext', code);
        return originalRunInThisContext.call(vm, code, ...rest);
      };

      const OriginalScript = vm.Script;
      vm.Script = function (code, ...rest) {
        if (S.depth === 0) emit('vm.Script', code);
        return new OriginalScript(code, ...rest);
      };
      vm.Script.prototype = OriginalScript.prototype;

      const originalRunInNewContext = vm.runInNewContext;
      vm.runInNewContext = function (code, ...rest) {
        if (S.depth === 0) emit('vm.runInNewContext', code);
        return originalRunInNewContext.call(vm, code, ...rest);
      };
    } catch {}

    // ---------------------- child_process ----------------------
    try {
      const cp = require('child_process');

      const wrap = (name) => {
        const original = cp[name];
        if (!original) return;
        cp[name] = function (...args) {
          if (S.depth === 0) emit(`child_process.${name}`, args[0]);
          return original.apply(cp, args);
        };
      };

      wrap('exec');
      wrap('execSync');
      wrap('spawn');
      wrap('spawnSync');
      wrap('execFile');
      wrap('execFileSync');
    } catch {}

    // ---------------------- require ----------------------
    const originalRequire = module.constructor.prototype.require;
    module.constructor.prototype.require = function (path) {
      if (S.depth === 0) emit('require', path);
      return originalRequire.call(this, path);
    };
  }
};
