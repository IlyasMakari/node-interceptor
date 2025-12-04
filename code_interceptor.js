// code_interceptor.js
// Usage: require('./code_interceptor')(logger)
// logger(type, input)

module.exports = function setupCodeInterceptor(logger = console.log) {
    // ---------------------- eval ----------------------
    const originalEval = global.eval;
    global.eval = function (input) {
        logger('eval', input);
        return originalEval(input);
    };

    // ---------------------- Function constructor ----------------------
    const OriginalFunction = Function;
    function InterceptedFunction(...args) {
        const body = args[args.length - 1];
        logger('Function', body);
        return OriginalFunction.apply(this, args);
    }
    global.Function = InterceptedFunction;
    // Ensure all existing functions, including Number, String, etc.,
    // see the intercepted constructor via .constructor
    InterceptedFunction.prototype = OriginalFunction.prototype;
    OriginalFunction.prototype.constructor = InterceptedFunction;

    // ---------------------- setTimeout / setInterval ----------------------
    const originalSetTimeout = global.setTimeout;
    global.setTimeout = function (fn, delay, ...rest) {
        if (typeof fn === 'string') logger('setTimeout', fn);
        return originalSetTimeout(fn, delay, ...rest);
    };

    const originalSetInterval = global.setInterval;
    global.setInterval = function (fn, delay, ...rest) {
        if (typeof fn === 'string') logger('setInterval', fn);
        return originalSetInterval(fn, delay, ...rest);
    };

    // ---------------------- vm methods ----------------------
    try {
        const vm = require('vm');

        const originalRunInThisContext = vm.runInThisContext;
        vm.runInThisContext = function (code, ...rest) {
            logger('vm.runInThisContext', code);
            return originalRunInThisContext.call(vm, code, ...rest);
        };

        const OriginalScript = vm.Script;
        vm.Script = function (code, ...rest) {
            logger('vm.Script', code);
            return new OriginalScript(code, ...rest);
        };
        vm.Script.prototype = OriginalScript.prototype;

        const originalRunInNewContext = vm.runInNewContext;
        vm.runInNewContext = function (code, ...rest) {
            logger('vm.runInNewContext', code);
            return originalRunInNewContext.call(vm, code, ...rest);
        };
    } catch { }

    // ---------------------- child_process ----------------------
    try {
        const cp = require('child_process');

        const wrap = (name) => {
            const original = cp[name];
            if (!original) return;
            cp[name] = function (...args) {
                logger(`child_process.${name}`, args[0]);
                return original.apply(cp, args);
            };
        };

        wrap('exec');
        wrap('execSync');
        wrap('spawn');
        wrap('spawnSync');
        wrap('execFile');
        wrap('execFileSync');
    } catch { }

    // ---------------------- require ----------------------
    const originalRequire = module.constructor.prototype.require;
    module.constructor.prototype.require = function (path) {
        logger('require', path);
        return originalRequire.call(this, path);
    };

};
