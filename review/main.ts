import '../src/lighttable/style.css';
import '../src/lighttable/fonts.css';
import '../src/lighttable/ui/adaptive.css';
import {Library} from '../src/lighttable/ui/library';
import {Repository} from '../src/lighttable/data/repository';
import {seedReview} from './fixtures';
import type {Navigation} from '../src/lighttable/model/navigation';
// Review-only: real repository/components, independent origin and synthetic fixtures.
// No simulated success for the WebGL editor.
// terminal.local is HTTP in the managed preview; production uses HTTPS.
if(!crypto.randomUUID)crypto.randomUUID=()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
const navigation={open:async()=>{throw Error('UI review only: photo rendering requires WebGL 2.');},resume:async()=>{throw Error('UI review only: photo rendering requires WebGL 2.');},resumeAvailable:async()=>false} as unknown as Navigation;
const repo=new Repository();
if(new URLSearchParams(location.search).has('fixtures'))await seedReview(repo);
const library=new Library(document.querySelector('#lighttable')!,repo,navigation);
await library.open();
