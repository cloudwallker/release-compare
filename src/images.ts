import type { ImageAsset, Project } from './model';
import { validateProject, ProjectError } from './model';
import { inspectRaster } from './media-utils';

export type LoadedImages = Map<string, HTMLImageElement>;
function imageError(): never { throw new ProjectError('image', 'image', 'Use a static PNG, JPEG or WebP within the image limits.'); }
const cancelled=()=>new DOMException('Image preparation cancelled.','AbortError');
function decode(src:string,signal?:AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(cancelled());return;}
    const image=new Image();
    const clean=()=>{image.onload=null;image.onerror=null;signal?.removeEventListener('abort',abort);};
    const abort=()=>{clean();image.src='';reject(cancelled());};
    image.onload=()=>{clean();resolve(image);};
    image.onerror=()=>{clean();image.src='';reject(new ProjectError('image','image','Image decoding failed.'));};
    signal?.addEventListener('abort',abort,{once:true});
    image.src=src;
  });
}
function dataBytes(dataUrl:string): Uint8Array {
  try { const raw=atob(dataUrl.slice(dataUrl.indexOf(',')+1)); return Uint8Array.from(raw,c=>c.charCodeAt(0)); }
  catch { return imageError(); }
}
export async function readImage(file:File):Promise<ImageAsset> {
  if(file.size>4*1024*1024 || !file.size || (file.type && !['image/png','image/jpeg','image/webp'].includes(file.type))) imageError();
  const bytes=new Uint8Array(await file.arrayBuffer());
  let info; try { info=inspectRaster(bytes); } catch { return imageError(); }
  if(file.type && info.mime!==file.type) imageError();
  const normalized=new Blob([bytes],{type:info.mime});
  const url=URL.createObjectURL(normalized);let image:HTMLImageElement|undefined;
  try {
    image=await decode(url);
    const dataUrl=await new Promise<string>((resolve,reject)=>{
      const reader=new FileReader(); reader.onload=()=>resolve(reader.result as string); reader.onerror=()=>reject(new ProjectError('image','image','Image reading failed.')); reader.readAsDataURL(normalized);
    });
    const asset={id:crypto.randomUUID(),name:file.name.slice(0,255),dataUrl,width:image.naturalWidth,height:image.naturalHeight};
    return asset;
  } finally { if(image)image.src='';URL.revokeObjectURL(url); }
}
export async function loadProjectImages(input:Project,signal?:AbortSignal):Promise<LoadedImages> {
  const project=validateProject(input), images:LoadedImages=new Map();
  try {
    for(const scene of project.scenes) for(const asset of [scene.before,scene.after]) {
      if(signal?.aborted)throw cancelled();
      if(!asset) continue;
      let info; try { info=inspectRaster(dataBytes(asset.dataUrl)); } catch { return imageError(); }
      if(!asset.dataUrl.startsWith(`data:${info.mime};base64,`)) imageError();
      const image=await decode(asset.dataUrl,signal); images.set(asset.id,image);
      if(image.naturalWidth!==asset.width || image.naturalHeight!==asset.height) imageError();
    }
    return images;
  } catch(e) { for(const image of images.values()) image.src=''; images.clear(); throw e; }
}
