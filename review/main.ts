import '../src/lighttable/style.css';
import '../src/lighttable/fonts.css';
import '../src/lighttable/ui/adaptive.css';
import {Library} from '../src/lighttable/ui/library';
import {Repository} from '../src/lighttable/data/repository';
import type {Navigation} from '../src/lighttable/model/navigation';
// UI review only: uses real collections/import components on a separate origin.
// Rendering is deliberately unavailable; never simulate a successful editor open.
const navigation={open:async()=>{throw Error('UI review only: photo rendering requires WebGL 2.');}} as unknown as Navigation;
const library=new Library(document.querySelector('#lighttable')!,new Repository(),navigation);
await library.open();
