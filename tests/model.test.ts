import { describe, expect, it } from 'vitest';
import * as model from '../src/model';
import type { ImageAsset, Project } from '../src/model';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO/aNyoAAAAASUVORK5CYII=';
const MiB = 1024 * 1024;

function asset(id: string, dataUrl = png): ImageAsset {
  return { id, name: 'screen.png', dataUrl, width: 1, height: 1 };
}

function fixture(): Project {
  return {
    schemaVersion: 1, title: 'Release', beforeLabel: 'v1', afterLabel: 'v2',
    locale: 'zh', template: 'split',
    settings: { width: 960, fps: 10, secondsPerScene: 4 },
    scenes: [{
      id: 'scene-1', title: 'Search', caption: 'One field',
      before: asset('before-1'), after: asset('after-1'),
      focus: { x: 0.1, y: 0.15, width: 0.8, height: 0.7 },
    }],
  };
}

function dataOfBytes(count: number): string {
  return `data:image/png;base64,${Buffer.alloc(count, 255).toString('base64')}`;
}

function expectProjectError(action: () => unknown, code: string, path?: string) {
  let error: unknown;
  try { action(); } catch (caught) { error = caught; }
  expect(error).toMatchObject({ name: 'ProjectError', code, ...(path ? { path } : {}) });
}

describe('newProject', () => {
  it('starts with a usable Chinese project and one blank scene', () => {
    const project = model.newProject();

    expect(project).toMatchObject({
      schemaVersion: 1,
      locale: 'zh',
      template: 'split',
      settings: { width: 960, fps: 10, secondsPerScene: 4 },
      scenes: [{ focus: { x: 0.1, y: 0.15, width: 0.8, height: 0.7 } }],
    });
    expect(project.scenes).toHaveLength(1);
    expect(project.scenes[0].before).toBeUndefined();
    expect(project.scenes[0].after).toBeUndefined();
  });

  it('allocates separate scene IDs and independent focus objects', () => {
    const first = model.newScene();
    const second = model.newScene();
    expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.id).not.toBe(first.id);
    first.focus.x = 0.9;
    expect(second.focus.x).toBe(0.1);
  });
});

