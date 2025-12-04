require('./../../network_interceptor')((req, res) => {console.log({ request: req, response: res }); });

(async () => {
  const res = await fetch('https://api.ipify.org?format=json');
  const json = await res.json();
  console.log('FETCH Response:', json);
})();