import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { ComponentArt } from './ComponentArt';
import { Dropdown } from './Dropdown';

import { categories, libraryHardware, type HardwareId } from './hardwareCatalog';

type Props = {
  added: readonly string[];
  onAdd: (id: HardwareId) => void;
  openInitially: boolean;
  onMainboard: () => void;
};

export function HardwareLibrary({ added, onAdd, openInitially, onMainboard }: Props) {
  const opener = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(openInitially);
  const panel = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const keywords = query.trim().toLowerCase().split(/\s+/);
  const matches = libraryHardware.filter((item) => {
    const entry = (
      item.name +
      ' ' +
      item.category +
      ' ' +
      item.aliases +
      ' ' +
      item.detail
    ).toLowerCase();
    return (
      (!category || item.category === category) && keywords.every((word) => entry.includes(word))
    );
  });

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !panel.current?.contains(event.target) &&
        !opener.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  return (
    <>
      <button
        id="add-hardware"
        type="button"
        ref={opener}
        aria-expanded={open}
        aria-controls="component-picker"
        onClick={() => setOpen((value) => !value)}
      >
        <Plus size={17} />
        元件
      </button>
      <section
        id="component-picker"
        ref={panel}
        className="component-picker"
        hidden={!open}
        aria-label="选择元件"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
            opener.current?.focus();
          }
        }}
      >
        <div className="row hardware-heading">
          <h2 id="hardware-title">选择元件</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
          >
            <X size={15} />
            收起
          </button>
        </div>
        <p className="muted">选择元件后，移到孔位预览，点击确认放置。</p>
        <button
          className="mainboard-card"
          type="button"
          aria-label="ESP32-S3 主板"
          onClick={() => {
            onMainboard();
            setOpen(false);
          }}
        >
          <ComponentArt id="esp" />
          <span className="mainboard-copy">
            <strong>ESP32-S3 主板</strong>
            <small>N16R8 · 双 USB-C</small>
          </span>
          <Plus
            size={17}
            aria-hidden="true"
          />
        </button>
        <div className="hardware-filters">
          <div>
            <label htmlFor="hardware-search">搜索名称或用途</label>
            <input
              id="hardware-search"
              ref={search}
              type="search"
              placeholder="例如电位器、I²C、麦克风"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="hardware-category">按功能筛选</label>
            <Dropdown
              id="hardware-category"
              label={category || '全部分类'}
              accessibilityLabel={'按功能筛选，当前' + (category || '全部分类')}
              items={['', ...categories].map((value) => ({
                key: value,
                label: value || '全部分类',
                checked: category === value,
                onSelect: () => setCategory(value),
              }))}
            />
          </div>
        </div>
        {(() => {
          if (matches.length) {
            return (
              <ul className="hardware-results">
                {matches.map((item) => {
                  const count = added.filter((id) => id.split('#')[0] === item.id).length;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="component-card"
                        aria-label={'放置' + item.name}
                        onClick={() => {
                          onAdd(item.id);
                          setOpen(false);
                        }}
                      >
                        <ComponentArt id={item.id} />
                        <span>
                          <strong>{item.name}</strong>
                          <small>
                            {item.category}
                            {count ? ' · 已放置 ' + count + ' 个' : ''}
                          </small>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            );
          }
          return (
            <p
              className="hardware-empty"
              role="status"
            >
              没有匹配的硬件。试试其他分类或名称。
            </p>
          );
        })()}
      </section>
    </>
  );
}
