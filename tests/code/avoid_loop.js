require('../../code_interceptor.js')((type, input) => {
    eval("console.log('eval test')");
    console.log({ type, input });
});

const vm = require('vm');
vm.runInThisContext("console.log('vm this context test')");
new vm.Script("console.log('vm script test')").runInThisContext();
vm.runInNewContext("console.log('vm new context test')", {});