import type { Locale } from './model';

const zh = {
  tagline: '版本更新对照工具', local: '本地处理', language: 'English',
  heading: '让每一次更新，一眼可见。', intro: '对应截图 · 三种对照 · 可重用项目',
  save: '保存项目', import: '导入项目', importFile: '导入项目文件', sample: '打开示例',
  scenes: '场景', sceneList: '场景列表', addScene: '添加场景', newScene: '新场景',
  moveUp: '上移场景', moveDown: '下移场景', deleteScene: '删除场景',
  pairReady: '截图已齐全', pairMissing: '等待截图', sceneTip: '按场景讲述变化',
  sceneHelp: '每组放入同一界面的旧版与新版截图。按顺序组合成一段更新故事。',
  preview: '预览', previewLabel: '版本对照预览',
  split: '并排对照', wipe: '滑动揭示', zoom: '局部放大',
  splitHelp: '完整画面并排显示，高亮随时间从旧版本移向新版本。',
  wipeHelp: '拖动时间轴，让新版本逐步覆盖旧版本。',
  zoomHelp: '选择同一区域，放大展示前后的细节变化。',
  focus: '放大区域', x: '水平位置', y: '垂直位置', focusWidth: '区域宽度', focusHeight: '区域高度',
  play: '播放预览', pause: '暂停预览', timeline: '时间轴', old: '旧版', next: '新版',
  sceneTitle: '场景标题', caption: '改动说明', sceneEditor: '场景内容',
  beforeUpload: '旧版截图', afterUpload: '新版截图', chooseImage: '选择或更换图片',
  imageHint: 'PNG、JPEG、WebP · 单张最多 4 MiB', emptyImage: '添加截图',
  project: '版本文字', projectTitle: '项目名称', beforeLabel: '旧版本名称', afterLabel: '新版本名称',
  output: '输出设置', width: '输出宽度', fps: '帧率', seconds: '每场景时长',
  duration: '总时长', frames: '帧数', secondUnit: '秒',
  gif: '生成 GIF', exporting: '正在生成 GIF', cancel: '取消导出', download: '下载 GIF',
  png: '导出 PNG', pngBusy: '正在导出 PNG', exportProgress: 'GIF 导出进度',
  complete: 'GIF 已就绪', cancelled: '已取消，可以继续编辑。', importing: '正在验证项目…',
  imageBusy: '正在读取图片…', imagePreviewBusy: '正在加载预览…',
  missing: '补齐每个场景的两张截图即可生成 GIF。', frameLimit: '总帧数超过 360，请降低帧率或时长。',
  localHelp: '图片在本机浏览器中处理。关闭页面前，保存项目以便下次继续。',
  limits: '最多 6 个场景 · 图片总量 18 MiB · 固定 16:9',
  footer: '为 README、Release 和更新公告制作。', untitled: '未命名场景',
  selectScene: '选择场景', framePosition: '当前场景进度', removeError: '关闭错误提示',
};
const en: Record<keyof typeof zh, string> = {
  tagline: 'Release screenshot workbench', local: 'Processed locally', language: '中文',
  heading: 'Make every update visible.', intro: 'Paired screenshots · Three layouts · Reusable projects',
  save: 'Save project', import: 'Import project', importFile: 'Import project file', sample: 'Open example',
  scenes: 'Scenes', sceneList: 'Scene list', addScene: 'Add scene', newScene: 'New scene',
  moveUp: 'Move scene up', moveDown: 'Move scene down', deleteScene: 'Delete scene',
  pairReady: 'Pair ready', pairMissing: 'Screenshots needed', sceneTip: 'Tell the story in scenes',
  sceneHelp: 'Pair old and new screenshots of the same view. Arrange them into a release story.',
  preview: 'Preview', previewLabel: 'Release comparison preview',
  split: 'Side by side', wipe: 'Sliding reveal', zoom: 'Detail zoom',
  splitHelp: 'See both complete views. The highlight moves from the old version to the new one.',
  wipeHelp: 'Scrub the timeline to reveal the new version over the old one.',
  zoomHelp: 'Select the same region to show changes in detail.',
  focus: 'Zoom region', x: 'Horizontal position', y: 'Vertical position', focusWidth: 'Region width', focusHeight: 'Region height',
  play: 'Play preview', pause: 'Pause preview', timeline: 'Timeline', old: 'Before', next: 'After',
  sceneTitle: 'Scene title', caption: 'Change description', sceneEditor: 'Scene content',
  beforeUpload: 'Before screenshot', afterUpload: 'After screenshot', chooseImage: 'Choose or replace image',
  imageHint: 'PNG, JPEG, WebP · Up to 4 MiB each', emptyImage: 'Add screenshot',
  project: 'Release text', projectTitle: 'Project title', beforeLabel: 'Before version label', afterLabel: 'After version label',
  output: 'Output settings', width: 'Output width', fps: 'Frame rate', seconds: 'Seconds per scene',
  duration: 'Duration', frames: 'Frames', secondUnit: 's',
  gif: 'Generate GIF', exporting: 'Generating GIF', cancel: 'Cancel export', download: 'Download GIF',
  png: 'Export PNG', pngBusy: 'Exporting PNG', exportProgress: 'GIF export progress',
  complete: 'Your GIF is ready', cancelled: 'Cancelled. You can continue editing.', importing: 'Validating project…',
  imageBusy: 'Reading image…', imagePreviewBusy: 'Loading preview…',
  missing: 'Add both screenshots to every scene to generate a GIF.', frameLimit: 'More than 360 frames. Reduce the frame rate or duration.',
  localHelp: 'Images are processed in this browser. Save your project before closing to continue later.',
  limits: 'Up to 6 scenes · 18 MiB of images · Fixed 16:9',
  footer: 'Made for READMEs, releases and update announcements.', untitled: 'Untitled scene',
  selectScene: 'Select scene', framePosition: 'Current scene progress', removeError: 'Dismiss error',
};
export const messages: Record<Locale, Record<keyof typeof zh, string>> = { zh, en };
const errors: Record<string, [string, string]> = {
  structure: ['项目格式无效，请选择 Release Compare 项目文件。', 'Invalid project format. Choose a Release Compare project file.'],
  schema: ['这个项目版本暂不支持，请使用格式版本 1。', 'This project version is not supported. Use schema version 1.'],
  locale: ['项目语言无效，请选择中文或英文。', 'The project language must be Chinese or English.'],
  template: ['项目对照模板无效。', 'The project template is not supported.'],
  settings: ['输出设置无效，请检查宽度、帧率与时长。', 'Check the output width, frame rate and duration.'],
  text: ['文字超过长度限制，请缩短后再试。', 'Some text exceeds the length limit. Shorten it and try again.'],
  scenes: ['项目必须包含 1 至 6 个场景。', 'A project must contain between 1 and 6 scenes.'],
  id: ['项目含有重复或无效的标识，请检查项目文件。', 'The project contains duplicate or invalid identifiers.'],
  image: ['图片无法读取，或格式与尺寸不符合要求。请选择有效的 PNG、JPEG 或 WebP。', 'The image cannot be read, or its format or dimensions are invalid. Choose a valid PNG, JPEG or WebP.'],
  capacity: ['文件超过容量限制。单图最多 4 MiB、项目图片共 18 MiB，项目文件最多 32 MiB。', 'A file exceeds the limit: 4 MiB per image, 18 MiB of images per project, and 32 MiB per project file.'],
  focus: ['放大区域超出图片边界，请调整区域。', 'The zoom region falls outside the image. Adjust the region.'],
  incomplete: ['每个场景都需要旧版和新版截图。', 'Every scene needs a before and an after screenshot.'],
};
export function errorMessage(error: unknown, locale: Locale): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code === 'capacity' && typeof error === 'object' && error !== null && 'path' in error && error.path === 'output') {
    return locale === 'zh' ? 'GIF 超过 64 MiB，请减小输出宽度、时长或帧率。' : 'The GIF exceeds 64 MiB. Reduce the output width, duration or frame rate.';
  }
  const pair = errors[code];
  if (pair) return pair[locale === 'zh' ? 0 : 1];
  return locale === 'zh' ? '无法完成操作，请检查文件后重试。' : 'Could not complete the operation. Check the file and try again.';
}
