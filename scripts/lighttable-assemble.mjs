import {mkdtemp,rm,readdir,readFile,cp,mkdir,writeFile,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const baseline=resolve(process.argv[2]||'deployment/classic-baseline.tar.gz'),out=resolve('dist-combined'),stage=resolve('dist-lighttable/lighttable');
const entries=execFileSync('tar',['-tzf',baseline],{encoding:'utf8'}).trim().split('\n');
if(entries.some(p=>(!p.startsWith('dist/')&&p!=='.openai/hosting.json')||p.split('/').includes('..')))throw Error('Unexpected baseline archive layout');
const temp=await mkdtemp(join(tmpdir(),'multik-assembly-'));
try{
 execFileSync('tar',['-xzf',baseline,'-C',temp]);const classic=join(temp,'dist');
 async function files(root){return (await readdir(root,{recursive:true})).sort();}
 for(const path of await files(classic))if((await lstat(join(classic,path))).isSymbolicLink())throw Error('Baseline symlink not allowed');
 if((await files(classic)).some(p=>p==='lighttable'||p.startsWith('lighttable/')))throw Error('Baseline already owns the new route');
 await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});await cp(classic,out,{recursive:true});await cp(stage,join(out,'lighttable'),{recursive:true});
 const hashes={};
 for(const path of await files(classic)){
  if(!(await lstat(join(classic,path))).isFile())continue;
  const a=await readFile(join(classic,path)),b=await readFile(join(out,path));if(!a.equals(b))throw Error('Classic changed: '+path);
  hashes[path]=createHash('sha256').update(b).digest('hex');
 }
 const evidence={classicFiles:hashes,classicByteIdentical:true,v2Namespace:'/lighttable/',note:'Local dual artifact; not deployed'};
 await mkdir('lab-out/lighttable',{recursive:true});await writeFile('lab-out/lighttable/assembly-evidence.json',JSON.stringify(evidence,null,2));
 console.log(`Combined PWA artifact: ${out}; ${Object.keys(hashes).length} Classic files byte-identical`);
}finally{await rm(temp,{recursive:true,force:true});}
