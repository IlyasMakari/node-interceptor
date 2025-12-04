require('../../code_interceptor.js')((type, input) => {console.log({ type, input }); });

const cp = require('child_process');
cp.exec('echo exec_test');
cp.execSync('echo execsync_test');
cp.spawn('echo', ['spawn_test']);
cp.spawnSync('echo', ['spawnsync_test']);
cp.execFile('echo', ['execfile_test']);
cp.execFileSync('echo', ['execfilesync_test']);