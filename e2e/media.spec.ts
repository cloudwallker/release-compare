import { test, expect } from '@playwright/test';

test('three templates preserve old/new endpoints and contain portrait screenshots', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { renderFrame, canvasHeight } = await import('/src/' + 'render.ts');
    const { loadProjectImages } = await import('/src/' + 'images.ts');
    const source = (color: string) => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 128;
      const x = c.getContext('2d')!; x.fillStyle = color; x.fillRect(0, 0, 64, 128);
      return c.toDataURL('image/png');
    };
    const project = {
      schemaVersion: 1, title: 'Sample release', beforeLabel: 'v1', afterLabel: 'v2', locale: 'en', template: 'wipe',
      settings: { width: 480, fps: 5, secondsPerScene: 2 },
      scenes: [{ id: 'scene-1', title: 'Search', caption: 'One search input', focus: { x: 0, y: 0, width: 1, height: 1 },
        before: { id: 'old', name: 'old.png', dataUrl: source('#ff0000'), width: 64, height: 128 },
        after: { id: 'new', name: 'new.png', dataUrl: source('#00ff00'), width: 64, height: 128 } }],
    } as any;
    const images = await loadProjectImages(project);
    const c = document.createElement('canvas'); c.width = 480; c.height = canvasHeight(480);
    const ctx = c.getContext('2d')!;
    const pixel = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3);
    const out: any = { height: c.height };
    for (const template of ['wipe', 'zoom']) {
      project.template = template;
      renderFrame(ctx, project, images, { sceneIndex: 0, progress: 0 }); const first = pixel(240, 135);
      renderFrame(ctx, project, images, { sceneIndex: 0, progress: 1 }); const last = pixel(240, 135);
      out[template] = { first, last, side: pixel(20, 135) };
    }
    project.template = 'split'; renderFrame(ctx, project, images, { sceneIndex: 0, progress: 0.5 });
    out.split = { old: pixel(125, 135), next: pixel(355, 135) };
    return out;
  });
  expect(result.height).toBe(270);
  expect(result.wipe.first).toEqual([255, 0, 0]); expect(result.wipe.last).toEqual([0, 255, 0]);
  expect(result.zoom.first).toEqual([255, 0, 0]); expect(result.zoom.last).toEqual([0, 255, 0]);
  expect(result.split.old).toEqual([255, 0, 0]); expect(result.split.next).toEqual([0, 255, 0]);
  expect(result.wipe.side).not.toEqual([0, 255, 0]);
});

test('GIF is repeatable, decodes into timed frames, and PNG uses the same viewport', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { sampleProject } = await import('/src/' + 'samples.ts');
    const { exportGif, exportPng } = await import('/src/' + 'export.ts');
    const p = sampleProject('en'); p.scenes = [p.scenes[0]]; p.settings = { width: 480, fps: 5, secondsPerScene: 2 };
    const counts: number[] = [];
    const first = await exportGif(p, { onProgress: (done: number) => counts.push(done) });
    const second = await exportGif(p);
    const a = await first.arrayBuffer(), b = await second.arrayBuffer();
    const hash = async (data: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data))).map(x => x.toString(16).padStart(2, '0')).join('');
    const decoder = new (window as any).ImageDecoder({ data: a, type: 'image/gif' });
    await decoder.tracks.ready; await decoder.completed;
    const frameCount = decoder.tracks.selectedTrack.frameCount;
    let duration = 0; let width = 0; let height = 0;
    for (let i = 0; i < frameCount; i++) {
      const { image } = await decoder.decode({ frameIndex: i }); duration += image.duration;
      width = image.displayWidth; height = image.displayHeight; image.close();
    }
    decoder.close();
    const png = await exportPng(p, { sceneIndex: 0, progress: 1 }); const bmp = await createImageBitmap(png);
    const pngSize = [bmp.width, bmp.height]; bmp.close();
    return { magic: new TextDecoder().decode(new Uint8Array(a, 0, 6)), h1: await hash(a), h2: await hash(b), frameCount, duration, width, height, counts, pngSize };
  });
  expect(result.magic).toBe('GIF89a'); expect(result.h1).toBe(result.h2);
  expect(result.frameCount).toBe(10); expect(result.duration).toBe(2_000_000);
  expect([result.width, result.height]).toEqual([480, 270]); expect(result.pngSize).toEqual([480, 270]);
  expect(result.counts.at(-1)).toBe(10);
});

test('bad images and forged dimensions are rejected without replacing existing data', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { readImage, loadProjectImages } = await import('/src/' + 'images.ts');
    const { sampleProject } = await import('/src/' + 'samples.ts');
    const rejects: boolean[] = [];
    for (const file of [new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }), new File(['not png'], 'x.png', { type: 'image/png' })]) {
      try { await readImage(file); rejects.push(false); } catch { rejects.push(true); }
    }
    const p = sampleProject('en'); p.scenes[0].before!.width += 1;
    try { await loadProjectImages(p); rejects.push(false); } catch { rejects.push(true); }
    return rejects;
  });
  expect(result).toEqual([true, true, true]);
});

test('cancelling an export terminates it and a fresh export still succeeds', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { sampleProject } = await import('/src/' + 'samples.ts'); const { exportGif } = await import('/src/' + 'export.ts');
    const p = sampleProject('zh'); p.scenes = [p.scenes[0]]; p.settings = { width: 480, fps: 5, secondsPerScene: 2 };
    const controller = new AbortController(); let cancelled = false;
    try { await exportGif(p, { signal: controller.signal, onProgress: (done: number) => { if (done === 2) controller.abort(); } }); }
    catch (e) { cancelled = (e as DOMException).name === 'AbortError'; }
    const next = await exportGif(p); return { cancelled, type: next.type, size: next.size };
  });
  expect(result.cancelled).toBe(true); expect(result.type).toBe('image/gif'); expect(result.size).toBeGreaterThan(1000);
});
