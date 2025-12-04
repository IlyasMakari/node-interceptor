require('./../../network_interceptor')((req, res) => {console.log({ request: req, response: res }); });

const axios = require('axios');
axios.get('https://api.ipify.org?format=json').then(res => {
  console.log('AXIOS Response:', res.data);
});