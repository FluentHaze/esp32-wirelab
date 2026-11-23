export type PinValue = string | number;
export type Position = { board: number; col: number; row: number };
export type Pin = {
  dx: number;
  dy: number;
  label: string;
  description: string;
  value?: PinValue;
  expected?: PinValue;
  alsoAccepts?: PinValue;
  output?: boolean;
};
export type Part = { name: string; pins: Pin[] };
type ModuleGroup = {
  id: string;
  name: string;
  pins: Array<[string, PinValue, string]>;
  extra?: Array<[string, string]>;
};
type BoardCell =
  | { kind: 'header'; id: string; label: string; className: string }
  | (Position & { kind: 'hole'; id: string; strip: string; label: string; className: string });

const left = [
  '3V3',
  '3V3',
  'RST',
  4,
  5,
  6,
  7,
  15,
  16,
  17,
  18,
  8,
  3,
  46,
  9,
  10,
  11,
  12,
  13,
  14,
  '5V',
  'GND',
];
const right = [
  'GND',
  'TX',
  'RX',
  1,
  2,
  42,
  41,
  40,
  39,
  38,
  37,
  36,
  35,
  0,
  45,
  48,
  47,
  21,
  20,
  19,
  'GND',
  'GND',
];
const firmware: Record<number, string | undefined> = {
  0: 'BOOT 按键',
  4: '麦克风 WS 字选择',
  5: '麦克风 SCK 位时钟',
  6: '接收麦克风 SD 数据',
  7: '输出功放 DIN 数据',
  15: '功放 BCLK 位时钟',
  16: '功放 LRC 字选择',
  18: 'MCP 台灯示例',
  39: '音量减',
  40: '音量加',
  41: 'OLED SDA 数据',
  42: 'OLED SCL 时钟',
  47: '触摸按钮配置',
  48: '板载 LED 配置',
};
const special: Record<number, string> = {
  0: '启动绑带，复位时决定启动模式。',
  3: '启动绑带，参与 JTAG 信号源选择。',
  19: '原生 USB D−，默认用于 USB Serial/JTAG。',
  20: '原生 USB D+，默认用于 USB Serial/JTAG。',
  39: '可作 JTAG MTCK。',
  40: '可作 JTAG MTDO。',
  41: '可作 JTAG MTDI。',
  42: '可作 JTAG MTMS。',
  43: 'UART0 默认 TX，常用于日志或串口烧录。',
  44: 'UART0 默认 RX，常用于串口烧录。',
  45: '启动绑带，复位时可能参与决定 VDD_SPI 电压。',
  46: '启动绑带，参与启动模式配置。',
};
const power: Record<string, string> = {
  '3V3': '3.3 V 电源排针，为兼容的低压模块供电。',
  '5V': '5 V 电源排针，实际供电路径以开发板电路为准。',
  GND: '公共地，给电源形成回路，也给数字信号提供参考。',
  RST: '复位 / EN。拉低使芯片复位。',
  TX: special[43],
  RX: special[44],
};
function pinDescription(pin: PinValue) {
  if (typeof pin === 'string') return power[pin];
  const details = [special[pin]];
  if (pin >= 26 && pin <= 32) details.push('通常用于 SPI Flash / PSRAM。');
  if (pin >= 33 && pin <= 37)
    details.push('八线 Flash / PSRAM 可能占用。N16R8 类板应核对模组和板图。');
  if (pin >= 1 && pin <= 20)
    details.push(
      '支持 ADC 模拟采样，GPIO' +
        pin +
        ' 对应 ADC' +
        (pin <= 10 ? '1_CH' + (pin - 1) : '2_CH' + (pin - 11)) +
        '。',
    );
  if (pin >= 1 && pin <= 14) details.push('也支持芯片的电容触摸功能。');
  if (firmware[pin]) details.push('小智参考固件：' + firmware[pin] + '。');
  return (
    details.filter(Boolean).join(' ') || '通用数字输入／输出。可以由固件选择用途，请检查板载占用。'
  );
}
const groups: ModuleGroup[] = [
  {
    id: 'screen',
    name: 'OLED 屏幕',
    pins: [
      ['GND', 'GND', '公共地'],
      ['VCC', '3V3', '实验使用 3.3 V 供电'],
      ['SCL', 42, '主板发出的 I²C 时钟'],
      ['SDA', 41, 'I²C 数据与应答'],
    ],
  },
  {
    id: 'mic',
    name: 'INMP441 麦克风',
    pins: [
      ['GND', 'GND', '公共地'],
      ['VDD', '3V3', '实验使用 3.3 V 供电'],
      ['WS', 4, '主板输出字选择时钟'],
      ['SCK', 5, '主板输出位时钟'],
      ['SD', 6, '麦克风向主板发送样本'],
      ['L/R', 'GND', '实验中选择左声道槽'],
    ],
  },
  {
    id: 'amp',
    name: 'MAX98357A 功放',
    pins: [
      ['GND', 'GND', '公共地'],
      ['VIN', '5V', '功放供电，可接主板 3.3 V 或 5 V'],
      ['DIN', 7, '接收主板输出的音频样本'],
      ['BCLK', 15, '播放位时钟'],
      ['LRC', 16, '播放字选择时钟'],
    ],
    extra: [
      ['SPK+', '桥接输出正端，接喇叭正端'],
      ['SPK−', '桥接输出负端，接喇叭负端，不能接 GND'],
      ['GAIN', '增益设置，实验沿用模块默认值'],
      ['SD', '关断与声道模式，实验沿用模块默认值'],
    ],
  },
  {
    id: 'speaker',
    name: '喇叭',
    pins: [
      ['+', 'SPK+', '接功放正端'],
      ['−', 'SPK−', '接功放负端'],
    ],
  },
];
const baseParts = ['esp'];
const boardName = (index: number) => '板 ' + (index + 1);
const rowCount = 30;
const columns = ['−', '+', 'A', 'B', 'C', 'D', 'E', '', 'F', 'G', 'H', 'I', 'J', '+', '−'];
// E 到 F 的标准中槽跨度为 3 个孔距。
const gridX = (col: number) => (col > 7 ? col + 1 : col);
const colAt = (anchorCol: number, dx: number) => {
  const x = gridX(anchorCol) + dx;
  return (() => {
    if (x >= 9) {
      return x - 1;
    }
    if (x === 7 || x === 8) {
      return -1;
    }
    return x;
  })();
};
const sourceLabel = (value: PinValue) => (typeof value === 'number' ? 'GPIO' + value : value);
const parts = new Map<string, Part>([
  [
    'esp',
    {
      name: 'ESP32-S3',
      pins: left.flatMap((value, dy) => [
        { dx: 0, dy, value, label: sourceLabel(value), description: pinDescription(value) },
        {
          dx: 10,
          dy,
          value: right[dy],
          label: sourceLabel(right[dy]),
          description: pinDescription(right[dy]),
        },
      ]),
    },
  ],
]);
for (const { id, name, pins, extra = [] } of groups) {
  if (id === 'amp') {
    const inputOrder = ['VIN', 'GND', 'SD', 'GAIN', 'DIN', 'BCLK', 'LRC'];
    const inputs = inputOrder.map((label, dy) => {
      const connection = pins.find(([name]) => name === label);
      const detail = extra.find(([name]) => name === label);
      return {
        dx: 0,
        dy,
        label,
        expected: connection?.[1],
        alsoAccepts: label === 'VIN' ? '3V3' : undefined,
        description: connection?.[2] ?? detail?.[1] ?? label,
      };
    });
    const outputs = extra
      .filter(([label]) => label.startsWith('SPK'))
      .map(([label, description], index) => ({
        dx: -4,
        dy: index ? 4 : 2,
        label,
        description,
        output: true,
      }));
    parts.set(id, { name, pins: [...inputs, ...outputs] });
    continue;
  }
  const micRows = [
    ['L/R', 'WS', 'SCK'],
    ['GND', 'VDD', 'SD'],
  ];
  const footprint: Pin[] = pins.map(([label, expected, description], index) => {
    const bank = id === 'mic' ? micRows.findIndex((row) => row.includes(label)) : 0;
    const dy = id === 'mic' ? micRows[bank].indexOf(label) : index;
    return { dx: bank * 4, dy, label, expected, description };
  });
  for (const [label, description] of extra) {
    footprint.push({
      dx: 0,
      dy: footprint.length,
      label,
      description,
      output: label.startsWith('SPK'),
    });
  }
  parts.set(id, { name, pins: footprint });
}
parts.set('led', {
  name: 'LED 指示灯',
  pins: [
    {
      dx: 0,
      dy: 0,
      label: 'A',
      expected: 18,
      description: '阳极，通过模拟元件自带的限流电阻接 GPIO18',
    },
    { dx: 0, dy: 1, label: 'K', expected: 'GND', description: '阴极，接主板 GND' },
  ],
});
parts.set('button', {
  name: '两脚常开按钮',
  pins: [
    {
      dx: 0,
      dy: 0,
      label: 'SW',
      expected: 47,
      description: '开关信号端，接模拟启用内部上拉的 GPIO47',
    },
    {
      dx: 0,
      dy: 1,
      label: 'GND',
      expected: 'GND',
      description: '地线端，按下时开关闭合并将信号端拉低',
    },
  ],
});
parts.set('pot', {
  name: '10 kΩ 电位器',
  pins: [
    { dx: 0, dy: 0, label: '3V3', expected: '3V3', description: '电阻一端接 3.3 V' },
    { dx: 0, dy: 1, label: 'W', expected: 1, description: '滑动端接 GPIO1，也就是 ADC1_CH0' },
    { dx: 0, dy: 2, label: 'GND', expected: 'GND', description: '电阻另一端接公共地' },
  ],
});
parts.set('buzzer', {
  name: '3.3 V 有源蜂鸣器模块',
  pins: [
    { dx: 0, dy: 0, label: 'VCC', expected: '3V3', description: '模块供电接 3.3 V' },
    {
      dx: 0,
      dy: 1,
      label: 'SIG',
      expected: 17,
      description: '模式为高电平触发，由 GPIO17 控制模块驱动电路',
    },
    { dx: 0, dy: 2, label: 'GND', expected: 'GND', description: '接公共地' },
  ],
});
parts.set('bme280', {
  name: 'BME280 环境传感器',
  pins: [
    { dx: 0, dy: 0, label: 'VCC', expected: '3V3', description: 'I²C 模块供电接 3.3 V' },
    { dx: 0, dy: 1, label: 'GND', expected: 'GND', description: '接公共地' },
    {
      dx: 0,
      dy: 2,
      label: 'SCL',
      expected: 42,
      description: 'I²C 时钟，接 GPIO42，与 OLED 可共用同一根时钟线',
    },
    {
      dx: 0,
      dy: 3,
      label: 'SDA',
      expected: 41,
      description: 'I²C 数据，接 GPIO41，与 OLED 可共用同一根数据线',
    },
  ],
});
parts.set('ldr', {
  name: '光敏电阻模块',
  pins: [
    { dx: 0, dy: 0, label: 'VCC', expected: '3V3', description: '模块供电接 3.3 V' },
    { dx: 0, dy: 1, label: 'AO', expected: 2, description: '模拟输出接 GPIO2，也就是 ADC1_CH1' },
    { dx: 0, dy: 2, label: 'GND', expected: 'GND', description: '接公共地' },
  ],
});
parts.set('pir', {
  name: 'AM312 人体感应模块',
  pins: [
    { dx: 0, dy: 0, label: 'VCC', expected: '3V3', description: '模块供电接 3.3 V' },
    { dx: 0, dy: 1, label: 'OUT', expected: 10, description: '运动检测的数字输出接 GPIO10' },
    { dx: 0, dy: 2, label: 'GND', expected: 'GND', description: '接公共地' },
  ],
});
parts.set('sonar', {
  name: 'US-100 超声波测距',
  pins: [
    { dx: 0, dy: 0, label: 'VCC', expected: '3V3', description: '练习采用 3.3 V 供电和脉冲模式' },
    { dx: 0, dy: 1, label: 'TRIG', expected: 11, description: 'ESP32 从 GPIO11 发送测距触发脉冲' },
    {
      dx: 0,
      dy: 2,
      label: 'ECHO',
      expected: 12,
      description: 'ESP32 用 GPIO12 读取回波高电平的持续时间',
    },
    { dx: 0, dy: 3, label: 'GND', expected: 'GND', description: '接公共地' },
  ],
});
parts.set('servo', {
  name: 'SG90 微型舵机',
  pins: [
    { dx: 0, dy: 0, label: 'PWM', expected: 13, description: '角度控制信号接 GPIO13' },
    {
      dx: 0,
      dy: 1,
      label: 'VCC',
      expected: '5V',
      description: '模拟用 5 V 供电。实物使用符合舵机规格的独立电源',
    },
    { dx: 0, dy: 2, label: 'GND', expected: 'GND', description: '舵机电源地与 ESP32 共地' },
  ],
});
for (const [id, name, pinLabels] of [
  ['sht31', 'SHT31 温湿度模块', ['VIN', 'GND', 'SCL', 'SDA', 'ADR', 'RST', 'ALR']],
  ['veml7700', 'VEML7700 数字光照模块', ['VIN', '3Vo', 'GND', 'SCL', 'SDA']],
  ['ds3231', 'DS3231 实时时钟模块', ['GND', 'VCC', 'SDA', 'SCL']],
] as const) {
  const bus: Record<string, PinValue> = { VIN: '3V3', VCC: '3V3', GND: 'GND', SCL: 42, SDA: 41 };
  parts.set(id, {
    name,
    pins: pinLabels.map((label, dy) => ({
      dx: 0,
      dy,
      label,
      expected: bus[label],
      description: bus[label] === undefined ? '辅助引脚，本练习留空。' : pinDescription(bus[label]),
    })),
  });
}
const partType = (id: string) => id.split('#')[0];
function ensureInstance(id: string) {
  if (parts.has(id)) return;
  const original = parts.get(partType(id));
  if (original) parts.set(id, { ...original, name: original.name + ' #' + id.split('#')[1] });
}
const holeId = (board: number, col: number, row: number) => [board, col, row].join(':');
// 两块面包板的对应列之间相隔 19 个孔距。
const boardSpacing = 19;
const crossesBoards = (part: string, anchor: Position) =>
  partType(part) === 'esp' && (anchor.col === 11 || anchor.col === 12);
