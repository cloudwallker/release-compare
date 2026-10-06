import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode } from 'react';
import { getExportPlan, newScene, normalizeFocus, parseProject, ProjectError, serializeProject, validateProject, type FocusRect, type Project, type Scene, type Template } from './model';
import { loadProjectImages, readImage, type LoadedImages } from './images';
import { canvasHeight, renderFrame } from './render';
import { exportGif, exportPng } from './export';
import { sampleProject } from './samples';
import { errorMessage, messages } from './i18n';
import './styles.css';

type Operation = 'idle' | 'gif' | 'png' | 'import';
type IconName = 'brand' | 'plus' | 'up' | 'down' | 'trash' | 'save' | 'upload' | 'download' | 'image' | 'play' | 'pause' | 'split' | 'wipe' | 'zoom' | 'shield' | 'check' | 'close';

function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    brand: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M12 4v16M7 9h2M15 15h2M8 12h1M15 9h2" /></>,
    plus: <path d="M12 5v14M5 12h14" />, up: <path d="m6 14 6-6 6 6" />, down: <path d="m6 10 6 6 6-6" />,
    trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7" />,
    save: <><path d="M5 3h12l4 4v14H3V3h2Z" /><path d="M7 3v6h10V3M7 21v-8h10v8" /></>,
    upload: <path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6" />,
    download: <path d="M12 3v13m-5-5 5 5 5-5M4 15v6h16v-6" />,
    image: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.5" /><path d="m3 16 5-5 4 4 3-3 6 6" /></>,
    play: <path d="m8 4 13 8-13 8V4Z" />, pause: <path d="M7 4v16M17 4v16" />,
    split: <><rect x="2" y="5" width="8" height="14" rx="1" /><rect x="14" y="5" width="8" height="14" rx="1" /></>,
    wipe: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M12 2v20m-3-10 3-3 3 3" /></>,
    zoom: <><circle cx="10" cy="10" r="7" /><path d="m15 15 6 6M7 10h6M10 7v6" /></>,
    shield: <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6" />,
    check: <path d="m5 12 4 4L19 6" />, close: <path d="m6 6 12 12M18 6 6 18" />,
  };
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function imageKey(project: Project): string {
  return project.scenes.flatMap((scene) => [scene.before, scene.after]).map((asset) => asset ? `${asset.id}:${asset.width}:${asset.height}` : '-').join('|');
}
function filename(title: string): string { return title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().slice(0, 80) || 'release-compare'; }
function fileSize(bytes: number): string { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KiB` : `${(bytes / 1024 / 1024).toFixed(1)} MiB`; }

export default function App() {
  const [project, setProject] = useState<Project>(() => sampleProject('zh'));
  const projectRef = useRef(project);
  const [selectedId, setSelectedId] = useState(() => project.scenes[0].id);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [images, setImages] = useState<LoadedImages>(new Map());
  const imagesRef = useRef<LoadedImages>(images);
  const loadedKeyRef = useRef('');
  const [previewLoading, setPreviewLoading] = useState(true);
  const [operation, setOperation] = useState<Operation>('idle');
  const operationRef = useRef<Operation>('idle');
  const [pendingImages, setPendingImages] = useState(0);
  const pendingImagesRef = useRef(0);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<'cancelled' | null>(null);
  const [encoding, setEncoding] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<{ url: string; size: number; name: string } | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const transientUrls = useRef(new Map<string, number>());
  const controllerRef = useRef<AbortController | null>(null);
  const runRef = useRef(0);
  const projectEpoch = useRef(0);
  const imageRequests = useRef(new Map<string, number>());
  const alive = useRef(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const t = messages[project.locale];
  const sceneIndex = Math.max(0, project.scenes.findIndex((scene) => scene.id === selectedId));
  const scene = project.scenes[sceneIndex];
  const frozen = operation !== 'idle';
  const mediaBusy = frozen || pendingImages > 0 || previewLoading;
  const sourceKey = imageKey(project);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controllerRef.current?.abort();
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      for (const [url, timer] of transientUrls.current) { window.clearTimeout(timer); URL.revokeObjectURL(url); }
      transientUrls.current.clear();
      imagesRef.current.clear();
    };
  }, []);
  useEffect(() => { document.documentElement.lang = project.locale === 'zh' ? 'zh-CN' : 'en'; }, [project.locale]);
  useEffect(() => {
    if (loadedKeyRef.current === sourceKey) return;
    let current = true;
    setPreviewLoading(true);
    loadProjectImages(projectRef.current).then((loaded) => {
      if (!current) { loaded.clear(); return; }
      imagesRef.current.clear();
      imagesRef.current = loaded;
      loadedKeyRef.current = sourceKey;
      setImages(loaded);
      setPreviewLoading(false);
    }).catch((failure: unknown) => { if (current) { setError(failure); setPreviewLoading(false); } });
    return () => { current = false; };
  }, [sourceKey]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || previewLoading) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    try { renderFrame(context, project, images, { sceneIndex, progress }); }
    catch (failure) { setError(failure); }
  }, [project, images, sceneIndex, progress, previewLoading]);
  useEffect(() => {
    if (!playing) return;
    const start = performance.now() - progress * project.settings.secondsPerScene * 1000;
    let request = 0;
    const tick = (now: number) => {
      const next = Math.min(1, (now - start) / (project.settings.secondsPerScene * 1000));
      setProgress(next);
      if (next >= 1) setPlaying(false);
      else request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
    // Playback owns its starting progress; scrubbing pauses it.
  }, [playing, selectedId, project.settings.secondsPerScene]);
  const exportPlan = useMemo(() => {
    try { return { frames: getExportPlan(project), error: null }; }
    catch (failure) { return { frames: [], error: failure }; }
  }, [project]);

  function invalidateResult() {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = null;
    setResult(null);
  }
  function commit(next: Project) {
    projectRef.current = next;
    setProject(next);
    invalidateResult(); setError(null); setNotice(null);
  }
  function edit(mutator: (current: Project) => Project) {
    if (operationRef.current !== 'idle') return;
    commit(mutator(projectRef.current));
  }
  function editScene(patch: Partial<Scene>) {
    const id = scene.id;
    edit((current) => ({ ...current, scenes: current.scenes.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  }
  function chooseScene(id: string) { setSelectedId(id); setProgress(0); setPlaying(false); }
  function addScene() {
    if (operationRef.current !== 'idle' || projectRef.current.scenes.length >= 6) return;
    const next = newScene(); next.title = t.newScene;
    edit((current) => ({ ...current, scenes: [...current.scenes, next] }));
    chooseScene(next.id);
  }
  function moveScene(direction: -1 | 1) {
    const target = sceneIndex + direction;
    if (target < 0 || target >= project.scenes.length) return;
    edit((current) => {
      const scenes = [...current.scenes];
      [scenes[sceneIndex], scenes[target]] = [scenes[target], scenes[sceneIndex]];
      return { ...current, scenes };
    });
  }
  function deleteScene() {
    if (project.scenes.length <= 1) return;
    const remaining = project.scenes.filter((item) => item.id !== scene.id);
    edit((current) => ({ ...current, scenes: remaining }));
    chooseScene(remaining[Math.min(sceneIndex, remaining.length - 1)].id);
  }
  function downloadBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = name;
    document.body.append(link); link.click(); link.remove();
    const timer = window.setTimeout(() => { URL.revokeObjectURL(url); transientUrls.current.delete(url); }, 1500);
    transientUrls.current.set(url, timer);
  }
  function save() {
    try { downloadBlob(new Blob([serializeProject(projectRef.current)], { type: 'application/json' }), `${filename(projectRef.current.title)}.release-compare.json`); }
    catch (failure) { setError(failure); }
  }
  async function replaceImage(event: ChangeEvent<HTMLInputElement>, side: 'before' | 'after') {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
    if (!file || operationRef.current !== 'idle') return;
    const id = scene.id; const epoch = projectEpoch.current; const key = `${id}:${side}`;
    const generation = (imageRequests.current.get(key) ?? 0) + 1;
    imageRequests.current.set(key, generation);
    pendingImagesRef.current += 1; setPendingImages(pendingImagesRef.current);
    invalidateResult(); setError(null);
    try {
      const asset = await readImage(file);
      if (!alive.current || epoch !== projectEpoch.current || imageRequests.current.get(key) !== generation) return;
      const current = projectRef.current;
      if (!current.scenes.some((item) => item.id === id)) return;
      const next = validateProject({ ...current, scenes: current.scenes.map((item) => item.id === id ? { ...item, [side]: asset } : item) });
      commit(next);
    } catch (failure) {
      if (alive.current && epoch === projectEpoch.current && imageRequests.current.get(key) === generation) setError(failure);
    } finally {
      pendingImagesRef.current -= 1;
      if (alive.current) setPendingImages(pendingImagesRef.current);
    }
  }
  async function importProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
    if (!file || operationRef.current !== 'idle' || pendingImagesRef.current > 0) return;
    operationRef.current = 'import'; setOperation('import'); setPlaying(false); setError(null); setNotice(null);
    let loaded: LoadedImages | null = null;
    try {
      if (file.size > 32 * 1024 * 1024) throw Object.assign(new Error('Project file too large'), { code: 'capacity' });
      const candidate = parseProject(await file.text());
      if (!candidate.scenes.length) throw new ProjectError('scenes', 'scenes', 'A project must contain at least one scene.');
      loaded = await loadProjectImages(candidate);
      if (!alive.current) return;
      projectEpoch.current += 1; imageRequests.current.clear();
      loadedKeyRef.current = imageKey(candidate);
      imagesRef.current.clear(); imagesRef.current = loaded; setImages(loaded); loaded = null;
      setPreviewLoading(false); commit(candidate); chooseScene(candidate.scenes[0].id);
    } catch (failure) { if (alive.current) setError(failure); }
    finally { loaded?.clear(); operationRef.current = 'idle'; if (alive.current) setOperation('idle'); }
  }
  function openSample() {
    if (operationRef.current !== 'idle' || pendingImagesRef.current > 0) return;
    projectEpoch.current += 1; imageRequests.current.clear();
    const next = sampleProject(project.locale); commit(next); chooseScene(next.scenes[0].id);
  }
  async function generateGif() {
    if (operationRef.current !== 'idle' || pendingImagesRef.current > 0 || previewLoading) return;
    let snapshot: Project;
    try { snapshot = validateProject(projectRef.current); getExportPlan(snapshot); }
    catch (failure) { setError(failure); return; }
    const run = ++runRef.current; const controller = new AbortController(); controllerRef.current = controller;
    operationRef.current = 'gif'; setOperation('gif'); setPlaying(false); setEncoding({ done: 0, total: getExportPlan(snapshot).length });
    invalidateResult(); setError(null); setNotice(null);
    try {
      const blob = await exportGif(snapshot, { signal: controller.signal, onProgress: (done, total) => { if (alive.current && run === runRef.current && !controller.signal.aborted) setEncoding({ done, total }); } });
      if (!alive.current || run !== runRef.current || controller.signal.aborted) return;
      const url = URL.createObjectURL(blob); resultUrlRef.current = url;
      setResult({ url, size: blob.size, name: `${filename(snapshot.title)}.gif` });
    } catch (failure) {
      if (alive.current && run === runRef.current) {
        if (controller.signal.aborted || (failure instanceof Error && failure.name === 'AbortError')) setNotice('cancelled');
        else setError(failure);
      }
    } finally {
      if (run === runRef.current) { controllerRef.current = null; operationRef.current = 'idle'; if (alive.current) setOperation('idle'); }
    }
  }
  async function generatePng() {
    if (operationRef.current !== 'idle' || pendingImagesRef.current > 0 || previewLoading) return;
    operationRef.current = 'png'; setOperation('png'); setPlaying(false); setError(null);
    try {
      const snapshot = validateProject(projectRef.current);
      const blob = await exportPng(snapshot, { sceneIndex, progress });
      if (alive.current) downloadBlob(blob, `${filename(snapshot.title)}-${sceneIndex + 1}.png`);
    } catch (failure) { if (alive.current) setError(failure); }
    finally { operationRef.current = 'idle'; if (alive.current) setOperation('idle'); }
  }

  const frameCount = project.scenes.length * project.settings.fps * project.settings.secondsPerScene;
  const percent = encoding.total ? Math.round(encoding.done / encoding.total * 100) : 0;
  const templates: Template[] = ['split', 'wipe', 'zoom'];
  const focusControls: { key: keyof FocusRect; label: string; min: number; max: number }[] = [
    { key: 'x', label: t.x, min: 0, max: 1 - scene.focus.width },
    { key: 'y', label: t.y, min: 0, max: 1 - scene.focus.height },
    { key: 'width', label: t.focusWidth, min: 0.1, max: 1 - scene.focus.x },
    { key: 'height', label: t.focusHeight, min: 0.1, max: 1 - scene.focus.y },
  ];
  return <div className="app-shell">
    <header className="app-header">
      <a className="brand" href="#workspace" aria-label="Release Compare"><span className="brand-mark"><Icon name="brand" /></span><span><strong>Release Compare</strong><small>{t.tagline}</small></span></a>
      <div className="header-actions"><span className="local-badge"><Icon name="shield" />{t.local}</span><button className="button language-button" onClick={() => edit((current) => ({ ...current, locale: current.locale === 'zh' ? 'en' : 'zh' }))} disabled={frozen}>{t.language}</button></div>
    </header>
    <main id="workspace">
      <div className="workspace-heading"><div><p className="eyebrow">SCREENSHOTS → RELEASE STORY</p><h1>{t.heading}</h1><p className="intro">{t.intro}</p></div><div className="project-actions">
        <button className="button" onClick={save} disabled={frozen || pendingImages > 0}><Icon name="save" />{t.save}</button>
        <button className="button" onClick={() => importInput.current?.click()} disabled={frozen || pendingImages > 0}><Icon name="upload" />{t.import}</button>
        <input ref={importInput} type="file" accept=".json,application/json" aria-label={t.importFile} className="file-input" disabled={frozen || pendingImages > 0} onChange={importProject} />
      </div></div>
      {error !== null && <div className="error-message" role="alert"><span>{errorMessage(error, project.locale)}</span><button className="icon-button" aria-label={t.removeError} onClick={() => setError(null)}><Icon name="close" /></button></div>}
      {(operation === 'import' || pendingImages > 0) && <div className="processing-message" role="status">{operation === 'import' ? t.importing : t.imageBusy}</div>}
      <div className="workbench">
        <aside className="scene-sidebar panel" aria-label={t.scenes}>
          <div className="panel-title"><h2>{t.scenes}</h2><span className="count-badge">{project.scenes.length} / 6</span></div>
          <ol className="scene-list" aria-label={t.sceneList}>{project.scenes.map((item, index) => <li key={item.id}>
            <button className={`scene-button ${item.id === scene.id ? 'selected' : ''}`} aria-label={`${t.selectScene} ${index + 1}：${item.title || t.untitled}`} aria-current={item.id === scene.id ? 'step' : undefined} disabled={frozen} onClick={() => chooseScene(item.id)}>
              <span className="scene-thumbnail">{item.after ? <img src={item.after.dataUrl} alt="" /> : <Icon name="image" />}<span className="scene-number">{String(index + 1).padStart(2, '0')}</span></span>
              <span className="scene-summary"><strong>{item.title || t.untitled}</strong><span className={`pair-status ${item.before && item.after ? 'ready' : ''}`}><span aria-hidden="true" className="status-dot" />{item.before && item.after ? t.pairReady : t.pairMissing}</span></span>
            </button>
          </li>)}</ol>
          <div className="scene-tools"><button className="icon-button" aria-label={t.moveUp} title={t.moveUp} disabled={frozen || sceneIndex === 0} onClick={() => moveScene(-1)}><Icon name="up" /></button><button className="icon-button" aria-label={t.moveDown} title={t.moveDown} disabled={frozen || sceneIndex === project.scenes.length - 1} onClick={() => moveScene(1)}><Icon name="down" /></button><span className="tool-divider" /><button className="icon-button delete-button" aria-label={t.deleteScene} title={t.deleteScene} disabled={frozen || project.scenes.length <= 1} onClick={deleteScene}><Icon name="trash" /></button></div>
          <button className="button add-scene" disabled={frozen || project.scenes.length >= 6} onClick={addScene}><Icon name="plus" />{t.addScene}</button>
          <div className="scene-guidance"><Icon name="brand" /><h3>{t.sceneTip}</h3><p>{t.sceneHelp}</p><button className="text-button" disabled={frozen || pendingImages > 0} onClick={openSample}>{t.sample}<span aria-hidden="true"> →</span></button></div>
        </aside>
        <section className="editor-column" aria-label={t.preview}>
          <div className="preview-panel panel"><div className="panel-title"><h2>{t.preview}</h2><span className="preview-meta">16:9 <span aria-hidden="true">·</span> {project.settings.width} × {canvasHeight(project.settings.width)}</span></div>
            <figure className="preview-figure"><div className="canvas-stage"><canvas ref={canvasRef} width={project.settings.width} height={canvasHeight(project.settings.width)} role="img" aria-label={t.previewLabel} aria-describedby="preview-description" />{previewLoading && <div className="preview-loading" role="status">{t.imagePreviewBusy}</div>}</div><figcaption id="preview-description" className="preview-caption"><span className="sr-only">{project.title} · {project.beforeLabel} → {project.afterLabel} · </span><strong>{scene.title || t.untitled}</strong><span>{scene.caption}</span></figcaption></figure>
            <div className="timeline-controls"><button className="icon-button play-button" aria-label={playing ? t.pause : t.play} disabled={frozen || previewLoading} onClick={() => { if (!playing && progress >= 1) setProgress(0); setPlaying(!playing); }}><Icon name={playing ? 'pause' : 'play'} /></button><div className="timeline-track"><div className="timeline-labels"><span>{t.old}</span><span className="after-text">{t.next}</span></div><input type="range" aria-label={t.timeline} min="0" max="1" step="0.01" value={progress} disabled={frozen} onChange={(event) => { setPlaying(false); setProgress(Number(event.currentTarget.value)); }} style={{ '--range-fill': `${progress * 100}%` } as CSSProperties} /></div><output className="time-display" aria-label={t.framePosition}>{(progress * project.settings.secondsPerScene).toFixed(1)}<span> / {project.settings.secondsPerScene}.0 {t.secondUnit}</span></output></div>
          </div>
          <fieldset className="template-panel panel" disabled={frozen}><legend className="sr-only">{project.locale === 'zh' ? '对照模板' : 'Comparison template'}</legend><div className="template-tabs">{templates.map((template) => <label key={template} className={`template-option ${project.template === template ? 'active' : ''}`}><input type="radio" name="template" value={template} checked={project.template === template} onChange={() => edit((current) => ({ ...current, template }))} /><Icon name={template} /><span>{t[template]}</span></label>)}</div><p className="template-description">{t[`${project.template}Help`]}</p>
            {project.template === 'zoom' && <div className="focus-grid">{focusControls.map((control) => <label key={control.key} className="focus-control"><span>{control.label}<output>{Math.round(scene.focus[control.key] * 100)}%</output></span><input type="range" aria-label={control.label} min={control.min} max={Number(control.max.toFixed(2))} step="0.01" value={scene.focus[control.key]} onChange={(event) => editScene({ focus: normalizeFocus({ ...scene.focus, [control.key]: Number(event.currentTarget.value) }) })} /></label>)}</div>}
          </fieldset>
          <section className="scene-editor panel"><div className="panel-title"><h2>{t.sceneEditor}</h2><span className="count-badge">{String(sceneIndex + 1).padStart(2, '0')}</span></div><fieldset disabled={frozen} className="form-fields"><label className="field"><span>{t.sceneTitle}</span><input aria-label={t.sceneTitle} maxLength={120} value={scene.title} onChange={(event) => editScene({ title: event.currentTarget.value })} /></label><label className="field"><span>{t.caption}</span><textarea aria-label={t.caption} maxLength={500} value={scene.caption} rows={2} onChange={(event) => editScene({ caption: event.currentTarget.value })} /><span className="field-help character-count">{scene.caption.length} / 500</span></label>
            <div className="upload-grid">{(['before', 'after'] as const).map((side) => <div className={`upload-card ${side}`} key={side}><div className="upload-heading"><span className="version-dot" />{side === 'before' ? t.beforeUpload : t.afterUpload}</div><label className="upload-target"><Icon name={scene[side] ? 'image' : 'upload'} /><span><strong>{t.chooseImage}</strong><small>{scene[side]?.name || t.emptyImage}</small></span><input type="file" accept="image/png,image/jpeg,image/webp" className="file-input" aria-label={side === 'before' ? t.beforeUpload : t.afterUpload} onChange={(event) => replaceImage(event, side)} /></label>{scene[side] && <p className="image-dimensions">{scene[side].width} × {scene[side].height}</p>}</div>)}</div><p className="field-help upload-hint">{t.imageHint}</p>
          </fieldset></section>
        </section>
        <aside className="settings-column" aria-label={t.output}>
          <section className="panel"><div className="panel-title"><h2>{t.project}</h2><Icon name="brand" /></div><fieldset disabled={frozen} className="form-fields"><label className="field"><span>{t.projectTitle}</span><input aria-label={t.projectTitle} maxLength={120} value={project.title} onChange={(event) => edit((current) => ({ ...current, title: event.currentTarget.value }))} /></label><label className="field"><span><i className="label-dot before-dot" />{t.beforeLabel}</span><input aria-label={t.beforeLabel} maxLength={64} value={project.beforeLabel} onChange={(event) => edit((current) => ({ ...current, beforeLabel: event.currentTarget.value }))} /></label><label className="field"><span><i className="label-dot after-dot" />{t.afterLabel}</span><input aria-label={t.afterLabel} maxLength={64} value={project.afterLabel} onChange={(event) => edit((current) => ({ ...current, afterLabel: event.currentTarget.value }))} /></label></fieldset></section>
          <section className="panel output-panel"><div className="panel-title"><h2>{t.output}</h2><span className="format-badge">GIF</span></div><fieldset disabled={frozen} className="form-fields"><label className="field"><span>{t.width}</span><select aria-label={t.width} value={project.settings.width} onChange={(event) => edit((current) => ({ ...current, settings: { ...current.settings, width: Number(event.currentTarget.value) as Project['settings']['width'] } }))}>{[480, 960, 1280].map((width) => <option key={width} value={width}>{width} px</option>)}</select></label><div className="setting-pair"><label className="field"><span>{t.fps}</span><select aria-label={t.fps} value={project.settings.fps} onChange={(event) => edit((current) => ({ ...current, settings: { ...current.settings, fps: Number(event.currentTarget.value) as Project['settings']['fps'] } }))}>{[5, 10, 15].map((fps) => <option key={fps} value={fps}>{fps} fps</option>)}</select></label><label className="field"><span>{t.seconds}</span><select aria-label={t.seconds} value={project.settings.secondsPerScene} onChange={(event) => edit((current) => ({ ...current, settings: { ...current.settings, secondsPerScene: Number(event.currentTarget.value) as Project['settings']['secondsPerScene'] } }))}>{[2, 3, 4, 6].map((seconds) => <option key={seconds} value={seconds}>{seconds} {t.secondUnit}</option>)}</select></label></div></fieldset>
            <div className="export-summary"><div><span>{t.duration}</span><strong>{project.scenes.length * project.settings.secondsPerScene}<small> {t.secondUnit}</small></strong></div><div><span>{t.frames}</span><strong className={frameCount > 360 ? 'limit-exceeded' : ''}>{frameCount}</strong></div></div>
            {exportPlan.error !== null && <p className="export-help">{frameCount > 360 ? t.frameLimit : t.missing}</p>}
            <div className="export-actions"><button className="button primary-button" onClick={generateGif} disabled={mediaBusy || exportPlan.error !== null}><Icon name="download" />{operation === 'gif' ? t.exporting : t.gif}</button>
              {operation === 'gif' && <div className="encoding-status" role="status"><div><span>{t.exporting}</span><strong>{percent}%</strong></div><progress aria-label={t.exportProgress} value={encoding.done} max={encoding.total || 1} /><button className="button cancel-button" onClick={() => controllerRef.current?.abort()}>{t.cancel}</button></div>}
              {result && <div className="download-result"><span><Icon name="check" />{t.complete}<small>{fileSize(result.size)}</small></span><a className="button download-button" href={result.url} download={result.name}><Icon name="download" />{t.download}</a></div>}
              {notice && <p className="notice" role="status">{t[notice]}</p>}
              <button className="button png-button" onClick={generatePng} disabled={mediaBusy || !scene.before || !scene.after}><Icon name="image" />{operation === 'png' ? t.pngBusy : t.png}</button></div>
          </section>
          <div className="local-note"><Icon name="shield" /><p>{t.localHelp}</p></div>
        </aside>
      </div>
      <footer className="app-footer"><span>{t.footer}</span><span>{t.limits}</span></footer>
    </main>
  </div>;
}
