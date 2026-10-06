export type Locale = 'zh' | 'en';
export type Template = 'split' | 'wipe' | 'zoom';

export interface ImageAsset {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
}

export interface FocusRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Scene {
  id: string;
  title: string;
  caption: string;
  before?: ImageAsset;
  after?: ImageAsset;
  focus: FocusRect;
}

export interface Project {
  schemaVersion: 1;
  title: string;
  beforeLabel: string;
  afterLabel: string;
  locale: Locale;
  template: Template;
  settings: {
    width: 480 | 960 | 1280;
    fps: 5 | 10 | 15;
    secondsPerScene: 2 | 3 | 4 | 6;
  };
  scenes: Scene[];
}

export interface FrameStep {
  index: number;
  sceneIndex: number;
  progress: number;
  delayMs: number;
}

export type ProjectErrorCode =
  | 'structure' | 'schema' | 'locale' | 'template' | 'settings'
  | 'text' | 'scenes' | 'id' | 'image' | 'capacity' | 'focus' | 'incomplete';

export class ProjectError extends Error {
  constructor(public readonly code: ProjectErrorCode, public readonly path: string, message: string) {
    super(message);
    this.name = 'ProjectError';
  }
}

const MiB = 1024 * 1024;
const maxImageBytes = 4 * MiB;
const maxProjectImageBytes = 18 * MiB;
const maxProjectTextBytes = 32 * MiB;

function fail(code: ProjectErrorCode, path: string, message: string): never {
  throw new ProjectError(code, path, message);
}

function record(input: unknown, path: string): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    fail('structure', path, 'Expected an object.');
  }
  return input as Record<string, unknown>;
}

function text(input: unknown, maxLength: number, path: string): string {
  if (typeof input !== 'string' || input.length > maxLength) {
    fail('text', path, `Expected text of at most ${maxLength} characters.`);
  }
  return input;
}

function identifier(input: unknown, path: string, seen: Set<string>): string {
  if (typeof input !== 'string' || input.length === 0 || input.length > 128 ||
      input.trim().length === 0 || /[\u0000-\u001f\u007f]/.test(input) || seen.has(input)) {
    fail('id', path, 'Expected a nonempty, unique ID of at most 128 characters.');
  }
  seen.add(input);
  return input;
}

function focusRect(input: unknown, path: string): FocusRect {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    fail('focus', path, 'Expected a normalized focus rectangle.');
  }
  const value = input as Record<string, unknown>;
  const { x, y, width, height } = value;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number' ||
      ![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width < 0.1 || height < 0.1 ||
      x + width > 1 || y + height > 1) {
    fail('focus', path, 'Focus must stay inside the image and span at least 10% on each axis.');
  }
  return { x, y, width, height };
}

function imageDataBytes(input: unknown, path: string): number {
  if (typeof input !== 'string') fail('image', path, 'Expected a PNG, JPEG, or WebP base64 data URL.');
  const headers = ['data:image/png;base64,', 'data:image/jpeg;base64,', 'data:image/webp;base64,'];
  const header = headers.find(candidate => input.startsWith(candidate));
  if (!header) fail('image', path, 'Expected a PNG, JPEG, or WebP base64 data URL.');
  const encoded = input.slice(header.length);
  if (encoded.length === 0 || encoded.length % 4 !== 0) {
    fail('image', path, 'Image data must contain complete base64 groups.');
  }
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const bytes = encoded.length / 4 * 3 - padding;
  if (bytes > maxImageBytes) fail('capacity', path, 'An image exceeds the 4 MiB limit.');
  const content = encoded.slice(0, encoded.length - padding);
  if (/[^A-Za-z0-9+/]/.test(content)) fail('image', path, 'Image data contains invalid base64 characters.');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lastValue = alphabet.indexOf(content.at(-1)!);
  if ((padding === 2 && (lastValue & 15) !== 0) || (padding === 1 && (lastValue & 3) !== 0)) {
    fail('image', path, 'Image data must use canonical base64 padding.');
  }
  return bytes;
}