function footprintHole(part: string, anchor: Position, pin: Pin) {
  const cross = pin.dx > 0 && crossesBoards(part, anchor);
  return holeId(
    anchor.board + Number(cross),
    colAt(anchor.col, pin.dx - (cross ? boardSpacing : 0)),
    anchor.row + pin.dy,
  );
}
function pinLabelSide(part: string, pin: Pin) {
  return ((part === 'esp' || part === 'mic') && pin.dx > 0) || (part === 'amp' && pin.dx === 0)
    ? 'right'
    : 'left';
}

function pinLabelText(part: string, pin: Pin) {
  return part === 'esp' ? pin.label.replace('GPIO', 'IO') : pin.label;
}

function moduleBounds(part: string, anchor: Pick<Position, 'col' | 'row'>) {
  part = partType(part);
  const x = gridX(anchor.col);
  const y = anchor.row;
  const pinRows = Math.max(0, ...(parts.get(part)?.pins ?? []).map((pin) => pin.dy));
  if (part === 'esp') return { x0: x - 0.25, x1: x + 10.25, y0: y - 0.45, y1: y + pinRows + 0.45 };
  if (part === 'mic') return { x0: x - 0.65, x1: x + 4.65, y0: y - 1.65, y1: y + 3.65 };
  if (part === 'screen') return { x0: x + 0.18, x1: x + 10.2, y0: y - 0.53, y1: y + 3.53 };
  if (part === 'amp') return { x0: x - 4.35, x1: x + 0.35, y0: y - 0.45, y1: y + pinRows + 0.45 };
  if (part === 'led' || part === 'button')
    return { x0: x + 0.18, x1: x + 3.5, y0: y - 0.42, y1: y + pinRows + 0.42 };
  if (
    [
      'pot',
      'buzzer',
      'bme280',
      'ldr',
      'pir',
      'sonar',
      'servo',
      'sht31',
      'veml7700',
      'ds3231',
    ].includes(part)
  )
    return { x0: x + 0.18, x1: x + 5.1, y0: y - 0.42, y1: y + pinRows + 0.42 };
  if (part === 'speaker')
    return { x0: x + 0.2, x1: x + 3.85, y0: y - 0.37, y1: y + pinRows + 0.37 };
  return { x0: x + 0.2, x1: x + 0.65, y0: y - 0.45, y1: y + pinRows + 0.45 };
}
function boardX(position: Position) {
  return boardSpacing * position.board + gridX(position.col);
}
function worldBounds(part: string, anchor: Position) {
  const bounds = moduleBounds(part, anchor);
  const offset = boardSpacing * anchor.board;
  return { ...bounds, x0: bounds.x0 + offset, x1: bounds.x1 + offset };
}
function stripId(board: number, col: number, row: number) {
  if (col < 2 || col > 12) return board + ':rail:' + col;
  return board + ':' + (col < 7 ? 'left' : 'right') + ':' + row;
}
function address(board: number, col: number, row: number) {
  const name = (() => {
    if (col < 2) {
      return '左' + columns[col];
    }
    if (col > 12) {
      return '右' + columns[col];
    }
    return columns[col];
  })();
  return boardName(board) + ' ' + name + (row + 1);
}

