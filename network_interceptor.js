// network_interceptor.js
// Usage: const interceptor = require('./network_interceptor')(loggerFn);
// Logger receives: logger(requestInfo, responseInfo)

module.exports = function setupInterceptors(logger = console.log) {
  const http = require('http');
  const https = require('https');

  function logPair(requestInfo, responseInfo) {
    logger(requestInfo, responseInfo);
  }

  function attachResponseLogger(req, requestInfo) {
    req.on('response', (res) => {
      let responseData = '';
      res.on('data', (chunk) => (responseData += chunk.toString()));
      res.on('end', () => {
        const responseInfo = {
          statusCode: res.statusCode,
          headers: res.headers,
          body: responseData,
        };
        logPair(requestInfo, responseInfo);
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

  // ------------------------ HTTP ------------------------
  const originalHttpRequest = http.request;
  http.request = function (...args) {
    const options = typeof args[0] === 'string' ? { url: args[0] } : args[0];
    const requestInfo = { transport: 'http', options, method: options.method || 'GET', headers: options.headers || {} };
    const req = originalHttpRequest.apply(http, args);
    return wrapRequest(req, requestInfo);
  };

  const originalHttpGet = http.get;
  http.get = function (...args) {
    const options = typeof args[0] === 'string' ? { url: args[0] } : args[0];
    const requestInfo = { transport: 'http', options, method: 'GET', headers: options.headers || {} };
    const req = originalHttpGet.apply(http, args);
    return wrapRequest(req, requestInfo);
  };

  // ------------------------ HTTPS ------------------------
  const originalHttpsRequest = https.request;
  https.request = function (...args) {
    const options = typeof args[0] === 'string' ? { url: args[0] } : args[0];
    const requestInfo = { transport: 'https', options, method: options.method || 'GET', headers: options.headers || {} };
    const req = originalHttpsRequest.apply(https, args);
    return wrapRequest(req, requestInfo);
  };

  const originalHttpsGet = https.get;
  https.get = function (...args) {
    const options = typeof args[0] === 'string' ? { url: args[0] } : args[0];
    const requestInfo = { transport: 'https', options, method: 'GET', headers: options.headers || {} };
    const req = originalHttpsGet.apply(https, args);
    return wrapRequest(req, requestInfo);
  };

  // ------------------------ FETCH ------------------------
  if (typeof global.fetch === 'function') {
    const originalFetch = global.fetch;
    global.fetch = async function (url, opts = {}) {
      const requestInfo = {
        transport: 'fetch',
        url,
        method: opts.method || 'GET',
        headers: opts.headers || {},
        body: opts.body || '',
      };

      const res = await originalFetch(url, opts);

      const cloned = res.clone();
      let body = await cloned.text();

      const responseInfo = {
        statusCode: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        body,
      };

      logPair(requestInfo, responseInfo);
      return res;
    };
  }

  // ------------------------ AXIOS ------------------------
  try {
    const axios = require('axios');
    axios.interceptors.request.use((config) => {
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
      const requestInfo = response.config.__requestInfo;
      const responseInfo = {
        statusCode: response.status,
        headers: response.headers,
        body: response.data,
      };
      logPair(requestInfo, responseInfo);
      return response;
    });
  } catch {}
};