describe('validateProject', () => {
  it('returns a detached project containing only validated fields', () => {
    const input = fixture() as any;
    input.extra = 'secret';
    input.settings.extra = 'secret';
    input.scenes[0].extra = 'secret';
    input.scenes[0].focus.extra = 'secret';
    input.scenes[0].before.extra = 'secret';
    const result = model.validateProject(input);
    expect(result).toEqual(fixture());
    result.scenes[0].focus.x = 0;
    expect(input.scenes[0].focus.x).toBe(0.1);
  });

  it.each([[null], [[]], ['project'], [1], [true], [{}]])('rejects a non-project root %j', input => {
    expectProjectError(() => model.validateProject(input), 'structure');
  });

  it.each([
    ['schemaVersion', 2, 'schema'],
    ['locale', 'fr', 'locale'],
    ['template', 'slide', 'template'],
    ['scenes', {}, 'structure'],
    ['settings', null, 'structure'],
  ])('rejects unsupported %s', (field, value, code) => {
    const input = { ...fixture(), [field]: value };
    expectProjectError(() => model.validateProject(input), code as string, field as string);
  });

  it('accepts both languages and the three named templates', () => {
    for (const locale of ['zh', 'en'] as const) {
      for (const template of ['split', 'wipe', 'zoom'] as const) {
        const input = { ...fixture(), locale, template };
        expect(model.validateProject(input)).toMatchObject({ locale, template });
      }
    }
  });

  it('keeps a blank project editable before pictures are supplied', () => {
    const result = model.validateProject(model.newProject());
    expect(result.scenes).toHaveLength(1);
    expect(result.scenes[0].before).toBeUndefined();
    expect(result.scenes[0].after).toBeUndefined();
    expect(model.validateProject({ ...fixture(), scenes: [] })).toMatchObject({ scenes: [] });
  });

  it('accepts six scenes and rejects a seventh', () => {
    const input = fixture();
    input.scenes = Array.from({ length: 6 }, (_, index) => ({ ...model.newScene(), id: `scene-${index}` }));
    expect(model.validateProject(input)?.scenes).toHaveLength(6);
    input.scenes.push({ ...model.newScene(), id: 'scene-6' });
    expectProjectError(() => model.validateProject(input), 'scenes', 'scenes');
  });

  it('rejects a sparse scene list rather than saving a null scene', () => {
    const input = fixture();
    input.scenes = new Array(1);
    expectProjectError(() => model.validateProject(input), 'structure', 'scenes[0]');
  });

  it.each(['scene', 'image', 'mixed'])('rejects duplicate %s IDs instead of aliasing resources', kind => {
    const input = fixture();
    if (kind === 'scene') input.scenes.push({ ...model.newScene(), id: 'scene-1' });
    else input.scenes[0].after!.id = kind === 'mixed' ? 'scene-1' : 'before-1';
    expectProjectError(() => model.validateProject(input), 'id');
  });

  it.each(['', ' ', 'bad\0id', 'a'.repeat(129)])('rejects unusable IDs %j', id => {
    const input = fixture();
    input.scenes[0].id = id;
    expectProjectError(() => model.validateProject(input), 'id', 'scenes[0].id');
  });

  it.each([
    ['title', 120], ['beforeLabel', 64], ['afterLabel', 64],
  ] as const)('enforces the %s editor limit without truncation', (field, limit) => {
    const input = fixture();
    input[field] = '界'.repeat(limit);
    expect(model.validateProject(input)?.[field]).toBe(input[field]);
    input[field] += '界';
    expectProjectError(() => model.validateProject(input), 'text', field);
  });

  it.each([
    ['title', 120], ['caption', 500],
  ] as const)('enforces the scene %s editor limit', (field, limit) => {
    const input = fixture();
    input.scenes[0][field] = 'a'.repeat(limit);
    expect(model.validateProject(input)?.scenes[0][field]).toBe(input.scenes[0][field]);
    input.scenes[0][field] += 'a';
    expectProjectError(() => model.validateProject(input), 'text', `scenes[0].${field}`);
  });

  it('rejects long image names and non-string text', () => {
    const input = fixture() as any;
    input.scenes[0].before.name = 'a'.repeat(256);
    expectProjectError(() => model.validateProject(input), 'text', 'scenes[0].before.name');
    input.scenes[0].before.name = 'screen.png';
    input.title = null;
    expectProjectError(() => model.validateProject(input), 'text', 'title');
  });

  it.each([
    ['x', -0.01], ['y', -0.01], ['width', 0.09], ['height', 0.09],
    ['x', 0.3], ['y', 0.5], ['width', 1.1], ['height', 1.1],
    ['x', NaN], ['y', Infinity], ['width', -Infinity], ['height', '0.7'],
  ])('rejects invalid focus %s=%s', (field, value) => {
    const input = fixture();
    (input.scenes[0].focus as any)[field] = value;
    expectProjectError(() => model.validateProject(input), 'focus', 'scenes[0].focus');
  });

  it('accepts focus regions on the exact lower and upper bounds', () => {
    const input = fixture();
    input.scenes[0].focus = { x: 0.9, y: 0.9, width: 0.1, height: 0.1 };
    expect(model.validateProject(input)?.scenes[0].focus).toEqual(input.scenes[0].focus);
    input.scenes[0].focus = { x: 0, y: 0, width: 1, height: 1 };
    expect(model.validateProject(input)?.scenes[0].focus).toEqual(input.scenes[0].focus);
  });

  it('accepts every documented output settings combination', () => {
    for (const width of [480, 960, 1280] as const) {
      for (const fps of [5, 10, 15] as const) {
        for (const secondsPerScene of [2, 3, 4, 6] as const) {
          const input = { ...fixture(), settings: { width, fps, secondsPerScene } };
          expect(model.validateProject(input)?.settings).toEqual({ width, fps, secondsPerScene });
        }
      }
    }
  });

  it.each([
    ['width', 720], ['fps', 0], ['secondsPerScene', 5],
    ['width', Infinity], ['fps', NaN], ['secondsPerScene', '4'],
  ])('rejects output setting %s=%s', (field, value) => {
    const input = fixture();
    (input.settings as any)[field] = value;
    expectProjectError(() => model.validateProject(input), 'settings', `settings.${field}`);
  });

  it.each(['png', 'jpeg', 'webp'])('accepts a strict image/%s base64 data URL', mime => {
    const input = fixture();
    input.scenes[0].before!.dataUrl = `data:image/${mime};base64,AQID`;
    expect(model.validateProject(input)?.scenes[0].before!.dataUrl).toBe(`data:image/${mime};base64,AQID`);
  });

  it.each([
    'https://example.com/screen.png', 'data:image/svg+xml;base64,PHN2Zz4=',
    'data:text/html;base64,PHNjcmlwdD4=', 'data:image/png,AQID',
    'data:image/jpg;base64,AQID', 'data:image/PNG;base64,AQID',
    'data:image/png;base64,', 'data:image/png;base64,AQI',
    'data:image/png;base64,AQ I=', 'data:image/png;base64,AQI===',
    'data:image/png;base64,AQ-I', 'data:image/png;base64,Zh==',
    'data:image/png;base64,AQJ=',
  ])('rejects unsafe or malformed image data %s', dataUrl => {
    const input = fixture();
    input.scenes[0].before!.dataUrl = dataUrl;
    expectProjectError(() => model.validateProject(input), 'image', 'scenes[0].before.dataUrl');
  });

  it.each([
    ['width', 0], ['height', -1], ['width', 1.5], ['height', NaN],
    ['width', Infinity], ['height', '1'], ['width', 4097],
  ])('rejects invalid image dimension %s=%s', (field, value) => {
    const input = fixture();
    (input.scenes[0].before as any)[field] = value;
    expectProjectError(() => model.validateProject(input), 'image');
  });

  it('accepts exactly 8 million image pixels and rejects one row more', () => {
    const input = fixture();
    Object.assign(input.scenes[0].before!, { width: 4000, height: 2000 });
    expect(model.validateProject(input)?.scenes[0].before!.width).toBe(4000);
    input.scenes[0].before!.height = 2001;
    expectProjectError(() => model.validateProject(input), 'image', 'scenes[0].before');
  });

  it('counts decoded bytes for the exact 4 MiB per-image boundary', () => {
    const input = fixture();
    input.scenes[0].before!.dataUrl = dataOfBytes(4 * MiB);
    expect(model.validateProject(input)?.scenes[0].before!.dataUrl.length).toBe(5_592_430);
    input.scenes[0].before!.dataUrl = dataOfBytes(4 * MiB + 1);
    expectProjectError(() => model.validateProject(input), 'capacity', 'scenes[0].before.dataUrl');
  });

  it('accepts 18 MiB across images and rejects another raw byte', () => {
    const input = fixture();
    input.scenes = Array.from({ length: 5 }, (_, index) => ({
      ...model.newScene(), id: `scene-${index}`, before: asset(`image-${index}`, dataOfBytes(index === 4 ? 2 * MiB : 4 * MiB)),
    }));
    expect(model.validateProject(input)?.scenes).toHaveLength(5);
    input.scenes[4].before!.dataUrl = dataOfBytes(2 * MiB + 1);
    expectProjectError(() => model.validateProject(input), 'capacity', 'scenes');
  });
});

