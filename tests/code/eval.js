require('../../code_interceptor.js')((type, input) => {console.log({ type, input }); });

eval("console.log('eval test')");