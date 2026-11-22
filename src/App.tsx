import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BreadboardCanvas, PartTray } from './Breadboard';
import { mountSimulation } from './simulation.js';
import { baseParts, ensureInstance, partType } from './catalog';
import { HardwareLibrary } from './HardwareLibrary';
import { readWorkspaceDraft } from './workspaceDraft';
import { Plus, Trash2, Cable, Eye, EyeOff, X, Info, Power, Minus, RotateCcw } from 'lucide-react';
import { themeArtwork } from './themeArtwork';
import './theme-toggle.css';
import { ModuleDetails, type DetailSelection } from './ModuleDetails';

export default function App() {
  const root = useRef<HTMLElement>(null);
  const engine = useRef<ReturnType<typeof mountSimulation> | null>(null);
  const [zoom, setZoom] = useState(100);
  const [fitPitch, setFitPitch] = useState(18);
  const [isDark, setIsDark] = useState(false);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('esp32-theme');
    return saved === 'dark' || saved === 'light' ? saved :
      matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    setIsDark(theme === 'dark');
    localStorage.setItem('esp32-theme', theme);
  }, [theme]);
  const [draft] = useState(readWorkspaceDraft);
  const [added, setAdded] = useState<string[]>(() => draft?.added ?? []);
  const [boardCount, setBoardCount] = useState(() => draft?.boardCount ?? 2);
  const pendingPlacement = useRef<string | null>(null);
  const [detail, setDetail] = useState<DetailSelection | null>(null);
  for (const id of added) ensureInstance(id);
  const visibleParts = [...baseParts, ...added];

  useLayoutEffect(() => {
    if (!root.current) return;
    const controller = mountSimulation(root.current,draft,setBoardCount,setDetail,
      (id: string, present: boolean) => setAdded(current =>
        present ? [...new Set([...current,id])] : current.filter(part => part !== id)));
    engine.current = controller;
    return () => {
      controller.dispose();
      engine.current = null;
    };
  }, [draft]);

  useLayoutEffect(() => {
    if (!engine.current) return;
    for (const id of added) engine.current.registerPart(id);
    if (pendingPlacement.current) {
      engine.current.beginPlacement(pendingPlacement.current);
      pendingPlacement.current = null;
    }
  }, [added]);

  useLayoutEffect(() => {
    engine.current?.syncBoards(boardCount);
  }, [boardCount]);

  useLayoutEffect(() => {
    const viewport = root.current?.querySelector<HTMLElement>('#viewport');
    const canvas = viewport?.querySelector<HTMLElement>('.canvas');
    const grid = canvas?.querySelector<HTMLElement>('.grid');
    if (!viewport || !canvas || !grid) return;
    const fit = () => {
      const pitch = grid.getBoundingClientRect().height / 31;
      const fixedHeight = canvas.getBoundingClientRect().height - pitch * 32.25;
      setFitPitch(Math.max(1, (viewport.clientHeight - fixedHeight - 16) / 32.25));
    };
    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    fit();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const viewport = root.current?.querySelector<HTMLElement>('#viewport');
    if (!viewport) return;
    const clamp = (value: number) => Math.max(60,Math.min(160,value));
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom(value => clamp(value * Math.exp(-event.deltaY * 0.008)));
    };
    let distance = 0;
    const gap = (touches: TouchList) => Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY);
    const start = (event: TouchEvent) => { if (event.touches.length === 2) distance = gap(event.touches); };
    const move = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      event.preventDefault();
      const next = gap(event.touches);
      const ratio = distance > 0 ? next / distance : 1;
      setZoom(value => clamp(value * ratio));
      distance = next;
    };
    const end = () => { distance = 0; };
    viewport.addEventListener('wheel',wheel,{passive:false});
    viewport.addEventListener('touchstart',start,{passive:true});
    viewport.addEventListener('touchmove',move,{passive:false});
    viewport.addEventListener('touchend',end);
    return () => {
      viewport.removeEventListener('wheel',wheel);
      viewport.removeEventListener('touchstart',start);
      viewport.removeEventListener('touchmove',move);
      viewport.removeEventListener('touchend',end);
    };
  }, []);

  return <main ref={root} className="workbench-shell" style={{ '--canvas-pitch': (fitPitch * zoom / 100) + 'px' } as React.CSSProperties}>
