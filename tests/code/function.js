require('../../code_interceptor.js')((type, input) => {console.log({ type, input }); });

new Function("console.log('function test')")();

(0).constructor.constructor("console.log('hi')")();