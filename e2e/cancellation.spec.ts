import { test,expect } from '@playwright/test';

test('cancels during image preparation and releases the pending decoder immediately',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {sampleProject}=await import('/src/'+'samples.ts');const {exportGif}=await import('/src/'+'export.ts');
    const project=sampleProject('en');project.settings={width:480,fps:5,secondsPerScene:2};
    const NativeImage=window.Image;
    const descriptor=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src')!;
    let started=0,cancelledDecoders=0;
    window.Image=function(){
      const image=new NativeImage();let timer:number|undefined;
      Object.defineProperty(image,'src',{
        get:()=>descriptor.get!.call(image),
        set:(src:string)=>{
          if(timer!==undefined)clearTimeout(timer);
          if(!src){cancelledDecoders++;descriptor.set!.call(image,'');return;}
          started++;timer=window.setTimeout(()=>descriptor.set!.call(image,src),500);
        },configurable:true,
      });return image;
    } as unknown as typeof Image;
    const controller=new AbortController(),begin=performance.now();let name='';
    window.setTimeout(()=>controller.abort(),30);
    try{await exportGif(project,{signal:controller.signal});}catch(e){name=(e as Error).name;}
    const elapsed=performance.now()-begin;window.Image=NativeImage;
    const retry=await exportGif(project);
    return {name,elapsed,started,cancelledDecoders,retrySize:retry.size};
  });
  expect(result.name).toBe('AbortError');expect(result.elapsed).toBeLessThan(400);
  expect(result.started).toBe(1);expect(result.cancelledDecoders).toBeGreaterThanOrEqual(1);
  expect(result.retrySize).toBeGreaterThan(1000);
});
