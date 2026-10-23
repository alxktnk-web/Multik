import './style.css';
import './fonts.css';
import './ui/adaptive.css';
import { mountWorkspace } from './ui/workspace';
const root=document.querySelector<HTMLDivElement>('#lighttable')!;
void mountWorkspace(root).then(workspace=>{
  // No production debugging surface or per-frame logging.
  if(import.meta.env.DEV)(window as unknown as {__lighttable:typeof workspace}).__lighttable=workspace;
  if(import.meta.hot)import.meta.hot.dispose(()=>workspace.dispose());
}).catch(error=>{
  root.textContent=error instanceof Error?error.message:'Could not open Lighttable';
  root.setAttribute('role','alert');
  const classic=document.createElement('a');classic.href='/lighttable/recover.html';classic.textContent='Recover Multik';classic.style.display='block';classic.style.marginTop='16px';root.append(classic);
});