describe('project files', () => {
  it('round-trips the screenshot bytes, scene order, and editor settings', () => {
    const input = fixture();
    input.locale = 'en';
    input.template = 'zoom';
    input.scenes.push({ ...model.newScene(), id: 'second', title: 'Mobile', before: asset('b2'), after: asset('a2') });
    const serialized = model.serializeProject(input);
    expect(typeof serialized).toBe('string');
    expect(model.parseProject(serialized!)).toEqual(input);
  });

  it('strips unrecognized content before saving a project', () => {
    const input = { ...fixture(), token: 'unrecognized-value' };
    const serialized = model.serializeProject(input);
    expect(serialized && JSON.parse(serialized)).toEqual(fixture());
  });

  it('validates a typed project again before saving', () => {
    const input = fixture();
    input.scenes[0].focus.x = Infinity;
    expectProjectError(() => model.serializeProject(input), 'focus');
  });

  it.each(['', '{', '<html></html>', 'null', '[]'])('rejects malformed project text %s', serialized => {
    expectProjectError(() => model.parseProject(serialized), 'structure');
  });

  it('accepts a 32 MiB JSON file and rejects one extra byte', () => {
    const json = JSON.stringify(fixture());
    const boundary = json + ' '.repeat(32 * MiB - json.length);
    expect(model.parseProject(boundary)).toEqual(fixture());
    expectProjectError(() => model.parseProject(`${boundary} `), 'capacity', 'project');
  });

  it('measures the project text limit in UTF-8 bytes', () => {
    const json = JSON.stringify({ ...fixture(), discarded: '界'.repeat(12 * MiB) });
    expectProjectError(() => model.parseProject(json), 'capacity', 'project');
  });
});

