import {
  partType,
  baseParts,
  getBoardCells,
  columns,
  rowCount,
  parts,
  sourceLabel,
  gridX,
  holeId,
  footprintHole,
  moduleBounds,
  worldBounds,
  boardX,
  crossesBoards,
} from './catalog.js';
import { nearestAnchor } from './placement.js';
import { saveWorkspaceDraft } from './workspaceDraft.js';
import replyUrl from './voice-reply.m4a?url';

export function mountSimulation(root, draft, setBoardCount, openDetails, setDevicePresent) {
  const listeners = new AbortController();
  const onGlobal = (target, event, handler) =>
    target.addEventListener(event, handler, { signal: listeners.signal });

  const byId = (id) => root.querySelector('#' + id);
  const canvas = byId('canvas');
  const svg = byId('wires');
  const pinLabels = document.createElement('div');
  pinLabels.className = 'pin-label-layer';
  pinLabels.setAttribute('aria-hidden', 'true');
  canvas.append(pinLabels);
  const holes = new Map();
  const strips = new Map();
  const tray = new Map();
  const modules = new Map();
  const boundBoards = new Set();
  const state = {
    placements: new Map(),
    wires: [],
    history: [],
    mode: null,
    start: null,
    focusWire: null,
    selected: null,
    inspectedPart: null,
    showWires: true,
    tested: false,
    drag: null,
    ledOn: false,
    buttonPressed: false,
  };
  let nextWire = 1;
  let releaseTimer;
  let motionTimer;
  let voiceTimer;
  let network;
  let wirePreview;
  let pendingBoardChange;
  let pendingDeviceUndo;
  let activeTest;
  const netPalette = [
    '#007568',
    '#b33d58',
    '#286ac3',
    '#9b5a00',
    '#8742a3',
    '#007e9d',
    '#b54120',
    '#637b16',
    '#8c3c6f',
    '#4e5dba',
    '#087f42',
    '#a34e2b',
    '#73502b',
    '#ad326f',
    '#315b72',
    '#7c8715',
  ];
  function getNetwork() {
    const net = buildNets();
    const labels = new Map();
    for (const wire of state.wires) {
      const group = net(wire.from);
      if (labels.has(group)) continue;
      const index = labels.size;
      const color = netPalette[index] ?? 'hsl(' + Math.round((index * 137.508) % 360) + ' 65% 41%)';
      labels.set(group, { color, name: '网络 ' + (index + 1) });
    }
    return { net, labels };
  }

  function bindBoard(index) {
    boundBoards.add(index);
    const board = canvas.querySelector('[data-board-index="' + index + '"]');
    const buttons = new Map(
      [...board.querySelectorAll('[data-hole]')].map((button) => [button.dataset.hole, button]),
    );
    for (const cell of getBoardCells(index)) {
      if (cell.kind !== 'hole') continue;
      holes.set(cell.id, { ...cell, button: buttons.get(cell.id) });
      if (!strips.has(cell.strip)) strips.set(cell.strip, []);
      strips.get(cell.strip).push(cell.id);
    }
  }
  for (let index = 0; index < (draft?.boardCount ?? 2); index++) bindBoard(index);

  function boardSnapshot() {
    return {
      placements: new Map(state.placements),
      wires: state.wires.slice(),
      boardCount: boundBoards.size,
    };
  }
  function queueBoardChange(count, change) {
    stopDrag();
    pendingBoardChange = change;
    setBoardCount(count);
  }
  function syncBoards(count) {
    if (boundBoards.size === count) return;
    const change = pendingBoardChange;
    pendingBoardChange = undefined;
    if (change?.placements) {
      holes.clear();
      strips.clear();
      boundBoards.clear();
      for (let index = 0; index < count; index++) bindBoard(index);
      state.placements = new Map(change.placements.map(([part, id]) => [part, holes.get(id)]));
      state.wires = change.wires;
      state.tested = false;
      resetHardwareEffects();
      resetVoiceDemo();
      clearSelection();
      state.focusWire = null;
    } else {
      for (let index = boundBoards.size; index < count; index++) bindBoard(index);
    }
    render();
    persist();
    if (change?.showBoard !== undefined) {
      const board = canvas.querySelector('[data-board-index="' + change.showBoard + '"]');
      placementViewport.scrollLeft +=
        board.getBoundingClientRect().left - placementViewport.getBoundingClientRect().left;
      placementViewport.scrollTop = 0;
    }
    if (change?.message) status(change.message);
  }
  function addBoard() {
    if (editingLocked()) return;
    const index = boundBoards.size;
    state.history.push(boardSnapshot());
    queueBoardChange(index + 1, {
      showBoard: index,
      message: '已添加第 ' + (index + 1) + ' 块板。',
    });
  }
  function removeBoard(index) {
    if (editingLocked()) return;
    if (boundBoards.size <= 1) return;
    const fromBoard = (id) => holes.get(id).board === index;
    const affected = new Set(
      [...occupied()].filter(([id]) => fromBoard(id)).map(([, pin]) => pin.part),
    );
    const touchesBoard = (wire) => fromBoard(wire.from) || fromBoard(wire.to);
    const count = state.wires.filter(touchesBoard).length;
    if (
      (affected.size || count) &&
      !window.confirm(
        '移除第 ' +
          (index + 1) +
          ' 块板会取下 ' +
          affected.size +
          ' 个相关元件并拆除 ' +
          count +
          ' 根跳线。按 ⌘Z 可撤销。继续移除？',
      )
    )
      return;
    function shift(id) {
      const { board, col, row } = holes.get(id);
      return holeId(board > index ? board - 1 : board, col, row);
    }
    const placements = [...state.placements]
      .filter(([part]) => !affected.has(part))
      .map(([part, anchor]) => [part, shift(anchor.id)]);
    const wires = state.wires
      .filter((wire) => !touchesBoard(wire))
      .map((wire) => ({ ...wire, from: shift(wire.from), to: shift(wire.to) }));
    state.history.push(boardSnapshot());
    queueBoardChange(boundBoards.size - 1, {
      placements,
      wires,
      message: '已移除面包板。按 ⌘Z 可恢复。',
    });
  }
  function bindPart(id) {
    tray.set(id, byId('rack').querySelector('[data-part="' + id + '"]'));
    modules.set(id, canvas.querySelector('[data-part="' + id + '"]'));
  }
  for (const id of [...baseParts, ...(draft?.added ?? [])]) bindPart(id);
  function beginPlacement(id) {
    if (editingLocked()) return;
    if (state.mode !== id) choosePart(id);
    status('已选择 ' + parts.get(id).name + '。移到孔位查看预览，点击确认放置，Esc 取消。');
  }
  function registerPart(id) {
    if (modules.has(id)) return;
    bindPart(id);
    if (pendingDeviceUndo?.restoreDevice === id) {
      const previous = pendingDeviceUndo;
      pendingDeviceUndo = undefined;
      restoreHistory(previous);
      return;
    }
    render();
    persist();
    status(parts.get(id).name + ' 已加入托盘。拖到空孔即可摆放。');
  }
  const status = (message) => {
    byId('status').textContent = message;
    byId('bench-status').textContent = message;
  };
  function occupied(placements = state.placements) {
    const pins = new Map();
    for (const [part, anchor] of placements) {
      for (const pin of parts.get(part).pins) {
        const id = footprintHole(part, anchor, pin);
        pins.set(id, { ...pin, part });
      }
    }
    return pins;
  }
  function fits(part, anchor) {
    const others = new Map(state.placements);
    others.delete(part);
    const current = occupied(others);
    const targets = parts.get(part).pins.map((pin) => footprintHole(part, anchor, pin));
    if (
      targets.some((id) => {
        const hole = holes.get(id);
        return !hole || hole.col < 2 || hole.col > 12 || current.has(id);
      })
    )
      return false;
    if (part === 'esp' && ![2, 3].includes(anchor.col) && !crossesBoards(part, anchor))
      return false;
    if (partType(part) === 'mic' && ![5, 6].includes(anchor.col)) return false;
    if (partType(part) === 'amp' && ![8, 9].includes(anchor.col)) return false;
    if (partType(part) === 'speaker' && moduleBounds(part, anchor).x1 > 15.5) return false;
    const placed = worldBounds(part, anchor);
    return ![...others].some(([other, position]) => {
      const compared = worldBounds(other, position);
      return (
        placed.x0 < compared.x1 &&
        placed.x1 > compared.x0 &&
        placed.y0 < compared.y1 &&
        placed.y1 > compared.y0
      );
    });
  }
  function clearSelection() {
    state.mode = null;
    state.inspectedPart = null;
    state.start = null;
    state.selected = null;
  }
  function persist() {
    const saved = saveWorkspaceDraft({
      added: [...modules.keys()].filter((id) => !baseParts.includes(id)),
      boardCount: boundBoards.size,
      placements: [...state.placements].map(([part, anchor]) => [part, anchor.id]),
      wires: state.wires,
      showWires: state.showWires,
      hardwareHidden: canvas.classList.contains('hide-hardware'),
      tested: state.tested,
      ledOn: state.ledOn,
    });
    byId('save-warning').hidden = saved;
  }
  function restoreDraft() {
    if (!draft) return;
    for (const [part, id] of draft.placements) {
      const anchor = holes.get(id);
      if (modules.has(part) && anchor && fits(part, anchor)) state.placements.set(part, anchor);
    }
    const knownWires = new Set();
    for (const wire of draft.wires) {
      if (
        knownWires.has(wire.id) ||
        wire.from === wire.to ||
        !holes.has(wire.from) ||
        !holes.has(wire.to)
      )
        continue;
      knownWires.add(wire.id);
      state.wires.push(wire);
      nextWire = Math.max(nextWire, wire.id + 1);
    }
    state.showWires = draft.showWires;
    canvas.classList.toggle('hide-hardware', draft.hardwareHidden);
    syncVisibilityButtons();
    state.tested = draft.tested;
    state.ledOn = draft.ledOn;
    status('已恢复上次的工作台。');
  }
  function mutate(edit, restore = {}) {
    if (editingLocked()) return;
    preview(null, null);
    state.history.push({
      placements: new Map(state.placements),
      wires: state.wires.slice(),
      ...restore,
    });
    edit();
    state.tested = false;
    resetHardwareEffects();
    resetVoiceDemo();
    clearSelection();
    state.focusWire = null;
    render();
    persist();
  }
  function selectPart(part) {
    clearSelection();
    state.inspectedPart = part;
    state.focusWire = null;
    renderSelection();
    drawWires();
    showTest(part === 'amp' ? 'speaker' : part);
    status('已选中 ' + parts.get(part).name + '。按住板身拖动位置，右键查看针脚。');
  }
  function choosePart(part) {
    if (state.placements.has(part)) {
      selectPart(part);
      return;
    }
    if (editingLocked()) return;
    state.mode = state.mode === part ? null : part;
    preview(null, null);
    state.start = null;
    state.selected = null;
    if (state.mode)
      status(
        '给 ' +
          parts.get(part).name +
          ' 选一个起始孔。' +
          (part === 'esp'
            ? '单板从 A 或 B 列起，跨板从有右侧相邻板的 I 或 J 列起。'
            : part === 'mic'
              ? '麦克风从 D 或 E 列起，双排跨过中槽。'
              : part === 'amp'
                ? '功放从 F 或 G 列起，绿色端子位于中槽另一侧。'
                : '其余针脚沿所在列向下排列。'),
      );
    else status('已取消摆放。');
    if (state.mode && state.placements.has(part)) showTest(part === 'amp' ? 'speaker' : part);
    if (state.focusWire !== null) focusWire(null);
    else renderSelection();
  }
  function wireMovePlan(part, anchor) {
    const previous = state.placements.get(part);
    if (!previous || previous.id === anchor.id) return;
    const otherPlacements = new Map(state.placements);
    otherPlacements.delete(part);
    const otherPins = occupied(otherPlacements);
    const sharedStrips = new Set([...otherPins.keys()].map((id) => holes.get(id).strip));
    const assignments = new Map();
    const bridges = [];
    const newPins = new Set();
    for (const pin of parts.get(part).pins) {
      const oldId = footprintHole(part, previous, pin);
      const newId = footprintHole(part, anchor, pin);
      newPins.add(newId);
      const oldHole = holes.get(oldId);
      const newHole = holes.get(newId);
      if (oldHole.strip === newHole.strip || !sharedStrips.has(oldHole.strip)) {
        assignments.set(oldHole.strip, { oldHole, newHole });
      } else {
        bridges.push({ from: oldId, to: newId });
      }
    }
    const bounds = worldBounds(part, anchor);
    function endpoint(id) {
      const original = holes.get(id);
      const move = assignments.get(original.strip);
      if (!move) return id;
      const { oldHole, newHole } = move;
      if (id === oldHole.id) return newHole.id;
      if (oldHole.strip === newHole.strip) return id;
      const wantedX = boardX(newHole) + boardX(original) - boardX(oldHole);
      return (
        strips.get(newHole.strip).find((candidate) => {
          const socket = holes.get(candidate);
          return (
            boardX(socket) === wantedX &&
            !newPins.has(candidate) &&
            !otherPins.has(candidate) &&
            (wantedX < bounds.x0 || wantedX > bounds.x1)
          );
        }) ?? newHole.id
      );
    }
    return { endpoint, bridges };
  }
  function applyWireMove(plan) {
    const wires = state.wires.flatMap((wire) => {
      const from = plan.endpoint(wire.from);
      const to = plan.endpoint(wire.to);
      return from === to ? [] : [{ ...wire, from, to }];
    });
    for (const bridge of plan.bridges) {
      const net = buildNets(wires);
      if (net(bridge.from) !== net(bridge.to)) wires.push({ ...bridge, id: nextWire++ });
    }
    state.wires = wires;
  }
  function place(part, id) {
    const anchor = holes.get(id);
    if (!fits(part, anchor)) {
      status(
        '这里放不下 ' +
          parts.get(part).name +
          '。' +
          (part === 'esp'
            ? '在第 1 到 9 行选 A/B 列，或从 I/J 列跨到右侧相邻板。请检查板身有无遮挡。'
            : part === 'mic'
              ? '请选择 D 或 E 列，并给圆形板身和两排脚留出空间。'
              : part === 'amp'
                ? '请选择 F 或 G 列，并给功放两侧的针脚留出空间。'
                : part === 'screen'
                  ? '请确认四个针脚都有空孔，并给屏幕板身留出空间。'
                  : '请换一个有足够连续空孔的位置。'),
      );
      return;
    }
    if (state.placements.get(part)?.id === anchor.id) {
      cancel();
      return;
    }
    const plan = wireMovePlan(part, anchor);
    mutate(() => {
      if (plan) applyWireMove(plan);
      state.placements.set(part, anchor);
    });
    const far = crossesBoards(part, anchor)
      ? holes.get(footprintHole(part, anchor, parts.get(part).pins[1]))
      : null;
    status(
      parts.get(part).name +
        ' 已放到 ' +
        anchor.label +
        (far ? ' 与 ' + far.label + '，横跨两块面包板。' : '。') +
        (plan ? '相连的跳线已随模块移动。' : ''),
    );
  }
  function clickHole(id) {
    if (editingLocked()) return;
    state.inspectedPart = null;
    const hole = holes.get(id);
    if (state.mode) {
      place(state.mode, id);
      return;
    }
    if (!state.start) {
      state.start = id;
      state.selected = id;
      const connected = state.wires.filter((wire) => wire.from === id || wire.to === id);
      const wire = connected.length === 1 ? connected[0] : null;
      focusWire(wire?.id ?? null);
      status(
        '已选 ' +
          hole.label +
          (wire ? '。按 Delete 拆线，或点另一孔接线。' : '。点另一孔接线，或按 Esc 取消。'),
      );
    } else if (state.start === id) {
      clearSelection();
      focusWire(null);
      status('已取消接线。');
    } else if (holes.get(state.start).strip === hole.strip) {
      state.start = id;
      state.selected = id;
      status('这两个孔本来就连通。请选择另一孔组。');
    } else {
      const from = state.start;
      if (
        state.wires.some(
          (wire) =>
            (wire.from === from && wire.to === id) || (wire.to === from && wire.from === id),
        )
      ) {
        status('这两个孔之间已有一根跳线。');
        return;
      }
      mutate(() => state.wires.push({ id: nextWire++, from, to: id }));
      status('已接 ' + holes.get(from).label + ' → ' + hole.label + '。');
    }
    renderSelection();
  }
  function cancel() {
    stopDrag();
    clearSelection();
    focusWire(null);
    status('已取消当前操作。');
    renderSelection();
  }
  byId('cancel').onclick = () => {
    if (state.selected) holes.get(state.selected).button.focus();
    else if (state.mode) tray.get(state.mode).focus();
    cancel();
  };
  function acceptedSources(pin) {
    return pin.alsoAccepts === undefined ? [pin.expected] : [pin.expected, pin.alsoAccepts];
  }
  function sourceOptions(pin) {
    return acceptedSources(pin).map(sourceLabel).join(' 或 ');
  }
  function selectedDevice() {
    const id = state.inspectedPart ?? state.mode;
    return id && !baseParts.includes(id) ? id : null;
  }
  function deleteDevice(id) {
    if (editingLocked()) return;
    stopDrag();
    const placements = new Map(state.placements);
    placements.delete(id);
    const otherStrips = new Set(
      [...occupied(placements).keys()].map((hole) => holes.get(hole).strip),
    );
    const ownStrips = new Set(
      [...occupied()].filter(([, pin]) => pin.part === id).map(([hole]) => holes.get(hole).strip),
    );
    const belongsToDevice = (hole) => {
      const strip = holes.get(hole).strip;
      return ownStrips.has(strip) && !otherStrips.has(strip);
    };
    const wires = state.wires.filter(
      (wire) => !belongsToDevice(wire.from) && !belongsToDevice(wire.to),
    );
    const removed = state.wires.length - wires.length;
    mutate(
      () => {
        state.placements = placements;
        state.wires = wires;
        tray.delete(id);
        modules.delete(id);
      },
      { restoreDevice: id },
    );
    setDevicePresent(id, false);
    byId('add-hardware').focus({ preventScroll: true });
    status(
      '已删除 ' +
        parts.get(id).name +
        (removed ? ' 和 ' + removed + ' 根跳线。' : '。') +
        '按 ⌘Z 可恢复。',
    );
  }
  byId('delete-device').onclick = () => {
    const device = selectedDevice();
    if (device) deleteDevice(device);
  };
  function renderSelection() {
    canvas.classList.toggle('placement-mode', Boolean(state.mode));
    canvas.classList.toggle('wiring-mode', Boolean(state.start));
    const pins = occupied();
    for (const [part, body] of modules)
      body.classList.toggle('module-selected', state.inspectedPart === part);
    const current = state.start ? network.net(state.start) : null;
    const tracedWire = state.wires.find((wire) => wire.id === state.focusWire);
    const traced = tracedWire ? network.net(tracedWire.from) : null;
    for (const [id, hole] of holes) {
      const pin = pins.get(id);
      hole.button.setAttribute('aria-pressed', String(state.start === id));
      const group = network.net(id);
      const labelNet = network.labels.get(group);
      hole.button.classList.toggle('in-net', current === group);
      hole.button.classList.toggle('traced-net', traced === group);
      hole.button.classList.toggle('net-colored', Boolean(labelNet));
      if (labelNet) hole.button.style.setProperty('--net-color', labelNet.color);
      else hole.button.style.removeProperty('--net-color');
      hole.button.classList.toggle('occupied', Boolean(pin));
      const label =
        hole.label +
        (pin ? ' · ' + parts.get(pin.part).name + ' ' + pin.label : '') +
        (labelNet ? ' · ' + labelNet.name : '');
      hole.button.setAttribute('aria-label', label);
      hole.button.title = label;
    }
    for (const [id, button] of tray) {
      button.setAttribute('aria-pressed', String(state.mode === id));
      button.classList.toggle('placed', state.placements.has(id));
    }
    const device = selectedDevice();
    byId('delete-device').hidden = !device;
    const pin = pins.get(state.selected);
    byId('module-details').hidden = !state.mode && !state.inspectedPart && !pin;
    const hole = holes.get(state.selected);
    byId('cancel').hidden = !state.mode && !state.start && !state.inspectedPart;
    byId('selection-actions').hidden = byId('cancel').hidden && byId('module-details').hidden;
    byId('inspect').textContent = pin
      ? parts.get(pin.part).name +
        ' ' +
        pin.label +
        ' · ' +
        pin.description +
        (pin.expected === undefined ? '' : '。可接 ' + sourceOptions(pin) + '。')
      : state.inspectedPart
        ? parts.get(state.inspectedPart).name + ' · 按住板身拖动，右键查看针脚。'
        : hole
          ? hole.label + ' 与标出的孔属于同一导通组。'
          : device
            ? '按 Delete 删除设备和对应跳线。'
            : '';
    const selectedNet = state.selected ? network.labels.get(network.net(state.selected)) : null;
    if (selectedNet) byId('inspect').textContent += ' · ' + selectedNet.name;
    const remove = byId('remove-part');
    const move = byId('move');
    remove.hidden = !pin;
    move.hidden = true;
    if (pin) {
      move.onclick = () => {
        tray.get(pin.part).focus();
        choosePart(pin.part);
      };
      remove.onclick = () => {
        mutate(() => state.placements.delete(pin.part));
        tray.get(pin.part).focus();
        status('已取下 ' + parts.get(pin.part).name + '，跳线仍在原孔位。');
      };
    }
  }
  function point(id) {
    const box = holes.get(id).button.getBoundingClientRect();
    const root = canvas.getBoundingClientRect();
    return {
      x: box.left - root.left + box.width / 2,
      y: box.top - root.top + box.height / 2,
      w: box.width,
      h: box.height,
    };
  }
  function positionPart(body, part, anchor) {
    const start = point(anchor.id);
    const bounds = moduleBounds(part, anchor);
    const originX = start.x - gridX(anchor.col) * start.w;
    const originY = start.y - anchor.row * start.h;
    body.style.left = originX + bounds.x0 * start.w + 'px';
    body.style.top = originY + bounds.y0 * start.h + 'px';
    body.style.width = (bounds.x1 - bounds.x0) * start.w + 'px';
    body.style.height = (bounds.y1 - bounds.y0) * start.h + 'px';
  }
  function updateCanvas() {
    for (const [part, body] of modules) {
      const anchor = state.placements.get(part);
      body.hidden = !anchor;
      if (!anchor) continue;
      positionPart(body, part, anchor);
    }
    drawWires();
  }
  function drawWires() {
    pinLabels.replaceChildren();
    const liftLabels = state.showWires && state.wires.length > 0;
    canvas.classList.toggle('pin-labels-active', liftLabels);
    if (liftLabels) {
      for (const body of modules.values()) {
        if (body.hidden) continue;
        const copy = document.createElement('div');
        copy.className = 'module pin-label-copy';
        copy.dataset.type = body.dataset.type;
        copy.style.cssText = body.style.cssText;
        copy.style.setProperty('--pin-label-surface', getComputedStyle(body).backgroundColor);
        for (const label of body.querySelectorAll('.pin-name')) copy.append(label.cloneNode(true));
        pinLabels.append(copy);
      }
    }
    svg.replaceChildren();
    if (!state.showWires) return;
    const ordered = state.wires
      .slice()
      .sort((a, b) => Number(a.id === state.focusWire) - Number(b.id === state.focusWire));
    for (const wire of ordered) {
      const from = point(wirePreview?.endpoint(wire.from) ?? wire.from);
      const to = point(wirePreview?.endpoint(wire.to) ?? wire.to);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const center = (from.x + to.x) / 2 + ((wire.id % 5) - 2) * 4;
      path.setAttribute(
        'd',
        `M ${from.x} ${from.y} C ${center} ${from.y}, ${center} ${to.y}, ${to.x} ${to.y}`,
      );
      path.dataset.wire = wire.id;
      path.classList.add('wire-line');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', network.labels.get(network.net(wire.from)).color);
      path.setAttribute('stroke-width', state.focusWire === wire.id ? '4' : '2.4');
      path.setAttribute('opacity', state.focusWire && state.focusWire !== wire.id ? '0.2' : '0.95');
      // A separate hit stroke keeps thin wires easy to select without changing their appearance.
      const hit = path.cloneNode();
      hit.classList.replace('wire-line', 'wire-hit');
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-width', '12');
      hit.setAttribute('opacity', '1');
      hit.setAttribute('aria-hidden', 'true');
      svg.append(hit, path);
    }
  }
  function focusWire(id) {
    state.focusWire = id;
    for (const button of byId('wire-list').querySelectorAll('[data-wire]')) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.wire) === id));
    }
    renderSelection();
    drawWires();
  }
  function selectWire(id) {
    clearSelection();
    focusWire(state.focusWire === id ? null : id);
    status(state.focusWire === null ? '已取消跳线选择。' : '已选中跳线。按 Delete 拆线。');
  }
  function removeWire(id) {
    if (editingLocked()) return;
    mutate(() => {
      state.wires = state.wires.filter((wire) => wire.id !== id);
    });
    byId('add-hardware').focus();
    status('已拆下跳线。');
  }
  function renderWireList() {
    byId('wire-count').textContent = state.wires.length;
    const list = byId('wire-list');
    list.replaceChildren();
    const attached = new Set(state.wires.flatMap((wire) => [wire.from, wire.to]));
    for (const [id, { button }] of holes) button.classList.toggle('wired', attached.has(id));
    for (const wire of state.wires) {
      const item = document.createElement('li');
      const trace = document.createElement('button');
      const labelNet = network.labels.get(network.net(wire.from));
      trace.textContent = holes.get(wire.from).label + ' ↔ ' + holes.get(wire.to).label;
      trace.setAttribute('aria-label', trace.textContent + ' · ' + labelNet.name);
      trace.dataset.net = labelNet.name;
      trace.dataset.wire = wire.id;
      trace.style.setProperty('--net-color', labelNet.color);
      trace.setAttribute('aria-pressed', String(state.focusWire === wire.id));
      trace.onclick = () => selectWire(wire.id);
      const remove = document.createElement('button');
      remove.textContent = '拆';
      remove.disabled = state.tested;
      remove.setAttribute('aria-label', '拆除跳线 ' + trace.textContent);
      remove.onclick = () => removeWire(wire.id);
      item.append(trace, remove);
      list.append(item);
    }
  }
  function syncVisibilityButtons() {
    const hardwareHidden = canvas.classList.contains('hide-hardware');
    byId('wire-visibility').setAttribute('aria-pressed', String(!state.showWires));
    byId('wire-visibility').querySelector('[data-visibility-label]').textContent = state.showWires
      ? '隐藏连线'
      : '显示连线';
    byId('hardware-visibility').setAttribute('aria-pressed', String(hardwareHidden));
    byId('hardware-visibility').querySelector('[data-visibility-label]').textContent =
      hardwareHidden ? '显示硬件' : '隐藏硬件';
  }
  function setWireVisibility(show) {
    state.showWires = show;
    syncVisibilityButtons();
    updateCanvas();
    persist();
  }
  byId('wire-visibility').onclick = () => setWireVisibility(!state.showWires);
  byId('hardware-visibility').onclick = (event) => {
    const hidden = canvas.classList.toggle('hide-hardware');
    syncVisibilityButtons();
    persist();
    status(hidden ? '板身已隐藏，可以直接点原先被挡住的孔位。' : '已显示硬件板身和针脚标签。');
  };
  function editingLocked() {
    if (!state.tested) return false;
    status('通电中，布线已锁定。请先点击「断电」再修改。');
    return true;
  }
  function renderPowerState() {
    root.classList.toggle('powered-on', state.tested);
    byId('power-state').textContent = state.tested ? '● 通电中 · 布线已锁定' : '已断电 · 可编辑';
    byId('power-off').disabled = !state.tested;
    byId('power-action').textContent = state.tested ? '断电' : '模拟通电';
    byId('test').title = state.tested ? '断电（Enter）' : '模拟通电（Enter）';
    for (const button of root.querySelectorAll(
      '#add-hardware,#add-board,#reset,#move,#remove-part,#delete-device,[data-remove-board],.tray-remove',
    )) {
      button.disabled =
        state.tested ||
        (button.id === 'reset' && !state.placements.size && !state.wires.length) ||
        (button.hasAttribute('data-remove-board') && boundBoards.size <= 1);
    }
  }
  function render() {
    network = getNetwork();
    byId('reset').disabled = !state.placements.size && !state.wires.length;
    renderSelection();
    renderWireList();
    renderResults();
    renderPowerState();
    updateCanvas();
  }
  let suppressClick = false;
  const outline = byId('placement-outline');
  const placementViewport = byId('viewport');
  let previewKey;
  function preview(part, id) {
    const key = part && id ? part + ':' + id : null;
    if (key === previewKey) return;
    previewKey = key;
    for (const button of canvas.querySelectorAll('.ghost'))
      button.classList.remove('ghost', 'blocked');
    outline.hidden = !key;
    const anchor = key ? holes.get(id) : null;
    const valid = anchor && fits(part, anchor);
    if (wirePreview || (valid && state.placements.has(part))) {
      wirePreview = valid ? wireMovePlan(part, anchor) : undefined;
      drawWires();
    }
    if (!key) return;
    outline.dataset.part = part;
    outline.classList.toggle('invalid', !valid);
    outline.textContent = valid ? parts.get(part).name + ' · ' + anchor.label : '这里放不下';
    positionPart(outline, part, anchor);
    outline.style.maxHeight = valid
      ? ''
      : Math.max(0, canvas.clientHeight - outline.offsetTop - 2) + 'px';
    for (const pin of parts.get(part).pins) {
      const button = holes.get(footprintHole(part, anchor, pin))?.button;
      if (button) {
        button.classList.add('ghost');
        button.classList.toggle('blocked', !valid);
      }
    }
  }
  function stopDrag() {
    const drag = state.drag;
    if (drag) {
      cancelAnimationFrame(drag.frame);
      modules.get(drag.part).classList.remove('drag-origin');
    }
    state.drag = null;
    byId('drag-label').hidden = true;
    preview(null, null);
  }
  function dragStart(event) {
    if (editingLocked()) return;
    const source = event.target.closest('[data-part]');
    const part = source?.dataset.part;
    if (!part || !event.isPrimary || event.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    const existing = source.classList.contains('module') ? state.placements.get(part) : null;
    const anchor = existing ? point(existing.id) : null;
    state.drag = {
      part,
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moving: false,
      frame: 0,
      offsetX: anchor ? event.clientX - rect.left - anchor.x : 0,
      offsetY: anchor ? event.clientY - rect.top - anchor.y : 0,
      fromTray: !existing,
    };
  }
  function targetAt(drag, x, y) {
    const viewport = placementViewport.getBoundingClientRect();
    if (x < viewport.left || x > viewport.right || y < viewport.top || y > viewport.bottom) return;
    const rect = canvas.getBoundingClientRect();
    const pitch = Math.max(1, drag.targets[0]?.button.offsetWidth ?? 16);
    const pointer = { x: x - rect.left - drag.offsetX, y: y - rect.top - drag.offsetY };
    const snapped = nearestAnchor(drag.points, pointer, pitch * (drag.part === 'esp' ? 2.6 : 1.8));
    if (snapped?.valid || !drag.seamPoints.length) return snapped;
    return nearestAnchor(drag.seamPoints, pointer, pitch * 2.2) ?? snapped;
  }
  function updateDrag(drag) {
    drag.frame = 0;
    const { clientX, clientY } = drag;
    const view = placementViewport.getBoundingClientRect();
    if (
      clientY >= view.top &&
      clientY <= view.bottom &&
      clientX >= view.left &&
      clientX <= view.right
    ) {
      const edge = 30;
      const left = placementViewport.scrollLeft;
      const top = placementViewport.scrollTop;
      if (clientX > view.right - edge) placementViewport.scrollLeft += 8;
      if (clientX < view.left + edge) placementViewport.scrollLeft -= 8;
      if (clientY > view.bottom - edge) placementViewport.scrollTop += 8;
      if (clientY < view.top + edge) placementViewport.scrollTop -= 8;
      if (left !== placementViewport.scrollLeft || top !== placementViewport.scrollTop) {
        drag.frame = requestAnimationFrame(() => updateDrag(drag));
      }
    }
    preview(drag.part, targetAt(drag, clientX, clientY)?.id);
  }
  byId('rack').addEventListener('pointerdown', dragStart);
  canvas.addEventListener('pointerdown', dragStart);
  onGlobal(window, 'pointermove', (event) => {
    const drag = state.drag;
    if (!drag || drag.pointer !== event.pointerId) return;
    if (!drag.moving && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
    if (!drag.moving) {
      drag.moving = true;
      drag.targets = [...holes.values()].filter((hole) => hole.col >= 2 && hole.col <= 12);
      drag.points = drag.targets.map((hole) => ({
        ...point(hole.id),
        id: hole.id,
        valid: fits(drag.part, hole),
      }));
      drag.seamPoints =
        drag.part === 'esp' && drag.fromTray
          ? drag.points
              .filter((entry) => entry.valid && crossesBoards(drag.part, holes.get(entry.id)))
              .map((entry) => ({ ...entry, x: entry.x + 5 * entry.w }))
          : [];
      modules.get(drag.part).classList.add('drag-origin');
      byId('drag-label').textContent = parts.get(drag.part).name;
    }
    drag.clientX = event.clientX;
    drag.clientY = event.clientY;
    const label = byId('drag-label');
    label.hidden = false;
    label.style.left = event.clientX + 'px';
    label.style.top = event.clientY + 'px';
    if (!drag.frame) drag.frame = requestAnimationFrame(() => updateDrag(drag));
  });
  onGlobal(window, 'pointerup', (event) => {
    const drag = state.drag;
    if (!drag || drag.pointer !== event.pointerId) return;
    const target = drag.moving ? targetAt(drag, event.clientX, event.clientY) : undefined;
    stopDrag();
    if (!drag.moving) return;
    suppressClick = true;
    setTimeout(() => {
      suppressClick = false;
    }, 0);
    if (target) place(drag.part, target.id);
    else status('拖到面包板孔位附近，看到预览后再松手。');
  });
  onGlobal(window, 'pointercancel', stopDrag);
  onGlobal(window, 'blur', stopDrag);
  function handleClick(event) {
    if (suppressClick && event.detail) return;
    if (event.target.closest('[data-wire]')) return;
    const board = event.target.closest('[data-remove-board]');
    if (board) {
      removeBoard(Number(board.dataset.removeBoard));
      return;
    }
    const part = event.target.closest('[data-part]')?.dataset.part;
    const hole = event.target.closest('[data-hole]')?.dataset.hole;
    if (part) choosePart(part);
    if (hole) clickHole(hole);
  }
  byId('rack').addEventListener('click', handleClick);
  canvas.addEventListener('click', handleClick);
  function detailsFor(target) {
    const id = target.closest('[data-hole]')?.dataset.hole;
    const pin = id ? occupied().get(id) : null;
    const part = pin?.part ?? target.closest('[data-part]')?.dataset.part;
    if (!part) return;
    openDetails({ part, pin: pin ? pin.dx + ':' + pin.dy : undefined });
  }
  for (const area of [canvas, byId('rack')]) {
    area.addEventListener('contextmenu', (event) => {
      if (!event.target.closest('[data-hole].occupied,[data-part]')) return;
      event.preventDefault();
      detailsFor(event.target);
    });
  }
  byId('module-details').onclick = () => {
    if (state.inspectedPart) openDetails({ part: state.inspectedPart });
    else if (state.mode) openDetails({ part: state.mode });
    else if (state.selected) detailsFor(holes.get(state.selected).button);
  };
  svg.addEventListener('pointerdown', (event) => event.stopPropagation());
  svg.addEventListener('click', (event) => {
    event.stopPropagation();
    if (suppressClick || state.mode || state.start) return;
    const id = event.target.dataset.wire;
    if (id) {
      placementViewport.focus({ preventScroll: true });
      selectWire(Number(id));
    }
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!state.mode || state.drag?.moving || event.pointerType === 'touch') return;
    preview(state.mode, event.target.closest('[data-hole]')?.dataset.hole);
  });
  canvas.addEventListener('pointerleave', () => {
    if (state.mode && !state.drag?.moving) preview(null, null);
  });
  canvas.addEventListener('focusin', (event) => {
    const hole = holes.get(event.target.dataset.hole);
    if (!hole) return;
    const grid = hole.button.parentNode;
    grid.querySelector('button[tabindex="0"]')?.setAttribute('tabindex', '-1');
    hole.button.tabIndex = 0;
    if (state.mode) preview(state.mode, event.target.dataset.hole);
  });
  canvas.addEventListener('keydown', (event) => {
    const directions = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const direction = directions[event.key];
    const hole = holes.get(event.target.dataset.hole);
    if (!direction || !hole) return;
    event.preventDefault();
    let col = hole.col + direction[0];
    let board = hole.board;
    if (col === 7) col += direction[0];
    if (col < 0 || col >= columns.length) {
      board += direction[0];
      col = col < 0 ? columns.length - 1 : 0;
    }
    const row = hole.row + direction[1];
    const target = holes.get(holeId(board, col, row));
    const next = direction[1] || (row === rowCount - 1 ? -1 : 1);
    (target ?? holes.get(holeId(board, col, row + next)))?.button.focus();
  });
  onGlobal(document, 'keydown', (event) => {
    if (event.key === 'Tab' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      return;
    }
    if (root.querySelector('dialog[open]')) return;
    if (event.key === 'Escape') cancel();
    if (event.defaultPrevented || event.isComposing || event.shiftKey || event.altKey) return;
    if (
      event.target instanceof HTMLElement &&
      (event.target.isContentEditable || event.target.closest('input, textarea, select'))
    )
      return;
    if ((event.key === 'Enter' || event.key === 'Return') && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      if (!event.repeat) byId('test').click();
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && !event.metaKey && !event.ctrlKey) {
      const device = selectedDevice();
      if (device) {
        event.preventDefault();
        deleteDevice(device);
      } else if (state.focusWire !== null) {
        event.preventDefault();
        removeWire(state.focusWire);
      }
      return;
    }
    if ((!event.metaKey && !event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
    if (!state.history.length) return;
    event.preventDefault();
    undo();
  });
  const resizeObserver = new ResizeObserver(updateCanvas);
  resizeObserver.observe(canvas);
  resizeObserver.observe(byId('viewport'));
  function buildNets(wires = state.wires) {
    const parents = new Map();
    function root(id) {
      while (parents.has(id)) id = parents.get(id);
      return id;
    }
    for (const wire of wires) {
      const a = root(holes.get(wire.from).strip);
      const b = root(holes.get(wire.to).strip);
      if (a !== b) parents.set(a, b);
    }
    return (id) => root(holes.get(id).strip);
  }
  function testInstance(type) {
    return activeTest && partType(activeTest) === type && state.placements.has(activeTest)
      ? activeTest
      : [...state.placements.keys()].find((id) => partType(id) === type);
  }
  function hasPart(type) {
    return Boolean(testInstance(type));
  }
  function moduleFor(type) {
    return modules.get(testInstance(type));
  }
  function checkCircuit() {
    const { net } = network;
    const pins = occupied();
    const drivers = new Map();
    const outputPins = new Set([4, 5, 7, 15, 16, 17, 18, 41, 42, 'GND', '3V3', '5V']);
    if (hasPart('sonar')) outputPins.add(11);
    if (hasPart('servo')) outputPins.add(13);
    for (const [id, pin] of pins) {
      if (!pin.output && (pin.part !== 'esp' || !outputPins.has(pin.value))) continue;
      const group = net(id);
      if (!drivers.has(group)) drivers.set(group, new Set());
      drivers.get(group).add(pin.output ? pin.label : pin.value);
    }
    const conflicts = [...drivers.values()]
      .filter((values) => values.size > 1)
      .map((values) => [...values].map(sourceLabel).join(' 与 '));
    function problems(part) {
      const instance = testInstance(part);
      if (!instance) return [parts.get(part).name + ' 未放置'];
      return [...pins].flatMap(([id, pin]) => {
        if (pin.part !== instance || pin.expected === undefined) return [];
        const sources = acceptedSources(pin);
        const candidates = [...pins].filter(([, other]) =>
          partType(pin.part) === 'speaker'
            ? other.output && sources.includes(other.label)
            : other.part === 'esp' && sources.includes(other.value),
        );
        return candidates.some(([other]) => net(id) === net(other))
          ? []
          : [pin.label + ' 需连到 ' + sourceOptions(pin)];
      });
    }
    const switchInput = [...pins].find(
      ([, pin]) => pin.part === testInstance('button') && pin.label === 'SW',
    );
    const button = problems('button');
    if (!button.length && switchInput && drivers.has(net(switchInput[0]))) {
      button.push('GPIO47 信号线上接了其他输出或电源，先拆开再按按钮');
    }
    return {
      conflicts,
      screen: problems('screen'),
      mic: problems('mic'),
      amp: problems('amp'),
      speaker: problems('speaker'),
      led: problems('led'),
      button,
      pot: problems('pot'),
      buzzer: problems('buzzer'),
      bme280: problems('bme280'),
      ldr: problems('ldr'),
      pir: problems('pir'),
      sonar: problems('sonar'),
      servo: problems('servo'),
    };
  }
  const testLabels = {
    led: 'LED',
    button: '按钮',
    pot: '电位器',
    buzzer: '蜂鸣器',
    bme280: 'BME280',
    ldr: '光敏',
    pir: '人体感应',
    sonar: '测距',
    servo: '舵机',
    screen: 'OLED',
    mic: '麦克风',
    speaker: '功放与喇叭',
  };
  function showTest(id) {
    const picker = byId('test-picker');
    if (!picker.querySelector('[data-test="' + id + '"]')) return;
    activeTest = id;
    for (const option of picker.children)
      option.setAttribute('aria-pressed', String(option.dataset.test === id));
    const type = partType(id);
    for (const groupId of ['peripheral-effects', 'voice-effects', 'hardware-effects']) {
      const group = byId(groupId);
      for (const panel of group.querySelectorAll('[data-test-panel]'))
        panel.hidden = panel.dataset.testPanel !== type;
      group.hidden = !group.querySelector('[data-test-panel]:not([hidden])');
    }
  }
  function renderTestPicker(check, ready) {
    const picker = byId('test-picker');
    const tests = [...state.placements.keys()].filter((id) => testLabels[partType(id)]);
    if (hasPart('amp') && !hasPart('speaker')) tests.push('speaker');
    if (!tests.includes(activeTest)) activeTest = tests[0];
    const focused = picker.contains(document.activeElement)
      ? document.activeElement.dataset.test
      : null;
    let passed = 0;
    const buttons = tests.map((id) => {
      const type = partType(id);
      const previous = activeTest;
      activeTest = id;
      const instanceCheck = checkCircuit();
      activeTest = previous;
      const ok =
        ready && !instanceCheck[type].length && (type !== 'speaker' || !instanceCheck.amp.length);
      if (ok) passed++;
      const button = document.createElement('button');
      const result = !state.tested ? '待通电' : ok ? '通过' : '待检查';
      button.dataset.test = id;
      button.dataset.result = !state.tested ? 'idle' : ok ? 'pass' : 'check';
      button.textContent = testLabels[type] + (id.includes('#') ? ' #' + id.split('#')[1] : '');
      button.setAttribute('aria-label', button.textContent + '，' + result);
      button.title = result;
      button.onclick = () => {
        activeTest = id;
        renderResults();
      };
      return button;
    });
    picker.replaceChildren(...buttons);
    picker.hidden = !tests.length;
    byId('test-empty').hidden = Boolean(tests.length);
    const summary = byId('test-summary');
    summary.hidden = !tests.length;
    summary.textContent = state.tested
      ? '通过 ' + passed + ' · 待检查 ' + (tests.length - passed)
      : tests.length + ' 项待通电';
    if (tests.length) showTest(tests.includes(activeTest) ? activeTest : tests[0]);
    else {
      activeTest = undefined;
      for (const groupId of ['peripheral-effects', 'voice-effects', 'hardware-effects'])
        byId(groupId).hidden = true;
    }
    picker.querySelector('[data-test="' + focused + '"]')?.focus({ preventScroll: true });
  }
  function showOLED(text) {
    byId('display').textContent = text;
    const screen = moduleFor('screen')?.querySelector('.oled-face');
    if (screen) screen.textContent = text.replace(/^◉ /, '');
  }
  function renderResults() {
    if (!activeTest || !state.placements.has(activeTest))
      activeTest = [...state.placements.keys()].find((id) => testLabels[partType(id)]);
    const check = checkCircuit();
    const ready = state.tested && state.placements.has('esp') && !check.conflicts.length;
    const voiceActive = ['mic', 'amp', 'speaker'].some((part) => state.placements.has(part));
    showOLED(
      ready && !check.screen.length ? (voiceActive ? '◉ 小智在线' : '◉ OLED 已就绪') : '屏幕熄灭',
    );
    for (const [id, label] of [
      ['screen', '屏幕已点亮'],
      ['mic', '麦克风就绪'],
      ['speaker', '喇叭两根线已接好'],
    ]) {
      const text = !state.tested
        ? '未通电'
        : !state.placements.has('esp')
          ? '请先放置 ESP32-S3'
          : check.conflicts.length
            ? '电路冲突，检查接线'
            : check[id].join('、') || label;
      byId(id + '-result').textContent = text;
    }
    byId('mic-demo').disabled = !ready || Boolean(check.mic.length);
    byId('amp-result').textContent = !state.tested
      ? '功放输入待检查'
      : !ready
        ? '功放输入尚未通过检测'
        : check.amp.length
          ? '功放输入 · ' + check.amp.join('、')
          : '功放输入 · 电源与音频三线已接好';
    byId('speaker-demo').disabled = !ready || Boolean(check.amp.length || check.speaker.length);
    renderHardwareEffects(check, ready);
    renderPeripheralTests(check, ready);
    renderTestPicker(check, ready);
    return check;
  }
  function resetHardwareEffects() {
    buzzerAudio.pause();
    clearTimeout(releaseTimer);
    clearTimeout(motionTimer);
    moduleFor('pir')?.classList.remove('pir-active');
    state.ledOn = false;
    state.buttonPressed = false;
  }
  function renderHardwareEffects(check, ready) {
    const light =
      ready && !check.led.length && (state.ledOn || (state.buttonPressed && !check.button.length));
    byId('led-demo').disabled = !ready || Boolean(check.led.length);
    byId('button-demo').disabled = !ready || Boolean(check.button.length);
    moduleFor('led')?.classList.toggle('led-lit', light);
    moduleFor('button')?.classList.toggle('switch-pressed', ready && state.buttonPressed);
    const waiting = state.tested ? '还不能测试，请检查主板与短接' : '等待模拟通电';
    byId('led-result').textContent =
      'LED · ' +
      (!ready ? waiting : check.led.join('、') || (light ? '已点亮' : '已接好，当前熄灭'));
    byId('button-result').textContent =
      '按钮 · ' +
      (!ready
        ? waiting
        : check.button.join('、') ||
          (state.buttonPressed ? '按下，GPIO47 为低电平' : '松开，GPIO47 由上拉保持高电平'));
  }
  function updateHardwareEffects() {
    const check = checkCircuit();
    renderHardwareEffects(
      check,
      state.tested && state.placements.has('esp') && !check.conflicts.length,
    );
  }
  byId('led-demo').onclick = () => {
    state.ledOn = !state.ledOn;
    updateHardwareEffects();
    persist();
  };
  byId('button-demo').onclick = () => {
    clearTimeout(releaseTimer);
    state.buttonPressed = true;
    updateHardwareEffects();
    releaseTimer = setTimeout(() => {
      state.buttonPressed = false;
      updateHardwareEffects();
    }, 850);
  };
  function updatePotReading() {
    const ratio = Number(byId('pot-value').value) / 100;
    const volts = (3.3 * ratio).toFixed(2);
    byId('pot-result').textContent =
      '滑动端 ' + volts + ' V · 理想 12 位读数 ' + Math.round(ratio * 4095);
  }
  function updateLightReading() {
    const percent = Number(byId('ldr-value').value);
    byId('ldr-result').textContent =
      '光照 ' + percent + '% · 理想 ADC 读数 ' + Math.round((percent * 4095) / 100);
  }
  function updateDistanceReading() {
    const distance = Number(byId('sonar-value').value);
    const echo = Math.round((2 * distance) / 0.0343);
    byId('sonar-result').textContent = '距离 ' + distance + ' cm · ECHO 脉宽约 ' + echo + ' µs';
  }
  function updateServoAngle() {
    const angle = Number(byId('servo-value').value);
    moduleFor('servo').style.setProperty('--servo-angle', angle - 90 + 'deg');
    byId('servo-result').textContent = 'GPIO13 · 目标角度 ' + angle + '°';
  }
  const peripheralTests = [
    ['pot', 'pot-value', '调整旋钮，观察理想读数', updatePotReading],
    ['buzzer', 'buzzer-demo', '已接好，点击输出高电平'],
    ['bme280', 'bme280-demo', '已接好，等待 I²C 读取'],
    ['ldr', 'ldr-value', '调整光照', updateLightReading],
    ['pir', 'pir-demo', '无人经过，GPIO10 为低电平'],
    ['sonar', 'sonar-value', '调整目标距离', updateDistanceReading],
    ['servo', 'servo-value', '调整旋转角度', updateServoAngle],
  ];
  byId('pir-demo').onclick = () => {
    clearTimeout(motionTimer);
    moduleFor('pir').classList.add('pir-active');
    byId('pir-result').textContent = '检测到运动，GPIO10 为高电平';
    motionTimer = setTimeout(() => {
      moduleFor('pir').classList.remove('pir-active');
      byId('pir-result').textContent = '感应结束，GPIO10 恢复低电平';
    }, 1100);
  };
  function renderPeripheralTests(check, ready) {
    for (const [part, control, readyText, update] of peripheralTests) {
      const canTest = ready && !check[part].length;
      byId(control).disabled = !canTest;
      byId(part + '-result').textContent = !state.tested
        ? '等待模拟通电'
        : !ready
          ? '请先检查主板和短接'
          : check[part].join('、') || readyText;
      if (canTest) update?.();
    }
  }
  for (const [, control, , update] of peripheralTests) {
    if (update) byId(control).addEventListener('input', update);
  }
  byId('bme280-demo').onclick = () => {
    byId('bme280-result').textContent = 'I²C 0x76 · 模拟数据 24.5 °C · 48% RH · 1013 hPa';
  };
  byId('buzzer-demo').onclick = () => playDemoAudio(buzzerAudio, byId('buzzer-result'));
  function togglePower() {
    stopDrag();
    clearSelection();
    state.focusWire = null;
    resetVoiceDemo();
    state.tested = !state.tested;
    if (!state.tested) {
      audio.pause();
      replyAudio.pause();
      resetHardwareEffects();
    }
    render();
    persist();
    if (state.tested) {
      const { conflicts } = checkCircuit();
      status(
        conflicts.length
          ? '通电中 · 检测到短接：' + conflicts.join('、') + '。请先断电再修改接线。'
          : '通电中 · 布线已锁定，可测试各模块。修改前请先断电。',
      );
    } else status('已断电，可以接线、移动或增删元件。');
  }
  byId('test').onclick = togglePower;
  byId('power-off').onclick = togglePower;
  function resetVoiceDemo() {
    clearTimeout(voiceTimer);
    replyAudio.pause();
    if (byId('voice-reply').hidden) return;
    byId('voice-reply').hidden = true;
    if (audio.paused) audioStatus.textContent = '';
  }
  byId('mic-demo').onclick = () => {
    resetVoiceDemo();
    const check = checkCircuit();
    const displayReady = !check.screen.length;
    const speakerReady = !check.amp.length && !check.speaker.length;
    const reply = byId('voice-reply');
    byId('mic-result').textContent = '收到模拟语音样本 ▂▃▆▅▇▃▂';
    if (displayReady) showOLED('◉ 正在聆听…');
    reply.hidden = false;
    reply.textContent = '正在生成模拟回复…';
    voiceTimer = setTimeout(() => {
      reply.textContent = '小智：你好，我听到了。小智的语音回路已就绪。';
      if (displayReady) showOLED('◉ 小智已回复');
      if (speakerReady) playDemoAudio(replyAudio);
      else reply.textContent += '（喇叭链路未就绪，查看下方接线检查。）';
    }, 450);
  };
  function undo() {
    if (editingLocked()) return;
    const previous = state.history.pop();
    if (previous.boardCount !== undefined && previous.boardCount !== boundBoards.size) {
      const placements = [...previous.placements].map(([part, anchor]) => [part, anchor.id]);
      queueBoardChange(previous.boardCount, {
        placements,
        wires: previous.wires,
        message: '已撤销面包板变更。',
      });
      return;
    }
    if (previous.restoreDevice && !modules.has(previous.restoreDevice)) {
      pendingDeviceUndo = previous;
      setDevicePresent(previous.restoreDevice, true);
      return;
    }
    restoreHistory(previous);
  }
  function restoreHistory(previous) {
    preview(null, null);
    state.placements = previous.placements;
    state.wires = previous.wires;
    state.tested = false;
    resetHardwareEffects();
    resetVoiceDemo();
    clearSelection();
    state.focusWire = null;
    render();
    if (!state.history.length) byId('add-hardware').focus();
    persist();
    status('已撤销上一步。');
  }
  byId('reset').onclick = () => {
    if (editingLocked()) return;
    mutate(() => {
      state.placements.clear();
      state.wires = [];
    });
    byId('add-hardware').focus();
    status('实验台已清空。');
  };
  function makeTestAudio(notes = [440, 554, 659, 880]) {
    const rate = 24000;
    const length = (rate * notes.length) / 2;
    const buffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(buffer);
    const tag = (offset, text) =>
      [...text].forEach((letter, index) => view.setUint8(offset + index, letter.charCodeAt(0)));
    tag(0, 'RIFF');
    view.setUint32(4, buffer.byteLength - 8, true);
    tag(8, 'WAVE');
    tag(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    tag(36, 'data');
    view.setUint32(40, length * 2, true);
    for (let index = 0; index < length; index++) {
      const time = index / rate;
      const noteTime = time % 0.5;
      const envelope = Math.max(0, Math.min(1, noteTime / 0.025, (0.47 - noteTime) / 0.08));
      const phase = time * notes[Math.floor(time / 0.5)] * 2 * Math.PI;
      const wave = Math.sin(phase) + 0.2 * Math.sin(2 * phase);
      view.setInt16(44 + index * 2, wave * envelope * 14000, true);
    }
    return new Audio(URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' })));
  }
  const audio = makeTestAudio();
  const buzzerAudio = makeTestAudio([2300]);
  const replyAudio = new Audio(replyUrl);
  const audioStatus = byId('audio-status');
  for (const [player, playing, ended] of [
    [
      audio,
      '正在播放四音提示…',
      '音频已播完。如果没听见，检查当前标签页是否静音、系统音量和声音输出设备。',
    ],
    [replyAudio, '正在播报模拟回复…', '模拟回复已播完。'],
  ]) {
    player.addEventListener('playing', () => {
      audioStatus.textContent = playing;
    });
    player.addEventListener('ended', () => {
      audioStatus.textContent = ended;
    });
  }
  buzzerAudio.addEventListener('playing', () => {
    byId('buzzer-result').textContent = 'GPIO17 输出高电平，正在蜂鸣';
  });
  buzzerAudio.addEventListener('ended', () => {
    byId('buzzer-result').textContent = '蜂鸣完成，GPIO17 已回到低电平';
  });
  async function playDemoAudio(player, result = audioStatus) {
    audio.pause();
    replyAudio.pause();
    buzzerAudio.pause();
    player.currentTime = 0;
    result.textContent = '正在启动浏览器音频…';
    try {
      await player.play();
    } catch (error) {
      if (error.name !== 'AbortError')
        result.textContent = '浏览器未能播放。请检查站点声音权限，再点试听。';
    }
  }
  byId('speaker-demo').onclick = () => playDemoAudio(audio);
  byId('audio-check').onclick = () => playDemoAudio(audio);
  restoreDraft();
  render();

  return {
    beginPlacement,
    registerPart,
    deleteDevice,
    syncBoards,
    addBoard,
    dispose() {
      stopDrag();
      resetHardwareEffects();
      resetVoiceDemo();
      listeners.abort();
      resizeObserver.disconnect();
      pinLabels.remove();
      canvas.classList.remove('pin-labels-active');
      audio.pause();
      URL.revokeObjectURL(audio.src);
      URL.revokeObjectURL(buzzerAudio.src);
    },
  };
}
