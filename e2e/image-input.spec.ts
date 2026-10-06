import { test, expect } from '@playwright/test';

test('accepts a valid screenshot with missing MIME metadata and normalizes its data URL', async ({ page }) => {
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {readImage,loadProjectImages}=await import('/src/'+'images.ts');
    const {newProject}=await import('/src/'+'model.ts');
    const c=document.createElement('canvas');c.width=18;c.height=32;
    const blob=await new Promise<Blob>(r=>c.toBlob(b=>r(b!),'image/png'));
    const asset=await readImage(new File([blob],'手机截图.png'));
    const p=newProject();p.scenes[0].before=asset;
    const images=await loadProjectImages(p);
    return {name:asset.name,width:asset.width,height:asset.height,mime:asset.dataUrl.split(',')[0],loaded:images.size};
  });
  expect(result).toEqual({name:'手机截图.png',width:18,height:32,mime:'data:image/png;base64',loaded:1});
});

test('normalizes EXIF-oriented JPEG geometry while keeping the screenshot usable', async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {readImage,loadProjectImages}=await import('/src/'+'images.ts');const {newProject}=await import('/src/'+'model.ts');
    const c=document.createElement('canvas');c.width=30;c.height=20;c.getContext('2d')!.fillRect(0,0,30,20);
    const blob=await new Promise<Blob>(r=>c.toBlob(b=>r(b!),'image/jpeg'));
    const bytes=new Uint8Array(await blob.arrayBuffer());
    // APP1 Exif: little-endian TIFF, Orientation=6 (90 degrees clockwise).
    const app=new Uint8Array([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0]);
    const rotated=new Uint8Array(bytes.length+app.length);rotated.set(bytes.subarray(0,2));rotated.set(app,2);rotated.set(bytes.subarray(2),2+app.length);
    const asset=await readImage(new File([rotated],'rotated.jpg',{type:'image/jpeg'}));
    const p=newProject();p.scenes[0].before=asset;const loaded=await loadProjectImages(p);
    return {width:asset.width,height:asset.height,loaded:loaded.size};
  });
  expect(result).toEqual({width:20,height:30,loaded:1});
});
