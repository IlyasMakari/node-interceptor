require('../../code_interceptor.js')((type, input) => {console.log({ type, input }); });

setTimeout("console.log('timeout test')", 10);
// setInterval("console.log('interval test')", 10);