import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url)),directory=resolve(root,process.env.SOUND_VALIDATION_DIR||'docs/sound-validation');
await mkdir(directory,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'a-view-sound-firefox-'));
const holds=new Set();let result=null;
const pixel=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');
const release=res=>{res.writeHead(200,{'Content-Type':'image/gif'});res.end(pixel);};
const server=createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/result'&&req.method==='POST'){
      let body='';for await(const chunk of req){body+=chunk;if(body.length>20000)throw new Error('Oversized test result');}
      result=JSON.parse(body);await writeFile(join(directory,'firefox-results.json'),JSON.stringify(result,null,2)+'\n');
      res.end('ok');for(const waiting of holds)release(waiting);holds.clear();return;
    }
    if(req.method!=='GET'){res.writeHead(405);res.end();return;}
    if(pathname==='/wait.gif'){
      // Firefox's screenshot CLI waits for window.load, but not module awaits.
      // Hold a tiny image until the offline-rendered results have been saved.
      if(result)release(res);else holds.add(res);return;
    }
    if(pathname==='/'){
      res.writeHead(200,{'Content-Type':'text/html'});res.end(`<!doctype html><html><meta charset="utf-8"><title>Firefox sound check</title>
<style>body{margin:32px;background:#18281e;color:#edf0dc;font:16px/1.5 monospace}pre{white-space:pre-wrap}</style>
<h1>Firefox sound signal checks</h1><img src="/wait.gif" hidden><pre id="results">Rendering…</pre>
<script type="module">
import {measureSoundMix,soundMixChecks} from '/dev/sound-mix-check.js';
let report;
try{report={browser:navigator.userAgent,results:soundMixChecks(await measureSoundMix())};}
catch(error){report={browser:navigator.userAgent,error:error.stack};}
document.querySelector('#results').textContent=JSON.stringify(report,null,2);
await fetch('/result',{method:'POST',body:JSON.stringify(report)});
</script></html>`);return;
    }
    const folder=resolve(root,pathname.startsWith('/shared/')?'shared':'public');
    const path=resolve(folder,decodeURIComponent(pathname.slice(pathname.startsWith('/shared/')?8:1)));
    if(!path.startsWith(folder+sep)){res.writeHead(403);res.end();return;}
    const body=await readFile(path);res.writeHead(200,{'Content-Type':'text/javascript'});res.end(body);
  }catch(error){res.writeHead(500);res.end(error.message);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const child=spawn(process.env.FIREFOX_EXECUTABLE||'C:\\Program Files\\Mozilla Firefox\\firefox.exe',[
  '--headless','--no-remote','--profile',profile,'--screenshot',join(directory,'firefox-signal-check.png'),'--window-size','1200,1200',`http://127.0.0.1:${server.address().port}/`
],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let log='';child.stdout.on('data',chunk=>{log+=chunk;});child.stderr.on('data',chunk=>{log+=chunk;});
const timer=setTimeout(()=>{child.kill();server.closeAllConnections();},45000);
try{
  const code=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});
  if(code!==0||!result||result.error)throw new Error(result?.error||log||'Firefox did not finish rendering');
  for(const check of result.results)console.log(`${check.pass?'PASS':'FAIL'} Firefox: ${check.name} (${check.detail.marginDb.toFixed(1)} dB)`);
  if(result.results.some(check=>!check.pass))process.exitCode=1;
}finally{clearTimeout(timer);server.closeAllConnections();server.close();}