export function validateProject(input: unknown): Project {
  const value = record(input, 'project');
  for (const key of ['schemaVersion', 'title', 'beforeLabel', 'afterLabel', 'locale', 'template', 'settings', 'scenes']) {
    if (!Object.hasOwn(value, key)) fail('structure', key, 'A required project field is missing.');
  }
  if (value.schemaVersion !== 1) fail('schema', 'schemaVersion', 'This project format version is unsupported.');
  if (value.locale !== 'zh' && value.locale !== 'en') fail('locale', 'locale', 'Unsupported interface language.');
  if (value.template !== 'split' && value.template !== 'wipe' && value.template !== 'zoom') {
    fail('template', 'template', 'Unsupported comparison template.');
  }
  const settings = record(value.settings, 'settings');
  if (settings.width !== 480 && settings.width !== 960 && settings.width !== 1280) {
    fail('settings', 'settings.width', 'Unsupported output width.');
  }
  if (settings.fps !== 5 && settings.fps !== 10 && settings.fps !== 15) {
    fail('settings', 'settings.fps', 'Unsupported output frame rate.');
  }
  if (settings.secondsPerScene !== 2 && settings.secondsPerScene !== 3 && settings.secondsPerScene !== 4 && settings.secondsPerScene !== 6) {
    fail('settings', 'settings.secondsPerScene', 'Unsupported scene duration.');
  }
  if (!Array.isArray(value.scenes)) fail('structure', 'scenes', 'Expected a list of scenes.');
  if (value.scenes.length > 6) fail('scenes', 'scenes', 'Projects can contain at most six scenes.');
  const seen = new Set<string>();
  let totalBytes = 0;
  function image(inputImage: unknown, path: string): ImageAsset {
    const item = record(inputImage, path);
    const { width, height } = item;
    if (typeof width !== 'number' || typeof height !== 'number' || !Number.isInteger(width) || !Number.isInteger(height) ||
        width <= 0 || height <= 0 || width > 4096 || height > 4096 || width * height > 8_000_000) {
      fail('image', path, 'Image dimensions exceed the supported bounds.');
    }
    totalBytes += imageDataBytes(item.dataUrl, `${path}.dataUrl`);
    if (totalBytes > maxProjectImageBytes) fail('capacity', 'scenes', 'Project images exceed the 18 MiB limit.');
    return {
      id: identifier(item.id, `${path}.id`, seen),
      name: text(item.name, 255, `${path}.name`),
      dataUrl: item.dataUrl as string,
      width,
      height,
    };
  }
  const scenes = Array.from(value.scenes, (inputScene, index): Scene => {
    const path = `scenes[${index}]`;
    const item = record(inputScene, path);
    return {
      id: identifier(item.id, `${path}.id`, seen),
      title: text(item.title, 120, `${path}.title`),
      caption: text(item.caption, 500, `${path}.caption`),
      ...(item.before === undefined ? {} : { before: image(item.before, `${path}.before`) }),
      ...(item.after === undefined ? {} : { after: image(item.after, `${path}.after`) }),
      focus: focusRect(item.focus, `${path}.focus`),
    };
  });
  return {
    schemaVersion: 1,
    title: text(value.title, 120, 'title'),
    beforeLabel: text(value.beforeLabel, 64, 'beforeLabel'),
    afterLabel: text(value.afterLabel, 64, 'afterLabel'),
    locale: value.locale,
    template: value.template,
    settings: { width: settings.width, fps: settings.fps, secondsPerScene: settings.secondsPerScene },
    scenes,
  };
}

function checkTextCapacity(value: string): void {
  if (value.length > maxProjectTextBytes || new TextEncoder().encode(value).byteLength > maxProjectTextBytes) {
    fail('capacity', 'project', 'Project text exceeds the 32 MiB limit.');
  }
}

export function parseProject(value: string): Project {
  if (typeof value !== 'string') fail('structure', 'project', 'Expected JSON project text.');
  checkTextCapacity(value);
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    fail('structure', 'project', 'Project text is not valid JSON.');
  }
  return validateProject(parsed);
}

export function serializeProject(project: Project): string {
  const serialized = JSON.stringify(validateProject(project));
  checkTextCapacity(serialized);
  return serialized;
}

export function getExportPlan(project: Project): FrameStep[] {
  const validated = validateProject(project);
  if (validated.scenes.length === 0) fail('incomplete', 'scenes', 'Add at least one screenshot pair before exporting.');
  validated.scenes.forEach((scene, index) => {
    if (!scene.before || !scene.after) fail('incomplete', `scenes[${index}]`, 'Each scene needs a before and after screenshot.');
  });
  const { fps, secondsPerScene } = validated.settings;
  const framesPerScene = fps * secondsPerScene;
  const count = validated.scenes.length * framesPerScene;
  if (count > 360) fail('capacity', 'settings', 'This export exceeds the 360 frame limit.');
  return Array.from({ length: count }, (_, index) => ({
    index,
    sceneIndex: Math.floor(index / framesPerScene),
    progress: (index % framesPerScene) / (framesPerScene - 1),
    delayMs: (Math.round((index + 1) * 100 / fps) - Math.round(index * 100 / fps)) * 10,
  }));
}

export function normalizeFocus(input: FocusRect): FocusRect {
  if (!input || ![input.x, input.y, input.width, input.height].every(Number.isFinite)) {
    fail('focus', 'focus', 'Focus coordinates must be finite numbers.');
  }
  const width = Math.min(1, Math.max(0.1, input.width));
  const height = Math.min(1, Math.max(0.1, input.height));
  return {
    x: Math.min(1 - width, Math.max(0, input.x)),
    y: Math.min(1 - height, Math.max(0, input.y)),
    width,
    height,
  };
}

export function containRect(sw: number, sh: number, x: number, y: number, width: number, height: number): FocusRect {
  if (![sw, sh, x, y, width, height].every(Number.isFinite) || sw <= 0 || sh <= 0 || width < 0 || height < 0) {
    fail('image', 'containRect', 'Image and container geometry must be finite and nonnegative.');
  }
  const ratio = sw / sh;
  const containedWidth = width === 0 || height === 0 ? 0 : Math.min(width, height * ratio);
  const containedHeight = width === 0 || height === 0 ? 0 : Math.min(height, width / ratio);
  const result = {
    x: x + (width - containedWidth) / 2,
    y: y + (height - containedHeight) / 2,
    width: containedWidth,
    height: containedHeight,
  };
  if (!Object.values(result).every(Number.isFinite)) {
    fail('image', 'containRect', 'Container coordinates exceed finite geometry bounds.');
  }
  return result;
}

export function newScene(): Scene {
  return {
    id: crypto.randomUUID(),
    title: '新场景',
    caption: '',
    focus: { x: 0.1, y: 0.15, width: 0.8, height: 0.7 },
  };
}

export function newProject(): Project {
  return {
    schemaVersion: 1,
    title: '版本更新',
    beforeLabel: '旧版本',
    afterLabel: '新版本',
    locale: 'zh',
    template: 'split',
    settings: { width: 960, fps: 10, secondsPerScene: 4 },
    scenes: [newScene()],
  };
}
