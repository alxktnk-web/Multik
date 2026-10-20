import { expect, it } from 'vitest';
import { Scheduler } from './scheduler';
it('coalesces 100 updates into one latest-state draw and sleeps when idle',()=>{
  let callback:FrameRequestCallback|undefined,requests=0,value=0;const seen:number[]=[];
  const scheduler=new Scheduler(()=>seen.push(value),cb=>{requests++;callback=cb;return requests;},()=>{});
  for(let i=0;i<100;i++){value=i;scheduler.invalidate();}
  expect(requests).toBe(1);callback!(10);expect(seen).toEqual([99]);expect(requests).toBe(1);
  scheduler.pause();value=101;scheduler.invalidate();expect(requests).toBe(1);
  scheduler.resume();expect(requests).toBe(2);callback!(20);expect(seen).toEqual([99,101]);
  scheduler.dispose();
});
