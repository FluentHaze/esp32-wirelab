import { useLayoutEffect, useRef, useState } from 'react';
import { parts, sourceLabel } from './catalog';
import { libraryHardware } from './hardwareCatalog';

export type DetailSelection = { part: string; pin?: string };

const pinKey = (pin: { dx: number; dy: number }) => pin.dx + ':' + pin.dy;
const moduleNotes: Record<string, string> = {
  esp: '图中是当前模拟的 44 个排针，按天线端朝上、USB 端朝下阅读。GPIO 的具体用途由程序分配。',
  amp: '右侧是供电与数字音频输入。左侧是喇叭端子，SPK− 不接公共地。',
  speaker: '实物的两根喇叭线接功放的 SPK+ 与 SPK−。',
  mic: 'INMP441 左侧是声道选择和时钟，右侧是供电与音频数据。L/R 接地时使用左声道。',
  screen: '供电和共地后，主板用 SCL 提供时钟、用 SDA 发送显示数据。',
};

export function ModuleDetails({
  selection,
  onClose,
}: {
  selection: DetailSelection | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selectedPin, setSelectedPin] = useState<string>();
  const part = selection ? parts.get(selection.part) : undefined;
  const metadata = libraryHardware.find((item) => item.id === selection?.part);

  useLayoutEffect(() => {
    if (!selection || !dialog.current) return;
    setSelectedPin(selection.pin);
    if (!dialog.current.open) dialog.current.showModal();
  }, [selection]);

  const pin = part?.pins.find((item) => pinKey(item) === selectedPin) ?? part?.pins[0];
  const columns = [...new Set(part?.pins.map((item) => item.dx))].sort((a, b) => a - b);
  return (
    <dialog
      className="pin-dialog"
      ref={dialog}
      onClose={onClose}
      aria-labelledby="pin-dialog-title"
    >
      {part && pin && (
        <div className="pin-dialog-content">
          <div className="row pin-dialog-heading">
            <h2 id="pin-dialog-title">{part.name} · 针脚</h2>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
            >
              完成
            </button>
          </div>
          <p className="muted">{moduleNotes[selection?.part ?? ''] ?? metadata?.detail}</p>
          <div className="pin-dialog-layout">
            <div
              className="pin-diagram"
              aria-label={part.name + ' 排针位置示意图'}
            >
              {columns.map((column) => (
                <div
                  className="pin-diagram-column"
                  key={column}
                >
                  {part.pins
                    .filter((item) => item.dx === column)
                    .map((item) => (
                      <button
                        type="button"
                        key={pinKey(item)}
                        style={{ gridRow: item.dy + 1 }}
                        onClick={() => setSelectedPin(pinKey(item))}
                        aria-pressed={item === pin}
                      >
                        <i aria-hidden="true" />
                        {item.label}
                      </button>
                    ))}
                </div>
              ))}
            </div>
            <section
              className="pin-explanation"
              aria-live="polite"
            >
              <h3>{pin.label}</h3>
              <p>{pin.description}</p>
              {pin.expected !== undefined && (
                <p>
                  练习接点{' '}
                  <strong>
                    {sourceLabel(pin.expected)}
                    {pin.alsoAccepts !== undefined ? ' 或 ' + sourceLabel(pin.alsoAccepts) : ''}
                  </strong>
                </p>
              )}
              <small>点图中的针脚查看对应说明。</small>
            </section>
          </div>
        </div>
      )}
    </dialog>
  );
}
