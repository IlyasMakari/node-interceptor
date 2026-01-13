require('./../../network_interceptor')((req, res) => {
    fetch('https://api.ipify.org?format=json');
    console.log('This log is from the first interceptor');
    console.log({ request: req, response: res });
});

require('./../../network_interceptor')((req, res) => {
    fetch('https://api.ipify.org?format=json');
    console.log('This log is from the second interceptor');
    console.log({ request: req, response: res });
});

(async () => {
  const res = await fetch('https://api.ipify.org?format=json');
  const json = await res.json();
  console.log('FETCH Response:', json);
})();