<header><h1>ESP32 接线实验室</h1>
<div className="theme-control">
<button type="button" className="theme-toggle" aria-label="深色主题" aria-pressed={isDark}
 title={isDark ? '切换为浅色' : '切换为深色'} onClick={() => setTheme(isDark ? 'light' : 'dark')}>
<span className="theme-toggle__content" aria-hidden="true">
<span dangerouslySetInnerHTML={{ __html: themeArtwork }} />
<span className="theme-toggle__indicator-wrapper"><span className="theme-toggle__indicator"><span className="theme-toggle__star"><span className="sun"><span className="moon"><span className="moon__crater" /><span className="moon__crater" /><span className="moon__crater" /></span></span></span></span></span>
</span></button>

</div></header>
<div className="workbench">
<section className="bench-main" aria-label="面包板工作区">
<div className="bench-controls">
<section className="panel toolbar" aria-label="元件与实验操作">
<div hidden><PartTray ids={visibleParts} onRemove={id => engine.current?.deleteDevice(id)} /></div>
<div className="actions">

<button id="add-board" type="button" aria-label="添加面包板" title="添加面包板" onClick={() => engine.current?.addBoard()}><Plus size={15} />面包板</button>
<span className="undo-hint">⌘Z 撤销</span>
<div className="power-indicator" role="status"><span id="power-state">已断电 · 可编辑</span><button type="button" id="power-off" disabled><Power size={15} />断电</button></div>
<button id="reset"><Trash2 size={15} />清空</button>
<button id="wire-visibility" aria-pressed="false"><Cable size={15} /><span data-visibility-label>隐藏连线</span></button>
<button id="hardware-visibility" aria-pressed="false"><EyeOff size={15} className="visibility-hide-icon" /><Eye size={15} className="visibility-show-icon" /><span data-visibility-label>隐藏硬件</span></button>

