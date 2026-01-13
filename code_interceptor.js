// code_interceptor.js
// Usage: require('./code_interceptor')(logger)
// logger(type, input)

module.exports = function setupCodeInterceptor(logger = console.log) {
  const STATE = { disabled: false };

  function safeLog(type, input) {
    const prev = STATE.disabled;
    STATE.disabled = true;
    try {
      logger(type, input);
    } finally {
      STATE.disabled = prev;
    }
  }

  // ---------------------- eval ----------------------
  const oeval = global.eval;
  global.eval = function (input) {
    if (!STATE.disabled) safeLog('eval', input);
    return oeval(input);
  };

  // ---------------------- Function ----------------------
  const OFunction = global.Function;
  function InterceptedFunction(...args) {
    if (!STATE.disabled) safeLog('Function', args[args.length - 1]);
    return OFunction.apply(this, args);
  }
  InterceptedFunction.prototype = OFunction.prototype;
  OFunction.prototype.constructor = InterceptedFunction;
  global.Function = InterceptedFunction;

  // ---------------------- Timers ----------------------
  const oST = global.setTimeout;
  global.setTimeout = function (fn, delay, ...r) {
    if (!STATE.disabled && typeof fn === 'string') safeLog('setTimeout', fn);
    return oST(fn, delay, ...r);
  };

  const oSI = global.setInterval;
  global.setInterval = function (fn, delay, ...r) {
    if (!STATE.disabled && typeof fn === 'string') safeLog('setInterval', fn);
    return oSI(fn, delay, ...r);
  };

  // ---------------------- vm ----------------------
  try {
    const vm = require('vm');

    const o1 = vm.runInThisContext;
    vm.runInThisContext = function (code, ...r) {
      if (!STATE.disabled) safeLog('vm.runInThisContext', code);
      return o1.call(vm, code, ...r);
    };

    const OS = vm.Script;
    vm.Script = function (code, ...r) {
      if (!STATE.disabled) safeLog('vm.Script', code);
      return new OS(code, ...r);
    };
    vm.Script.prototype = OS.prototype;

    const o2 = vm.runInNewContext;
    vm.runInNewContext = function (code, ...r) {
      if (!STATE.disabled) safeLog('vm.runInNewContext', code);
      return o2.call(vm, code, ...r);
    };
  } catch {}

  // ---------------------- child_process ----------------------
  try {
    const cp = require('child_process');
    for (const k of ['exec','execSync','spawn','spawnSync','execFile','execFileSync']) {
      if (!cp[k]) continue;
      const o = cp[k];
      cp[k] = function (...a) {
        if (!STATE.disabled) safeLog(`child_process.${k}`, a[0]);
        return o.apply(cp, a);
      };
    }
  } catch {}

  // ---------------------- require ----------------------
  const oreq = module.constructor.prototype.require;
  module.constructor.prototype.require = function (p) {
    if (!STATE.disabled) safeLog('require', p);
    return oreq.call(this, p);
  };
};
