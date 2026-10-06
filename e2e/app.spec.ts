import { test, expect, type Page, type Download } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function downloadBytes(download: Download): Promise<Buffer> {
  const path = await download.path();
  if (!path) throw new Error('Download did not finish');
  return readFile(path);
}

async function saveProject(page: Page): Promise<any> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存项目', exact: true }).click();
  return JSON.parse((await downloadBytes(await pending)).toString('utf8'));
}

async function quickExport(page: Page) {
  await page.getByLabel('输出宽度', { exact: true }).selectOption('480');
  await page.getByLabel('帧率', { exact: true }).selectOption('5');
  await page.getByLabel('每场景时长', { exact: true }).selectOption('2');
}

test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(4000);
  await page.goto('/');
});

// Missing initialization, inaccessible controls or automatic animation break this behavior.
test('opens a complete stationary sample and switches the interface language', async ({ page }) => {
  await expect(page.getByLabel('项目名称', { exact: true })).not.toHaveValue('');
  await expect(page.getByRole('img', { name: '版本对照预览' })).toBeVisible();
  const timeline = page.getByLabel('时间轴', { exact: true });
  const start = await timeline.inputValue();
  await page.waitForTimeout(200);
  await expect(timeline).toHaveValue(start);
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByLabel('Project title', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate GIF', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '中文', exact: true }).click();
  await expect(page.getByLabel('项目名称', { exact: true })).toBeVisible();
});

// A wrong template handler or labels that never reach the project breaks the saved result.
test('persists all three templates and edited release text', async ({ page }) => {
  await page.getByLabel('项目名称', { exact: true }).fill('更快的搜索');
  await page.getByLabel('旧版本名称', { exact: true }).fill('v1.4');
  await page.getByLabel('新版本名称', { exact: true }).fill('v2.0');
  await page.getByLabel('场景标题', { exact: true }).fill('统一搜索');
  await page.getByLabel('改动说明', { exact: true }).fill('现在只需要一个输入框。');
  for (const [label, template] of [['并排对照', 'split'], ['滑动揭示', 'wipe'], ['局部放大', 'zoom']]) {
    await page.getByRole('radio', { name: label, exact: true }).check();
    const saved = await saveProject(page);
    expect(saved.template).toBe(template);
    expect(saved.title).toBe('更快的搜索');
    expect(saved.beforeLabel).toBe('v1.4');
    expect(saved.afterLabel).toBe('v2.0');
    expect(saved.scenes[0].caption).toBe('现在只需要一个输入框。');
  }
});

// Incorrect selection after reordering/deletion or an unenforced scene cap breaks this behavior.
test('adds, reorders and deletes scenes and enforces the six-scene limit', async ({ page }) => {
  await page.getByRole('button', { name: '添加场景', exact: true }).click();
  await page.getByLabel('场景标题', { exact: true }).fill('第三个画面');
  await page.getByRole('button', { name: '上移场景', exact: true }).click();
  const saved = await saveProject(page);
  expect(saved.scenes[1].title).toBe('第三个画面');
  await page.getByRole('button', { name: '删除场景', exact: true }).click();
  expect((await saveProject(page)).scenes.some((scene: any) => scene.title === '第三个画面')).toBe(false);
  while ((await page.getByRole('list', { name: '场景列表' }).getByRole('listitem').count()) < 6) {
    await page.getByRole('button', { name: '添加场景', exact: true }).click();
  }
  await expect(page.getByRole('button', { name: '添加场景', exact: true })).toBeDisabled();
});

// Updating the wrong scene/side or losing the original image bytes breaks this behavior.
test('replaces one screenshot and preserves its pair in saved JSON', async ({ page }) => {
  const before = await saveProject(page);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP6sAAAAASUVORK5CYII=', 'base64');
  await page.getByLabel('旧版截图', { exact: true }).setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByText('replacement.png', { exact: true })).toBeVisible();
  const saved = await saveProject(page);
  expect(saved.scenes[0].before.name).toBe('replacement.png');
  expect(saved.scenes[0].before.width).toBe(1);
  expect(saved.scenes[0].after.dataUrl).toBe(before.scenes[0].after.dataUrl);
});

