import { moduleBounds, parts, pinLabelSide, pinLabelText } from './catalog';

const markings: Record<string, string> = {
  esp: 'ESP32-S3',
  pot: '10k',
  bme280: 'BME280',
  ldr: 'LDR',
  pir: 'AM312',
  servo: 'SG90',
  screen: 'OLED 128×32',
  amp: '98357A',
  sht31: 'SHT31',
  veml7700: 'VEML7700',
  ds3231: 'DS3231',
};

function PackageDetail({ id }: { id: string }) {
  switch (id) {
    case 'pot':
    case 'button':
    case 'servo':
      return (
        <>
          <rect
            className="art-package"
            x={-0.76}
            y={-0.62}
            width={1.52}
            height={1.24}
            rx={0.16}
          />
          <circle
            className="art-metal"
            r={0.47}
          />
          <path
            className="art-engraving"
            d={id === 'pot' ? 'M-.26.21L.26-.21' : 'M-.25 0H.25M0-.25V.25'}
          />
        </>
      );
    case 'sonar':
      return [-0.69, 0.69].map((x) => (
        <g
          key={x}
          transform={`translate(${x} 0)`}
        >
          <circle
            className="art-metal"
            r={0.56}
          />
          <circle
            className="art-package"
            r={0.42}
          />
          <path
            className="art-engraving"
            d="M-.21-.15H.21M-.26 0H.26M-.21.15H.21"
          />
        </g>
      ));
    case 'buzzer':
    case 'mic':
    case 'pir':
    case 'ldr':
      return (
        <>
          <circle
            className={id === 'pir' || id === 'ldr' ? 'art-metal' : 'art-package'}
            r={0.58}
          />
          {id === 'ldr' ? (
            <path
              className="art-sensor-trace"
              d="M-.33-.24H.24V-.08H-.24V.08H.24V.24H-.33"
            />
          ) : id === 'pir' ? (
            <path
              className="art-engraving"
              d="M-.38 0H.38M0-.38V.38M-.26-.26L.26.26M.26-.26L-.26.26"
            />
          ) : (
            <circle
              className="art-port"
              cy={-0.08}
              r={0.13}
            />
          )}
        </>
      );
    default:
      return (
        <>
          <path
            className="art-contacts"
            d="M-.78-.28H.78M-.78 0H.78M-.78.28H.78"
          />
          <rect
            className="art-package"
            x={-0.57}
            y={-0.48}
            width={1.14}
            height={0.96}
            rx={0.09}
          />
          <circle
            className="art-port"
            cx={-0.3}
            cy={-0.21}
            r={0.085}
          />
        </>
      );
  }
}

export function ComponentArt({ id, onBoard = false }: { id: string; onBoard?: boolean }) {
  const { x0, x1, y0, y1 } = moduleBounds(id, { col: 0, row: 0 });
  const pins = parts.get(id)!.pins;
  const width = x1 - x0;
  const height = y1 - y0;
  const y = (y0 + y1) / 2;
  const radius = Math.min(width, height) / 2;
  const left = Math.min(x0, ...pins.map(({ dx }) => dx));
  const right = Math.max(x1, ...pins.map(({ dx }) => dx));
  const span = Math.max(right - left, height);
  const frame = Math.max(4 + span * 0.65, span + 1);
  const cardView = `${(left + right - frame) / 2} ${y - frame / 2} ${frame} ${frame}`;
  const marking = markings[id];
  const display = id === 'screen';
  const controller = id === 'esp';
  // Reserve the silkscreen lanes before laying out components or model names.
  let detailLeft = x0 + 0.15;
  let detailRight = x1 - 0.15;
  for (const pin of pins) {
    const clearance = 0.52 + 0.31 * pinLabelText(id, pin).length;
    if (pinLabelSide(id, pin) === 'right') detailRight = Math.min(detailRight, pin.dx - clearance);
    else detailLeft = Math.max(detailLeft, pin.dx + clearance);
  }
  const detailWidth = detailRight - detailLeft;
  const detailX = (detailLeft + detailRight) / 2;
  const detailY = y - (marking ? height * 0.12 : 0);
  const detailScale = Math.min(height * 0.46, detailWidth / (id === 'sonar' ? 2.65 : 1.65), 1.35);

  return (
    <svg
      className={`component-art art-${id}${onBoard ? ' component-art--board' : ''}`}
      viewBox={onBoard ? `${x0} ${y0} ${width} ${height}` : cardView}
      aria-hidden="true"
    >
      {id === 'led' || id === 'speaker' ? (
        <>
          {pins.map(({ dx, dy, label }) => (
            <path
              key={label}
              className="art-lead"
              d={`M ${dx} ${dy} H ${detailX}`}
            />
          ))}
          {id === 'led' ? (
            <g transform={`translate(${detailX} ${y}) scale(${radius})`}>
              <path
                className="art-led-lens"
                d="M-.8-.83H0a.83.83 0 0 1 0 1.66h-.8z"
              />
              <path
                className="art-led-rim"
                d="M-.8-.94v1.88"
              />
              <path
                className="art-highlight"
                d="M-.5-.51h.46q.37 0 .51.25"
              />
            </g>
          ) : (
            <>
              <circle
                className="art-speaker-rim"
                cx={detailX}
                cy={y}
                r={radius * 0.96}
              />
              <circle
                className="art-speaker-cone"
                cx={detailX}
                cy={y}
                r={radius * 0.72}
              />
              <circle
                className="art-speaker-cap"
                cx={detailX}
                cy={y}
                r={radius * 0.31}
              />
            </>
          )}
        </>
      ) : (
        <>
          <rect
            className="art-body art-pcb"
            x={x0}
            y={y0}
            width={width}
            height={height}
            rx={id === 'mic' ? radius : 0.38}
          />
          {display || controller ? (
            <>
              <rect
                className={controller ? 'art-shield' : 'art-package'}
                x={detailLeft}
                y={y0 + height * (controller ? 0.17 : 0.13)}
                width={detailWidth}
                height={height * (controller ? 0.32 : 0.74)}
                rx={0.18}
              />
              {controller && (
                <>
                  <rect
                    className="art-metal"
                    x={detailX - 1.3}
                    y={y1 - 1.5}
                    width={2.6}
                    height={1.44}
                    rx={0.22}
                  />
                  <rect
                    className="art-package"
                    x={detailX - 0.96}
                    y={y1 - 0.52}
                    width={1.92}
                    height={0.29}
                    rx={0.1}
                  />
                  <path
                    className="art-antenna"
                    d={`M${detailX - 2} ${y0 + 2.25}v-1.15h.8v.7h.8v-.7h.8v.7h.8v-.7h.8v1.15`}
                  />
                </>
              )}
            </>
          ) : (
            <g
              className="art-detail"
              transform={`translate(${detailX} ${detailY}) scale(${detailScale})`}
            >
              <PackageDetail id={id} />
            </g>
          )}
          {marking && (
            <text
              className={display ? 'art-oled-text' : controller ? 'art-shield-text' : undefined}
              style={{
                fontSize: display
                  ? 0.7
                  : controller
                    ? 0.76
                    : Math.min(0.53, detailWidth / (marking.length * 0.7)),
              }}
              x={display || controller ? detailX : detailX}
              y={display ? y : controller ? y0 + height * 0.32 : y1 - height * 0.15}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {marking}
            </text>
          )}
        </>
      )}
      {pins.map(({ dx, dy, label }) => (
        <circle
          className="art-pin"
          key={`${dx}:${dy}`}
          cx={dx}
          cy={dy}
          r={0.2}
        >
          <title>{label}</title>
        </circle>
      ))}
    </svg>
  );
}
