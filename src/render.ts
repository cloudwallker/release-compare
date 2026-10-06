import type { FrameStep, Project, FocusRect } from './model';
import { containRect } from './model';
import type { LoadedImages } from './images';
import { wrapLines } from './media-utils';

const FONT='system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const canvasHeight=(width:number)=>Math.round(width*9/16);
function lines(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,width:number,size:number,count=1,color='#f8fafc',weight=500) {
  ctx.fillStyle=color;ctx.font=`${weight} ${size}px ${FONT}`;ctx.textBaseline='top';
  wrapLines(text,width,count,s=>ctx.measureText(s).width).forEach((line,i)=>ctx.fillText(line,x,y+i*size*1.35));
}
function draw(ctx:CanvasRenderingContext2D,image:HTMLImageElement|undefined,rect:{x:number;y:number;width:number;height:number},focus?:FocusRect) {
  ctx.fillStyle='#202b40';ctx.fillRect(rect.x,rect.y,rect.width,rect.height);
  if(!image) { lines(ctx,'PNG · JPEG · WebP',rect.x+20,rect.y+rect.height/2,rect.width-40,18,1,'#94a3b8'); return; }
  const sx=focus?focus.x*image.naturalWidth:0, sy=focus?focus.y*image.naturalHeight:0;
  const sw=focus?focus.width*image.naturalWidth:image.naturalWidth, sh=focus?focus.height*image.naturalHeight:image.naturalHeight;
  const target=containRect(sw,sh,rect.x,rect.y,rect.width,rect.height);
  ctx.drawImage(image,sx,sy,sw,sh,target.x,target.y,target.width,target.height);
}
const ease=(t:number)=>{const x=Math.max(0,Math.min(1,(t-.25)/.5));return x*x*(3-2*x);};

export function renderFrame(ctx:CanvasRenderingContext2D,project:Project,images:LoadedImages,step:Pick<FrameStep,'sceneIndex'|'progress'>):void {
  const scene=project.scenes[step.sceneIndex]; if(!scene) throw new Error('Scene is missing.');
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#0f172a';ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
  ctx.scale(ctx.canvas.width/960,ctx.canvas.width/960);
  const progress=Math.max(0,Math.min(1,step.progress)), reveal=ease(progress);
  lines(ctx,project.title||'Release Compare',32,23,565,25,1,'#f8fafc',700);
  lines(ctx,scene.title,32,71,650,22,1,'#cbd5e1',600);
  lines(ctx,`${step.sceneIndex+1} / ${project.scenes.length}`,854,75,75,16,1,'#94a3b8');
  const before=scene.before?images.get(scene.before.id):undefined, after=scene.after?images.get(scene.after.id):undefined;
  if(project.template==='split') {
    const oldRect={x:32,y:139,width:432,height:275},newRect={x:496,y:139,width:432,height:275};
    lines(ctx,project.beforeLabel,32,111,420,16,1,'#cbd5e1'); lines(ctx,project.afterLabel,496,111,420,16,1,'#f9a8d4');
    draw(ctx,before,oldRect);draw(ctx,after,newRect);
    ctx.strokeStyle=progress<.5?'#94a3b8':'#ec4899';ctx.lineWidth=3;
    const active=progress<.5?oldRect:newRect;ctx.strokeRect(active.x-2,active.y-2,active.width+4,active.height+4);
  } else {
    const rect={x:32,y:114,width:896,height:300};
    if(project.template==='wipe') {
      draw(ctx,before,rect);
      ctx.save();ctx.beginPath();ctx.rect(rect.x,rect.y,rect.width*reveal,rect.height);ctx.clip();draw(ctx,after,rect);ctx.restore();
      if(reveal>0 && reveal<1) {ctx.fillStyle='#ec4899';ctx.fillRect(rect.x+rect.width*reveal-2,rect.y,4,rect.height);}
      lines(ctx,project.beforeLabel,32,423,380,15,1,'#cbd5e1');lines(ctx,project.afterLabel,546,423,380,15,1,'#f9a8d4');
    } else {
      const current=progress<.5?before:after;
      // Crop the same normalized region on both screenshots.
      draw(ctx,current,rect,scene.focus);
      lines(ctx,progress<.5?project.beforeLabel:project.afterLabel,32,423,670,15,1,progress<.5?'#cbd5e1':'#f9a8d4');
      lines(ctx,project.locale==='zh'?'局部放大':'FOCUS VIEW',734,423,194,14,1,'#94a3b8');
    }
  }
  lines(ctx,scene.caption,32,460,896,18,2,'#e2e8f0');
  ctx.fillStyle='#334155';ctx.fillRect(32,526,896,3);ctx.fillStyle='#ec4899';ctx.fillRect(32,526,896*progress,3);
  ctx.restore();
}