// Late reads must target their original scene, and a newer choice must win on the same side.
test('keeps delayed screenshot reads scoped to their scene and latest choice', async ({ page }) => {
  await page.addInitScript(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      if (this.name === 'slow.png') await new Promise((resolve) => setTimeout(resolve, 800));
      return original.call(this);
    };
  });
  await page.reload();
  const current = await saveProject(page);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP6sAAAAASUVORK5CYII=', 'base64');
  await page.getByLabel('旧版截图', { exact: true }).setInputFiles({ name: 'slow.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('button', { name: '生成 GIF', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '导入项目', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /^选择场景 2：/ }).click();
  await expect(page.getByRole('button', { name: '保存项目', exact: true })).toBeEnabled();
  const switched = await saveProject(page);
  expect(switched.scenes[0].before.name).toBe('slow.png');
  expect(switched.scenes[1].before).toEqual(current.scenes[1].before);
  await page.getByRole('button', { name: /^选择场景 1：/ }).click();
  await page.getByLabel('旧版截图', { exact: true }).setInputFiles({ name: 'slow.png', mimeType: 'image/png', buffer: png });
  await page.getByLabel('旧版截图', { exact: true }).setInputFiles({ name: 'latest.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByText('latest.png', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '保存项目', exact: true })).toBeEnabled();
  expect((await saveProject(page)).scenes[0].before.name).toBe('latest.png');
});

// Applying an invalid import before decoding, or failing to restore valid text, breaks this behavior.
test('round-trips project JSON and preserves the project when import fails', async ({ page }) => {
  await page.getByLabel('项目名称', { exact: true }).fill('可携带的项目');
  const saved = await saveProject(page);
  await page.getByLabel('项目名称', { exact: true }).fill('临时编辑');
  await page.getByLabel('导入项目文件', { exact: true }).setInputFiles({ name: 'restore.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('可携带的项目');
  await page.getByLabel('导入项目文件', { exact: true }).setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":999}') });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('可携带的项目');
});

// An empty imported scene array must never replace the currently editable project.
test('rejects an empty-scene import and keeps the complete current project', async ({ page }) => {
  await page.getByLabel('项目名称', { exact: true }).fill('必须保留的项目');
  const current = await saveProject(page);
  await page.getByLabel('导入项目文件', { exact: true }).setInputFiles({ name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...current, scenes: [] })) });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('必须保留的项目');
  expect((await saveProject(page)).scenes).toEqual(current.scenes);
});

// Valid JSON with an undecodable asset must finish validation before changing any state.
test('rejects undecodable imported images without replacing the current project', async ({ page }) => {
  const current = await saveProject(page);
  const damaged = JSON.parse(JSON.stringify(current));
  damaged.title = '不应载入';
  damaged.scenes[0].before.dataUrl = 'data:image/png;base64,aW52YWxpZCBpbWFnZQ==';
  await page.getByLabel('导入项目文件', { exact: true }).setInputFiles({ name: 'bad-image.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(damaged)) });
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await saveProject(page)).toEqual(current);
});

// Rendering without the current scene/progress or downloading a non-PNG breaks this behavior.
test('exports the current preview as a real PNG', async ({ page }) => {
  await quickExport(page);
  await page.getByLabel('时间轴', { exact: true }).fill('0.6');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 PNG', exact: true }).click();
  const bytes = await downloadBytes(await pending);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.readUInt32BE(16)).toBe(480);
  expect(bytes.readUInt32BE(20)).toBe(270);
});

// A missing encoder, invalid result download or stale URL after editing breaks this behavior.
test('generates a real GIF and invalidates the download after editing', async ({ page }) => {
  await quickExport(page);
  await page.getByRole('button', { name: '生成 GIF', exact: true }).click();
  const link = page.getByRole('link', { name: '下载 GIF', exact: true });
  await expect(link).toBeVisible({ timeout: 60000 });
  const pending = page.waitForEvent('download');
  await link.click();
  const bytes = await downloadBytes(await pending);
  expect(bytes.subarray(0, 3).toString()).toBe('GIF');
  expect(bytes.readUInt16LE(6)).toBe(480);
  await page.getByLabel('新版本名称', { exact: true }).fill('v3.0');
  await expect(link).toHaveCount(0);
});

// A late export success after cancellation or permanently frozen controls breaks this behavior.
test('cancels encoding, restores editing and allows a successful retry', async ({ page }) => {
  await page.getByLabel('输出宽度', { exact: true }).selectOption('1280');
  await page.getByLabel('每场景时长', { exact: true }).selectOption('6');
  await page.getByRole('button', { name: '生成 GIF', exact: true }).click();
  await expect(page.getByLabel('项目名称', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '取消导出', exact: true }).click();
  await expect(page.getByLabel('项目名称', { exact: true })).toBeEnabled();
  await expect(page.getByRole('link', { name: '下载 GIF', exact: true })).toHaveCount(0);
  await quickExport(page);
  await page.getByRole('button', { name: '生成 GIF', exact: true }).click();
  await expect(page.getByRole('link', { name: '下载 GIF', exact: true })).toBeVisible({ timeout: 60000 });
});

// Unbounded focus coordinates or a disconnected slider breaks the serialized crop.
test('adjusts the focus region with labelled keyboard-accessible sliders', async ({ page }) => {
  await page.getByRole('radio', { name: '局部放大', exact: true }).check();
  await page.getByLabel('区域宽度', { exact: true }).fill('0.5');
  await page.getByLabel('水平位置', { exact: true }).fill('0.4');
  await page.getByLabel('垂直位置', { exact: true }).fill('0.2');
  await page.getByLabel('区域高度', { exact: true }).fill('0.6');
  const saved = await saveProject(page);
  expect(saved.scenes[0].focus).toEqual({ x: 0.4, y: 0.2, width: 0.5, height: 0.6 });
  await page.getByLabel('水平位置', { exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  expect((await saveProject(page)).scenes[0].focus.x).toBeGreaterThan(0.4);
});

// Missing pause/seek handling or retaining progress from a different scene breaks preview control.
test('plays pauses and seeks the preview and resets progress on scene selection', async ({ page }) => {
  await page.getByLabel('每场景时长', { exact: true }).selectOption('2');
  const timeline = page.getByLabel('时间轴', { exact: true });
  await page.getByRole('button', { name: '播放预览', exact: true }).click();
  await expect.poll(async () => Number(await timeline.inputValue())).toBeGreaterThan(0.05);
  await page.getByRole('button', { name: '暂停预览', exact: true }).click();
  const stopped = await timeline.inputValue();
  await page.waitForTimeout(150);
  await expect(timeline).toHaveValue(stopped);
  await timeline.fill('0.75');
  await expect(timeline).toHaveValue('0.75');
  await page.getByRole('button', { name: /^选择场景 2：/ }).click();
  await expect(timeline).toHaveValue('0');
});

// Wide fixed columns, default playback or a remote dependency breaks the local responsive workbench.
test('fits mobile tablet and desktop and stays still with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const external: string[] = [];
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('request', (request) => { if (!request.url().startsWith('http://127.0.0.1:4174') && !request.url().startsWith('data:')) external.push(request.url()); });
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await page.reload();
    await expect(page.getByRole('button', { name: '生成 GIF', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const timeline = page.getByLabel('时间轴', { exact: true });
    await expect(timeline).toHaveValue('0');
    await page.screenshot({ path: `../output/release-compare-work/ui-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.getByLabel('Project title', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `../output/release-compare-work/ui-en-${width}.png`, fullPage: true });
  }
  expect(external).toEqual([]);
  expect(browserErrors).toEqual([]);
});
