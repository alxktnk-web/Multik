// One pending frame, latest state only. No permanent loop while nothing changes.
export class Scheduler {
  private frame=0;
  private dirty=false;
  private paused=false;
  constructor(private draw:(time:number)=>void, private request:(callback:FrameRequestCallback)=>number=cb=>requestAnimationFrame(cb), private cancel:(id:number)=>void=id=>cancelAnimationFrame(id)) {}
  invalidate(){this.dirty=true;if(this.frame||this.paused)return;this.frame=this.request(t=>{this.frame=0;if(!this.dirty||this.paused)return;this.dirty=false;this.draw(t);});}
  pause(){this.paused=true;if(this.frame)this.cancel(this.frame);this.frame=0;}
  resume(){this.paused=false;if(this.dirty)this.invalidate();}
  dispose(){this.pause();this.dirty=false;}
}