describe('getExportPlan', () => {
  it.each(['none', 'before', 'after', 'second'])('rejects %s missing screenshots', kind => {
    const input = fixture();
    if (kind === 'none') input.scenes = [];
    else if (kind === 'before') delete input.scenes[0].before;
    else if (kind === 'after') delete input.scenes[0].after;
    else input.scenes.push({ ...model.newScene(), id: 'blank-second' });
    expectProjectError(() => model.getExportPlan(input), 'incomplete');
  });

  it('generates both reveal endpoints for a 3 second 15 fps scene', () => {
    const input = fixture();
    input.settings = { width: 960, fps: 15, secondsPerScene: 3 };
    const frames = model.getExportPlan(input);
    expect(frames).toHaveLength(45);
    expect(frames?.[0]).toEqual({ index: 0, sceneIndex: 0, progress: 0, delayMs: 70 });
    expect(frames?.[22]).toEqual({ index: 22, sceneIndex: 0, progress: 0.5, delayMs: 60 });
    expect(frames?.[44]).toEqual({ index: 44, sceneIndex: 0, progress: 1, delayMs: 70 });
    expect(frames?.slice(0, 3).map(frame => frame.delayMs)).toEqual([70, 60, 70]);
    expect(frames?.reduce((sum, frame) => sum + frame.delayMs, 0)).toBe(3000);
  });

  it('carries array order through scene transitions without skipping endpoints', () => {
    const input = fixture();
    input.settings = { width: 480, fps: 5, secondsPerScene: 2 };
    input.scenes.unshift({ ...model.newScene(), id: 'scene-first', before: asset('b-first'), after: asset('a-first') });
    const frames = model.getExportPlan(input);
    expect(frames).toHaveLength(20);
    expect(frames?.[9]).toEqual({ index: 9, sceneIndex: 0, progress: 1, delayMs: 200 });
    expect(frames?.[10]).toEqual({ index: 10, sceneIndex: 1, progress: 0, delayMs: 200 });
    expect(frames?.[19]).toEqual({ index: 19, sceneIndex: 1, progress: 1, delayMs: 200 });
  });

  it('exports six scenes at 360 frames and rejects an over-budget duration', () => {
    const input = fixture();
    input.settings = { width: 1280, fps: 15, secondsPerScene: 4 };
    input.scenes = Array.from({ length: 6 }, (_, index) => ({
      ...model.newScene(), id: `scene-${index}`, before: asset(`b-${index}`), after: asset(`a-${index}`),
    }));
    const frames = model.getExportPlan(input);
    expect(frames).toHaveLength(360);
    expect(frames?.at(-1)).toEqual({ index: 359, sceneIndex: 5, progress: 1, delayMs: 70 });
    expect(frames?.reduce((sum, frame) => sum + frame.delayMs, 0)).toBe(24_000);
    input.settings.secondsPerScene = 6;
    expectProjectError(() => model.getExportPlan(input), 'capacity', 'settings');
  });

  it('keeps exact elapsed time for every supported frame rate and duration', () => {
    for (const fps of [5, 10, 15] as const) {
      for (const secondsPerScene of [2, 3, 4, 6] as const) {
        const input = { ...fixture(), settings: { width: 480 as const, fps, secondsPerScene } };
        const frames = model.getExportPlan(input);
        expect(frames?.length).toBe(fps * secondsPerScene);
        expect(frames?.reduce((sum, frame) => sum + frame.delayMs, 0)).toBe(secondsPerScene * 1000);
        expect(frames?.every(frame => Number.isInteger(frame.delayMs / 10) && frame.delayMs > 0)).toBe(true);
      }
    }
  });
});

