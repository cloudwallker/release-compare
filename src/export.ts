import { getExportPlan, validateProject, ProjectError, type Project, type FrameStep } from './model';
import { loadProjectImages, type LoadedImages } from './images';
import { renderFrame, canvasHeight } from './render';

const cancelled=()=>new DOMException('Export cancelled.','AbortError');
const clearImages=(images:LoadedImages)=>{for(const image of images.values())image.src='';images.clear();};
const canvasFor=(project:Project)=>{const canvas=document.createElement('canvas');canvas.width=project.settings.width;canvas.height=canvasHeight(canvas.width);return canvas;};
export async function exportPng(input:Project,step:Pick<FrameStep,'sceneIndex'|'progress'>):Promise<Blob> {
  const project=validateProject(input),images=await loadProjectImages(project);
  try {
    const canvas=canvasFor(project),ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas is unavailable.');
    renderFrame(ctx,project,images,step);
    return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG encoding failed.')),'image/png'));
  } finally {clearImages(images);}
}
export async function exportGif(input:Project,options:{signal?:AbortSignal;onProgress?:(done:number,total:number)=>void}={}):Promise<Blob> {
  const project=validateProject(input),plan=getExportPlan(project);
  const {signal,onProgress}=options;
  if(signal?.aborted)throw cancelled();
  const images=await loadProjectImages(project,signal);
  let worker:Worker|undefined;
  let pendingReject:((reason:unknown)=>void)|undefined;
  const abort=()=>{worker?.terminate();pendingReject?.(cancelled());};
  try {
    if(signal?.aborted)throw cancelled();
    worker=new Worker(new URL('./gif.worker.ts',import.meta.url),{type:'module'});
    signal?.addEventListener('abort',abort,{once:true});
    const exchange=(message:object,transfer:Transferable[]=[])=>new Promise<any>((resolve,reject)=>{
      if(signal?.aborted){reject(cancelled());return;}
      pendingReject=reject;
      worker!.onmessage=({data})=>{pendingReject=undefined;data.type==='error'?reject(data.code==='capacity'?new ProjectError('capacity','output',data.message):new Error(data.message)):resolve(data);};
      worker!.onerror=()=>{pendingReject=undefined;reject(new Error('GIF worker failed.'));};
      worker!.postMessage(message,transfer);
    });
    const canvas=canvasFor(project),ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Canvas is unavailable.');
    await exchange({type:'start'});onProgress?.(0,plan.length);
    for(const step of plan) {
      if(signal?.aborted)throw cancelled();
      renderFrame(ctx,project,images,step);
      const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      await exchange({type:'frame',buffer:rgba.buffer,width:canvas.width,height:canvas.height,index:step.index,delayMs:step.delayMs},[rgba.buffer]);
      onProgress?.(step.index+1,plan.length);
    }
    if(signal?.aborted)throw cancelled();
    const result=await exchange({type:'finish'});return new Blob([result.buffer],{type:'image/gif'});
  } finally {signal?.removeEventListener('abort',abort);worker?.terminate();clearImages(images);}
}