function getBoardCells(board: number) {
  const cells: BoardCell[] = [];
  for (let row = -1; row < rowCount; row++) {
    for (let col = -1; col < columns.length; col++) {
      const rail = col === 0 || col === 1 || col === 13 || col === 14;
      const railGap = rail && row >= 0 && row % 6 === 5;
      if (row === -1 || col === -1 || !columns[col] || railGap) {
        const label = (() => {
          if (row === -1) {
            return columns[col] || '';
          }
          if (col === -1) {
            return String(row + 1);
          }
          return '';
        })();
        cells.push({
          kind: 'header',
          id: holeId(board, col, row),
          label,
          className: col === 7 ? 'gutter' : 'header',
        });
        continue;
      }
      const id = holeId(board, col, row);
      cells.push({
        kind: 'hole',
        id,
        board,
        col,
        row,
        strip: stripId(board, col, row),
        label: address(board, col, row),
        className: (() => {
          if (rail) {
            if (columns[col] === '+') {
              return 'rail-plus';
            }
            return 'rail-minus';
          }
          return 'group-strip';
        })(),
      });
    }
  }
  return cells;
}
export {
  partType,
  ensureInstance,
  baseParts,
  boardName,
  getBoardCells,
  columns,
  rowCount,
  parts,
  power,
  pinDescription,
  sourceLabel,
  gridX,
  holeId,
  footprintHole,
  moduleBounds,
  pinLabelSide,
  pinLabelText,
  worldBounds,
  boardX,
  crossesBoards,
};