describe('normalizeFocus', () => {
  it.each([
    [{ x: -1, y: -2, width: 3, height: 4 }, { x: 0, y: 0, width: 1, height: 1 }],
    [{ x: 1, y: 1, width: 0.3, height: 0.4 }, { x: 0.7, y: 0.6, width: 0.3, height: 0.4 }],
    [{ x: 0.5, y: 0.4, width: -1, height: 0 }, { x: 0.5, y: 0.4, width: 0.1, height: 0.1 }],
    [{ x: 0.1, y: 0.15, width: 0.8, height: 0.7 }, { x: 0.1, y: 0.15, width: 0.8, height: 0.7 }],
  ])('limits an editable rectangle %j', (input, expected) => {
    expect(model.normalizeFocus(input)).toEqual(expected);
  });

  it.each(['x', 'y', 'width', 'height'] as const)('rejects non-finite %s instead of propagating it to the canvas', field => {
    const input = { x: 0, y: 0, width: 0.5, height: 0.5 };
    input[field] = NaN;
    expectProjectError(() => model.normalizeFocus(input), 'focus');
    input[field] = Infinity;
    expectProjectError(() => model.normalizeFocus(input), 'focus');
  });
});

describe('containRect', () => {
  it.each([
    [[200, 100, 10, 20, 100, 100], { x: 10, y: 45, width: 100, height: 50 }],
    [[100, 200, 10, 20, 100, 100], { x: 35, y: 20, width: 50, height: 100 }],
    [[200, 100, -10, -20, 100, 50], { x: -10, y: -20, width: 100, height: 50 }],
    [[100, 100, 10, 20, 0, 100], { x: 10, y: 70, width: 0, height: 0 }],
  ] as const)('preserves the whole image in box %j', (args, expected) => {
    const [sw, sh, x, y, width, height] = args;
    expect(model.containRect(sw, sh, x, y, width, height)).toEqual(expected);
  });

  it('keeps finite image dimensions when the source has a tiny positive size', () => {
    expect(model.containRect(Number.MIN_VALUE, Number.MIN_VALUE, 0, 0, 100, 100))
      .toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it('rejects a container whose position would overflow finite coordinates', () => {
    expectProjectError(() => model.containRect(1, 100, Number.MAX_VALUE, 0, Number.MAX_VALUE, 100), 'image');
  });

  it.each([
    [0, 100, 0, 0, 100, 100], [100, -1, 0, 0, 100, 100],
    [100, 100, Infinity, 0, 100, 100], [100, 100, 0, NaN, 100, 100],
    [100, 100, 0, 0, -1, 100], [100, 100, 0, 0, 100, Infinity],
  ])('rejects invalid geometry %j', (...args) => {
    expectProjectError(() => model.containRect(...args as [number, number, number, number, number, number]), 'image');
  });
});


