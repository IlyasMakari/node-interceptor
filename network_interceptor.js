// network_interceptor.js
// Usage: const interceptor = require('./network_interceptor')(loggerFn);
// Logger receives: logger(requestInfo, responseInfo)

module.exports = function setupInterceptors(logger = console.log) {
  const http = require('http');
  const https = require('https');

  const STATE = { disabled: false };

  function safeLog(req, res) {
    const prev = STATE.disabled;
    STATE.disabled = true;
    try {
      logger(req, res);
    } finally {
      STATE.disabled = prev;
    }
  }

  // ------------------------ HTTP ------------------------
  const ohreq = http.request;
  http.request = function (...args) {
    if (STATE.disabled) return ohreq.apply(http, args);

    const opts = typeof args[0] === 'string' ? { url: args[0] } : args[0];
    const reqInfo = {
      transport: 'http',
      options: opts,
      method: opts.method || 'GET',
      headers: opts.headers || {},
      body: '',
    };

    const req = ohreq.apply(http, args);

    const ow = req.write;
    req.write = function (chunk, ...r) {
      if (chunk) reqInfo.body += chunk.toString();
      return ow.call(req, chunk, ...r);
    };

    const oe = req.end;
    req.end = function (chunk, ...r) {
      if (chunk) reqInfo.body += chunk.toString();
      return oe.call(req, chunk, ...r);
    };

    req.on('response', (res) => {
      let body = '';
      res.on('data', (c) => (body += c.toString()));
      res.on('end', () => {
        safeLog(reqInfo, {
          statusCode: res.statusCode,
          headers: res.headers,
          body,
        });
      });
    });

    return req;
  };

  http.get = function (...args) {
    if (STATE.disabled) return http.request(...args).end();
    return http.request(...args);
  };

  // ------------------------ HTTPS ------------------------
  const ohsreq = https.request;
  https.request = function (...args) {
    if (STATE.disabled) return ohsreq.apply(https, args);

    const opts = typeof args[0] === 'string' ? { url: args[0] } : args[0];
    const reqInfo = {
      transport: 'https',
      options: opts,
      method: opts.method || 'GET',
      headers: opts.headers || {},
      body: '',
    };

    const req = ohsreq.apply(https, args);

    const ow = req.write;
    req.write = function (chunk, ...r) {
      if (chunk) reqInfo.body += chunk.toString();
      return ow.call(req, chunk, ...r);
    };

    const oe = req.end;
    req.end = function (chunk, ...r) {
      if (chunk) reqInfo.body += chunk.toString();
      return oe.call(req, chunk, ...r);
    };

    req.on('response', (res) => {
      let body = '';
      res.on('data', (c) => (body += c.toString()));
      res.on('end', () => {
        safeLog(reqInfo, {
          statusCode: res.statusCode,
          headers: res.headers,
          body,
        });
      });
    });

    return req;
  };

  https.get = function (...args) {
    if (STATE.disabled) return https.request(...args).end();
    return https.request(...args);
  };

  // ------------------------ FETCH ------------------------
  if (typeof global.fetch === 'function') {
    const originalFetch = global.fetch;

    global.fetch = async function (url, opts = {}) {
      if (STATE.disabled) {
        return originalFetch(url, opts);
      }

      const reqInfo = {
        transport: 'fetch',
        url,
        method: opts.method || 'GET',
        headers: opts.headers || {},
        body: opts.body || '',
      };

      const res = await originalFetch(url, opts);
      const clone = res.clone();
      const body = await clone.text();

      safeLog(reqInfo, {
        statusCode: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        body,
      });

      return res;
    };
  }

  // ------------------------ AXIOS ------------------------
  try {
    const axios = require('axios');

    axios.interceptors.request.use((config) => {
      if (STATE.disabled) return config;
      config.__reqInfo = {
        transport: 'axios',
        url: config.url,
        method: config.method,
        headers: config.headers,
        body: config.data,
      };
      return config;
    });

    axios.interceptors.response.use((res) => {
      if (!STATE.disabled && res.config.__reqInfo) {
        safeLog(res.config.__reqInfo, {
          statusCode: res.status,
          headers: res.headers,
          body: res.data,
        });
      }
      return res;
    });
  } catch {}
};
