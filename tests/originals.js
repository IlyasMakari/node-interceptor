require('../code_interceptor.js')((type, input) => {console.log({ type, input }); });
require('./../network_interceptor')((req, res, originals) => {
    console.log({ request: req, response: res, originals });
});

(async () => {
  const res = await fetch('https://api.ipify.org?format=json');
  const json = await res.json();
  console.log('FETCH Response:', json);
  eval("console.log('eval test')");
})();