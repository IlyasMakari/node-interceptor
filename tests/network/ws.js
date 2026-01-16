require('./../../network_interceptor')((req, res) => {
  console.log({
    request: req,
    response: res
  });
});

const WebSocket = require('ws');

const ws = new WebSocket('wss://ws.ifelse.io');

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'greeting', payload: 'Hello, WebSocket!' }));
});

ws.on('message', (data) => {
    ws.close();
});

ws.on('error', console.error);
