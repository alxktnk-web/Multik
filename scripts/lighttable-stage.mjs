import {cp,rm} from 'node:fs/promises';
// The hosting manifest keeps static.directory=dist. Never run Classic's precache
// generator over this tree: root is an immutable baseline, v2 owns its worker.
await rm('dist',{recursive:true,force:true});
await cp('dist-combined','dist',{recursive:true});
console.log('Prepared dist: immutable Classic + /lighttable PWA');
