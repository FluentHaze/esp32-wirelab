import { ComponentArt } from './ComponentArt';
import { useMemo } from 'react';
import { partType, boardName, getBoardCells, moduleBounds, parts, type Part } from './catalog';

const trayLabels: Record<string, string> = {
  button: '常开按钮',
  pot: '电位器',
  buzzer: '有源蜂鸣器',
  bme280: 'BME280',
  mic: 'INMP441',
  amp: 'MAX98357A',
  ldr: '光敏模块',
  pir: 'AM312',
  sonar: 'US-100',
  servo: 'SG90',
};

export function PartTray({
  ids,
  onRemove,
}: {
  ids: readonly string[];
  onRemove: (id: string) => void;
}) {
  const groups = [
    { name: '主板', ids: ['esp'] },
    { name: '已添加设备', ids: ids.filter((id) => id !== 'esp') },
  ];
  return (
    <div
      className="rack"
      id="rack"
      aria-label="元件托盘"
    >
      {groups
        .filter((group) => group.ids.length)
        .map((group) => (
          <div
            key={group.name}
            className="tray-group"
            role="group"
            aria-label={group.name}
          >
            <span>{group.name}</span>
            {group.ids.map((id) => {
              const name = parts.get(id)?.name ?? id;
              return (
                <div
                  key={id}
                  className="tray-device"
                >
                  <button
                    type="button"
                    data-part={id}
                    aria-pressed="false"
                    aria-label={name}
                    title={name}
                  >
                    {trayLabels[id] ?? name}
                  </button>
                  {id !== 'esp' && (
                    <button
                      type="button"
                      className="tray-remove"
                      aria-label={'移除 ' + name}
                      title={'移除 ' + name + ' 和对应跳线'}
                      onClick={() => onRemove(id)}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}

function Module({ id, part }: { id: string; part: Part }) {
  const instance = id;
  id = partType(id);
  const bounds = moduleBounds(id, { col: 0, row: 0 });
  const height = bounds.y1 - bounds.y0;
  const width = bounds.x1 - bounds.x0;
  return (
    <button
      className="module illustrated-module"
      type="button"
      data-part={instance}
      data-type={id}
      aria-label={part.name + ' 板身'}
      hidden
    >
      <ComponentArt
        id={id}
        onBoard
      />
      {part.pins.map((pin) => {
        const right =
          ((id === 'esp' || id === 'mic') && pin.dx > 0) || (id === 'amp' && pin.dx === 0);
        const label = id === 'esp' ? pin.label.replace('GPIO', 'IO') : pin.label;
        const pinInset = right ? bounds.x1 - pin.dx : pin.dx - bounds.x0;
        const labelInset = 'calc(' + (pinInset / width) * 100 + '% + 8px)';
        return (
          <span
            className={right ? 'pin-name pin-name--right' : 'pin-name'}
            key={pin.dx + ':' + pin.dy}
            style={{
              top: ((pin.dy - bounds.y0) / height) * 100 + '%',
              [right ? 'right' : 'left']: labelInset,
            }}
            aria-hidden="true"
            title={pin.label}
          >
            {label}
          </span>
        );
      })}
    </button>
  );
}

export function BreadboardCanvas({
  ids,
  boardCount,
}: {
  ids: readonly string[];
  boardCount: number;
}) {
  const boards = useMemo(
    () => Array.from({ length: boardCount }, (_, index) => getBoardCells(index)),
    [boardCount],
  );
  return (
    <div
      className="canvas"
      id="canvas"
    >
      <svg
        className="wire-layer"
        id="wires"
        aria-hidden="true"
      />
      {boards.map((cells, index) => (
        <section
          className="breadboard"
          key={index}
          data-board-index={index}
        >
          <div className="breadboard-heading">
            <h3>{boardName(index)}</h3>
            <button
              type="button"
              className="remove-board"
              data-remove-board={index}
              disabled={boardCount === 1}
              aria-label={'移除第 ' + (index + 1) + ' 块面包板'}
              title="移除面包板"
            >
              ×
            </button>
          </div>
          <div className="grid">
            {cells.map((cell) =>
              (() => {
                if (cell.kind === 'hole') {
                  return (
                    <button
                      key={cell.id}
                      type="button"
                      className={'hole ' + cell.className}
                      data-hole={cell.id}
                      tabIndex={cell.row === 0 && cell.col === 2 ? 0 : -1}
                      aria-label={cell.label}
                      aria-pressed="false"
                    />
                  );
                }
                return (
                  <span
                    key={cell.id}
                    className={cell.className}
                    aria-hidden="true"
                  >
                    {cell.label}
                  </span>
                );
              })(),
            )}
          </div>
        </section>
      ))}
      {ids.map((id) => {
        const part = parts.get(id);
        return part ? (
          <Module
            key={id}
            id={id}
            part={part}
          />
        ) : null;
      })}
      <div
        id="placement-outline"
        className="placement-outline"
        hidden
        aria-hidden="true"
      />
    </div>
  );
}
