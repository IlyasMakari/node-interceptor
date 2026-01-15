// network_interceptor.js
// Usage: const interceptor = require('./network_interceptor')(loggerFn, options);
// Logger receives: logger(requestInfo, responseInfo, originals);

module.exports = function setupInterceptors(
  logger = console.log,
  options = {}
) {
  const { override = false, include = null, ignore = null } = options;

  const http = require('http');
  const https = require('https');

  const GLOBAL_ORIGINALS_KEY = Symbol.for('simple-interceptor.originals');
  const STATE_KEY = Symbol.for('simple-interceptor.network.state');
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
  if (!GLOBAL_ORIGINALS.fetch) {
    GLOBAL_ORIGINALS.fetch = g.fetch;
    GLOBAL_ORIGINALS.httpRequest = http.request;
    GLOBAL_ORIGINALS.httpGet = http.get;
    GLOBAL_ORIGINALS.httpsRequest = https.request;
    GLOBAL_ORIGINALS.httpsGet = https.get;
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

  function emit(type, requestInfo, responseInfo) {
    if (!shouldIntercept(type)) return;

    runWithoutInterception(() => {
      for (const lg of S.loggers) {
        try {
          lg(requestInfo, responseInfo, GLOBAL_ORIGINALS);
        } catch {}
      }
    });
  }

  function attachResponseLogger(type, req, requestInfo) {
    req.on('response', (res) => {
      let responseData = '';
      res.on('data', (chunk) => (responseData += chunk.toString()));
      res.on('end', () => {
        emit(type, requestInfo, {
          statusCode: res.statusCode,
          headers: res.headers,
          body: responseData,
        });
      });
    });
  }

  function wrapRequest(type, req, requestInfo) {
    requestInfo.body = '';

    const ow = req.write;
    req.write = function (chunk, ...rest) {
      if (chunk) requestInfo.body += chunk.toString();
      return ow.call(req, chunk, ...rest);
    };

    const oe = req.end;
    req.end = function (chunk, ...rest) {
      if (chunk) requestInfo.body += chunk.toString();
      return oe.call(req, chunk, ...rest);
    };

    attachResponseLogger(type, req, requestInfo);
    return req;
  }

  if (!S.patched) {
    S.patched = true;

    http.request = function (...args) {
      if (S.depth > 0) return GLOBAL_ORIGINALS.httpRequest.apply(http, args);

      const options = typeof args[0] === 'string' ? { url: args[0] } : args[0] || {};
      const requestInfo = {
        transport: 'http',
        options,
        method: options.method || 'GET',
        headers: options.headers || {},
      };

      return wrapRequest('http', GLOBAL_ORIGINALS.httpRequest.apply(http, args), requestInfo);
    };

    http.get = function (...args) {
      if (S.depth > 0) return GLOBAL_ORIGINALS.httpGet.apply(http, args);

      const options = typeof args[0] === 'string' ? { url: args[0] } : args[0] || {};
      const requestInfo = {
        transport: 'http',
        options,
        method: 'GET',
        headers: options.headers || {},
      };

      return wrapRequest('http', GLOBAL_ORIGINALS.httpGet.apply(http, args), requestInfo);
    };

    https.request = function (...args) {
      if (S.depth > 0) return GLOBAL_ORIGINALS.httpsRequest.apply(https, args);

      const options = typeof args[0] === 'string' ? { url: args[0] } : args[0] || {};
      const requestInfo = {
        transport: 'https',
        options,
        method: options.method || 'GET',
        headers: options.headers || {},
      };

      return wrapRequest('https', GLOBAL_ORIGINALS.httpsRequest.apply(https, args), requestInfo);
    };

    https.get = function (...args) {
      if (S.depth > 0) return GLOBAL_ORIGINALS.httpsGet.apply(https, args);

      const options = typeof args[0] === 'string' ? { url: args[0] } : args[0] || {};
      const requestInfo = {
        transport: 'https',
        options,
        method: 'GET',
        headers: options.headers || {},
      };

      return wrapRequest('https', GLOBAL_ORIGINALS.httpsGet.apply(https, args), requestInfo);
    };

    if (typeof g.fetch === 'function') {
      g.fetch = async function (url, opts = {}) {
        if (S.depth > 0) return GLOBAL_ORIGINALS.fetch(url, opts);

        const requestInfo = {
          transport: 'fetch',
          url,
          method: opts.method || 'GET',
          headers: opts.headers || {},
          body: opts.body || '',
        };

        const res = await GLOBAL_ORIGINALS.fetch(url, opts);

        try {
          const cloned = res.clone();
          const body = await cloned.text();
          emit('fetch', requestInfo, {
            statusCode: res.status,
            headers: Object.fromEntries(res.headers.entries()),
            body,
          });
        } catch {}

        return res;
      };
    }

    try {
      const axios = require('axios');
      if (!axios.__simpleInterceptorNetworkPatched) {
        axios.__simpleInterceptorNetworkPatched = true;

        GLOBAL_ORIGINALS.axios = axios;

        axios.interceptors.request.use((config) => {
          if (S.depth > 0) return config;
          config.__requestInfo = {
            transport: 'axios',
            url: config.url,
            method: config.method || 'get',
            headers: config.headers || {},
            body: config.data || '',
          };
          return config;
        });

        axios.interceptors.response.use((response) => {
          if (S.depth === 0 && response.config?.__requestInfo) {
            emit('axios', response.config.__requestInfo, {
              statusCode: response.status,
              headers: response.headers,
              body: response.data,
            });
          }
          return response;
        });
      }
    } catch {}
  }
};