</div>
</section>
<p className="bench-hint">点两个孔接线。右键元件看针脚，可在画布内上下、左右滚动。</p>
<p id="bench-status" className="bench-hint" role="status"></p>
</div>
<div className="viewport" id="viewport" tabIndex={0} aria-label="面包板画布，可横向和纵向滚动"><BreadboardCanvas ids={visibleParts} boardCount={boardCount} /></div>
<div id="selection-actions" className="selection-actions" role="group" aria-label="当前选择操作" hidden>
<button id="cancel" hidden><X size={15} />取消</button>
<button id="module-details" type="button" hidden><Info size={15} />针脚详情</button>
</div>
<div className="canvas-zoom" role="group" aria-label="画布缩放">
<button type="button" aria-label="缩小画布" disabled={zoom <= 60} onClick={() => setZoom(value => Math.max(60,value - 10))}><Minus size={15} /></button>
<button type="button" aria-label="重置画布缩放" onClick={() => setZoom(100)}><RotateCcw size={13} />{Math.round(zoom)}%</button>
<button type="button" aria-label="放大画布" disabled={zoom >= 160} onClick={() => setZoom(value => Math.min(160,value + 10))}><Plus size={15} /></button>
</div>
<div className="canvas-component-dock"><HardwareLibrary added={added} openInitially={!draft} onAdd={id => {
  const count = added.filter(instance => partType(instance) === id).length;
  const next = count === 0 && !added.includes(id) ? id : id + '#' +
    (Math.max(1,...added.filter(instance => partType(instance) === id).map(instance => Number(instance.split('#')[1]) || 1)) + 1);
  pendingPlacement.current = next;
  ensureInstance(next);
  setAdded(current => [...current,next]);
}} onMainboard={() => engine.current?.beginPlacement('esp')} /></div>
</section>
<aside className="side side-open" id="workbench-side">
<section className="panel"><h2>当前操作</h2><p id="status" className="status" role="status">先从硬件库选设备，再把设备放到面包板上。</p><p id="inspect" aria-live="polite"></p><p id="save-warning" role="status" hidden>浏览器暂时无法保存布线，刷新前请留意。</p>
<div className="actions"><button id="move" hidden>移动该模块</button><button id="remove-part" hidden>取下模块</button><button id="delete-device" hidden>删除设备</button></div></section>
<section className="panel" id="effects"><div className="effect-heading"><h2>通电测试</h2><button className="primary" id="test" aria-keyshortcuts="Enter" title="模拟通电（Enter）"><Power size={15} /><span id="power-action">模拟通电</span> <kbd aria-hidden="true">↵</kbd></button></div>
<p id="test-summary" className="test-summary muted" role="status" hidden></p>
<div id="test-picker" className="test-picker" role="group" aria-label="选择测试设备" hidden></div>
<p id="test-empty" className="muted">摆放主板和外设后，点「模拟通电」检查接线。</p>
<div id="peripheral-effects" className="test-details" hidden>
  <div id="pot-test" data-test-panel="pot" hidden>
    <h3>电位器 · ADC</h3>
    <label htmlFor="pot-value">模拟旋钮</label>
    <input id="pot-value" type="range" min="0" max="100" step="1" defaultValue="50" disabled />
    <p id="pot-result" aria-live="polite"></p>
  </div>
  <div id="buzzer-test" data-test-panel="buzzer" hidden>
    <h3>有源蜂鸣器 · 数字输出</h3>
    <button id="buzzer-demo" disabled>触发蜂鸣</button>
    <p id="buzzer-result" role="status"></p>
  </div>
  <div id="bme280-test" data-test-panel="bme280" hidden>
    <h3>BME280 · I²C</h3>
    <button id="bme280-demo" disabled>读取传感器</button>
    <p id="bme280-result" role="status"></p>
  </div>
  <div id="ldr-test" data-test-panel="ldr" hidden>
    <h3>光敏电阻 · ADC</h3>
    <label htmlFor="ldr-value">模拟光照（%）</label>
    <input id="ldr-value" type="range" min="0" max="100" defaultValue="40" disabled />
    <p id="ldr-result" aria-live="polite"></p>
  </div>
  <div id="pir-test" data-test-panel="pir" hidden>
    <h3>AM312 · 人体感应</h3>
    <button id="pir-demo" disabled>模拟有人经过</button>
    <p id="pir-result" role="status"></p>
  </div>
  <div id="sonar-test" data-test-panel="sonar" hidden>
    <h3>US-100 · 超声波测距</h3>
    <label htmlFor="sonar-value">目标距离（厘米）</label>
    <input id="sonar-value" type="range" min="3" max="300" defaultValue="30" disabled />
    <p id="sonar-result" aria-live="polite"></p>
  </div>
  <div id="servo-test" data-test-panel="servo" hidden>
    <h3>SG90 · PWM 舵机</h3>
    <label htmlFor="servo-value">目标角度（°）</label>
    <input id="servo-value" type="range" min="0" max="180" defaultValue="90" disabled />
    <p id="servo-result" aria-live="polite"></p>
  </div>
</div>
<div className="readouts" id="voice-effects" hidden>
<article id="screen-test" data-test-panel="screen"><h3>OLED</h3><div className="oled" id="display">屏幕熄灭</div><p id="screen-result">未通电</p></article>
<article id="mic-test" data-test-panel="mic"><h3>麦克风</h3><button id="mic-demo" disabled>模拟说话</button><p id="mic-result" role="status">未通电</p><p id="voice-reply" role="status" hidden></p></article>
<article id="speaker-test" data-test-panel="speaker"><h3>功放与喇叭</h3><button id="speaker-demo" disabled>播放测试音</button><p className="muted" id="amp-result">功放输入待检查</p><p id="speaker-result">未通电</p>
<button id="audio-check">试听浏览器声音</button><p id="audio-status" role="status"></p></article>
</div>
<div id="hardware-effects" className="test-details" hidden>
  <div data-test-panel="led" hidden>
    <h3>LED 指示灯</h3>
    <button id="led-demo" disabled>切换 LED</button>
    <p id="led-result" role="status"></p>
  </div>
  <div data-test-panel="button" hidden>
    <h3>常开按钮</h3>
    <button id="button-demo" disabled>按一下按钮</button>
    <p id="button-result" role="status"></p>
  </div>
</div></section>
<section className="panel"><h2>跳线 <span id="wire-count">0</span></h2><p className="muted">实心点是跳线端点或模块针脚。相同颜色表示同一网络，点线或单线端点可选中跳线，按 Delete 拆线。</p><ul id="wire-list" className="wire-list"></ul></section>
</aside>
</div>
<ModuleDetails selection={detail} onClose={() => setDetail(null)} />
<div id="drag-label" className="drag-label" hidden />
</main>;
}
