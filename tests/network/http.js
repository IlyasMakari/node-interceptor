require('./../../network_interceptor')((req, res) => {console.log({ request: req, response: res }); });
const http = require('http');

http.get('http://api.ipify.org?format=json', (res) => {
  let d = '';
  res.on('data', c => d += c);
});

// POST request
const postData = JSON.stringify({ test: 'data' });
const options = {
  hostname: 'postman-echo.com',
  port: 443,
  path: '/post',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};
const req = http.request(options, (res) => {
  let d = '';
  res.on('data', c => d += c);
});
req.on('error', (e) => {
  console.error('HTTP Request Error:', e);
});
req.write(postData);
req.end();
