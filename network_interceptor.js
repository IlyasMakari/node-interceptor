// network_interceptor.js
// Usage: const interceptor = require('./network_interceptor')(loggerFn);
// Logger receives: logger(requestInfo, responseInfo)

module.exports = function setupInterceptors(logger = console.log) {
  const http = require('http');
  const https = require('https');

  const STATE_KEY = Symbol.for('simple-interceptor.network.state');
  const g = globalThis;

  if (!g[STATE_KEY]) {
    g[STATE_KEY] = {
      patched: false,
      depth: 0, // re-entrancy counter: >0 means "bypass interception"
      loggers: new Set(),
      originals: {
        fetch: g.fetch,
        httpRequest: http.request,
        httpGet: http.get,
        httpsRequest: https.request,
        httpsGet: https.get,
      },
    };
  }

  const S = g[STATE_KEY];

  // Register this logger (multiple calls add multiple loggers)
  S.loggers.add(typeof logger === 'function' ? logger : console.log);

  function runWithoutInterception(fn) {
    S.depth++;
    try {
      return fn();
    } finally {
      S.depth--;
    }
  }

  function emit(requestInfo, responseInfo) {
    // While calling user loggers, bypass interception globally
    runWithoutInterception(() => {
      for (const lg of S.loggers) {
        try {
          lg(requestInfo, responseInfo);
        } catch {
          // Swallow logger errors to avoid breaking the app/instrumentation
        }
      }
    });
  }

  function attachResponseLogger(req, requestInfo) {
    req.on('response', (res) => {
      let responseData = '';
      res.on('data', (chunk) => (responseData += chunk.toString()));
      res.on('end', () => {
        emit(requestInfo, {
          statusCode: res.statusCode,
          headers: res.headers,
          body: responseData,
        });
      });
    });
  }

  function wrapRequest(req, requestInfo) {
    requestInfo.body = '';

    const originalWrite = req.write;
    req.write = function (chunk, ...rest) {
      if (chunk) requestInfo.body += chunk.toString();
      return originalWrite.call(req, chunk, ...rest);
    };

    const originalEnd = req.end;
    req.end = function (chunk, ...rest) {
      if (chunk) requestInfo.body += chunk.toString();
      return originalEnd.call(req, chunk, ...rest);
    };

    attachResponseLogger(req, requestInfo);
    return req;
  }

  // Patch only once globally
  if (!S.patched) {
    S.patched = true;

    // ------------------------ HTTP ------------------------
    http.request = function (...args) {
      if (S.depth > 0) return S.originals.httpRequest.apply(http, args);

      const options = typeof args[0] === 'string' ? { url: args[0] } : (args[0] || {});
      const requestInfo = {
        transport: 'http',
        options,
        method: options.method || 'GET',
        headers: options.headers || {},
      };

      const req = S.originals.httpRequest.apply(http, args);
      return wrapRequest(req, requestInfo);
    };

    http.get = function (...args) {
      if (S.depth > 0) return S.originals.httpGet.apply(http, args);

      const options = typeof args[0] === 'string' ? { url: args[0] } : (args[0] || {});
      const requestInfo = {
        transport: 'http',
        options,
        method: 'GET',
        headers: options.headers || {},
      };

      const req = S.originals.httpGet.apply(http, args);
      return wrapRequest(req, requestInfo);
    };

    // ------------------------ HTTPS ------------------------
    https.request = function (...args) {
      if (S.depth > 0) return S.originals.httpsRequest.apply(https, args);

      const options = typeof args[0] === 'string' ? { url: args[0] } : (args[0] || {});
      const requestInfo = {
        transport: 'https',
        options,
        method: options.method || 'GET',
        headers: options.headers || {},
      };

      const req = S.originals.httpsRequest.apply(https, args);
      return wrapRequest(req, requestInfo);
    };

    https.get = function (...args) {
      if (S.depth > 0) return S.originals.httpsGet.apply(https, args);

      const options = typeof args[0] === 'string' ? { url: args[0] } : (args[0] || {});
      const requestInfo = {
        transport: 'https',
        options,
        method: 'GET',
        headers: options.headers || {},
      };

      const req = S.originals.httpsGet.apply(https, args);
      return wrapRequest(req, requestInfo);
    };

    // ------------------------ FETCH ------------------------
    if (typeof g.fetch === 'function') {
      const originalFetch = S.originals.fetch;

      g.fetch = async function (url, opts = {}) {
        // If we're inside any logger callback, bypass interception
        if (S.depth > 0) return originalFetch(url, opts);

        const requestInfo = {
          transport: 'fetch',
          url,
          method: (opts && opts.method) || 'GET',
          headers: (opts && opts.headers) || {},
          body: (opts && opts.body) || '',
        };

        const res = await originalFetch(url, opts);

        // Read body via clone so we don't consume original
        try {
          const cloned = res.clone();
          const body = await cloned.text();

          emit(requestInfo, {
            statusCode: res.status,
            headers: Object.fromEntries(res.headers.entries()),
            body,
          });
        } catch {
          // Ignore cloning/body-read errors
        }

        return res;
      };
    }

    // ------------------------ AXIOS ------------------------
    // Patch only once; multiple setups just add loggers to the set.
    try {
      const axios = require('axios');

      if (!axios.__simpleInterceptorNetworkPatched) {
        axios.__simpleInterceptorNetworkPatched = true;

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
          if (S.depth === 0) {
            const requestInfo = response.config && response.config.__requestInfo;
            if (requestInfo) {
              emit(requestInfo, {
                statusCode: response.status,
                headers: response.headers,
                body: response.data,
              });
            }
          }
          return response;
        });
      }
    } catch {}
  }

};
