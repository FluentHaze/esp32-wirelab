import { libraryHardware } from './hardwareCatalog';

const key = 'xiaozhi-workbench.v1';

type DraftWire = { id: number; from: string; to: string };
export type WorkspaceDraft = {
  added: string[];
  boardCount: number;
  placements: Array<[string, string]>;
  wires: DraftWire[];
  showWires: boolean;
  hardwareHidden: boolean;
  tested: boolean;
  ledOn: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlacement(value: unknown): value is [string, string] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'string' &&
    typeof value[1] === 'string'
  );
}

function isWire(value: unknown): value is DraftWire {
  return (
    isRecord(value) &&
    typeof value.id === 'number' &&
    Number.isSafeInteger(value.id) &&
    value.id > 0 &&
    typeof value.from === 'string' &&
    typeof value.to === 'string'
  );
}

export function readWorkspaceDraft(): WorkspaceDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const draft: unknown = JSON.parse(raw);
    if (!isRecord(draft) || !Array.isArray(draft.placements) || !Array.isArray(draft.wires))
      return null;
    const savedParts = Array.isArray(draft.added) ? draft.added : [];
    const placements = draft.placements.filter(isPlacement);
    return {
      added: [...new Set([...savedParts, ...placements.map(([id]) => id)])].filter(
        (id): id is string =>
          typeof id === 'string' && libraryHardware.some((item) => item.id === id.split('#')[0]),
      ),
      boardCount: (() => {
        if (
          typeof draft.boardCount === 'number' &&
          Number.isSafeInteger(draft.boardCount) &&
          draft.boardCount > 0
        ) {
          return draft.boardCount;
        }
        if (draft.thirdBoard === true) {
          return 3;
        }
        return 2;
      })(),
      placements,
      wires: draft.wires.filter(isWire),
      showWires: draft.showWires !== false,
      hardwareHidden: draft.hardwareHidden === true,
      tested: draft.tested === true,
      ledOn: draft.ledOn === true,
    };
  } catch {
    return null;
  }
}

export function saveWorkspaceDraft(draft: WorkspaceDraft): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}
