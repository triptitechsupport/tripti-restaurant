// Starts only the local processes used by this integration. Run from project root
// with: node --env-file=apps/api/.env scripts/rksv/start-local.mjs
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
process.env.HOST='127.0.0.1';
fs.mkdirSync('.rksv-test/logs',{recursive:true});
const launch=(name, executable, args, cwd) => {
  const output=fs.openSync(`.rksv-test/logs/${name}.log`,'a');
  const child=spawn(executable,args,{cwd,env:process.env,detached:true,windowsHide:true,stdio:['ignore',output,output]});
  child.unref(); console.log(`${name} PID ${child.pid}`);
};
launch('pocketbase',path.join(root,'apps/pocketbase/pocketbase.exe'),['serve','--http=127.0.0.1:8090','--encryptionEnv=PB_ENCRYPTION_KEY','--hooksWatch=false'],path.join(root,'apps/pocketbase'));
launch('api',process.execPath,['--env-file=.env','src/main.js'],path.join(root,'apps/api'));
try {await fetch('http://127.0.0.1:3000',{signal:AbortSignal.timeout(2000)});}
catch {launch('web',process.execPath,['../../node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3000'],path.join(root,'apps/web'));}
