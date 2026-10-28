import { useMemo, useRef, useState } from 'react';
import { Empty } from './ui.jsx';

// Paleta categórica validada (ordem fixa, nunca reciclada). Séries únicas usam a cor da ótica.
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];

function niceMax(value) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function useTooltip() {
  const [tip, setTip] = useState(null);
  const ref = useRef(null);
  const show = (event, content) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setTip({ x: event.clientX - box.left, y: event.clientY - box.top, content });
  };
  return { ref, tip, show, hide: () => setTip(null) };
}

/** Barras verticais de uma série (magnitude ao longo do tempo ou categorias). */
export function BarChart({ data, labelKey = 'label', valueKey = 'value', format = (v) => v, height = 200, labelFormat = (l) => l }) {
  const { ref, tip, show, hide } = useTooltip();
  const max = useMemo(() => niceMax(Math.max(0, ...data.map((d) => Number(d[valueKey]) || 0))), [data, valueKey]);
  if (!data.length) return <Empty title="Sem dados no período" />;
  const width = 600;
  const padLeft = 4;
  const padBottom = 22;
  const plotHeight = height - padBottom - 8;
  const slot = (width - padLeft) / data.length;
  const barWidth = Math.max(3, Math.min(36, slot * 0.62));
  const labelEvery = Math.ceil(data.length / 12);
  return (
    <div ref={ref} style={{ position: 'relative' }} onMouseLeave={hide}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={0} x2={width} y1={8 + plotHeight * (1 - f)} y2={8 + plotHeight * (1 - f)} stroke="var(--border)" strokeDasharray="3 4" />
        ))}
        <line x1={0} x2={width} y1={8 + plotHeight} y2={8 + plotHeight} stroke="var(--border)" />
        {data.map((d, i) => {
          const value = Number(d[valueKey]) || 0;
          const h = Math.max(value > 0 ? 2 : 0, (value / max) * plotHeight);
          const x = padLeft + i * slot + (slot - barWidth) / 2;
          const y = 8 + plotHeight - h;
          const r = Math.min(4, barWidth / 2, h);
          return (
            <g key={i}>
              <rect
                x={padLeft + i * slot}
                y={0}
                width={slot}
                height={plotHeight + 8}
                fill="transparent"
                onMouseMove={(e) => show(e, `${labelFormat(d[labelKey])}: ${format(value)}`)}
              />
              <path
                d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barWidth - r} Q${x + barWidth},${y} ${x + barWidth},${y + r} V${y + h} Z`}
                fill="var(--brand)"
                style={{ pointerEvents: 'none' }}
              />
              {i % labelEvery === 0 && (
                <text x={padLeft + i * slot + slot / 2} y={height - 6} textAnchor="middle" fontSize="11" fill="var(--text-3)">
                  {labelFormat(d[labelKey])}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="subtle" style={{ position: 'absolute', top: 0, left: 4 }}>
        {format(max)}
      </div>
      {tip && (
        <div className="chart-tooltip" style={{ left: tip.x, top: tip.y }}>
          {tip.content}
        </div>
      )}
    </div>
  );
}

/** Área/linha com cruz de leitura e tooltip. */
export function AreaChart({ data, labelKey = 'label', valueKey = 'value', format = (v) => v, height = 200, labelFormat = (l) => l }) {
  const { ref, tip, show, hide } = useTooltip();
  const [hover, setHover] = useState(null);
  const max = useMemo(() => niceMax(Math.max(0, ...data.map((d) => Number(d[valueKey]) || 0))), [data, valueKey]);
  if (data.length < 2) return <BarChart data={data} labelKey={labelKey} valueKey={valueKey} format={format} height={height} labelFormat={labelFormat} />;
  const width = 600;
  const plotHeight = height - 30;
  const step = width / (data.length - 1);
  const points = data.map((d, i) => [i * step, 8 + plotHeight * (1 - (Number(d[valueKey]) || 0) / max)]);
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
  const labelEvery = Math.ceil(data.length / 10);
  return (
    <div
      ref={ref}
      style={{ position: 'relative' }}
      onMouseLeave={() => {
        hide();
        setHover(null);
      }}
      onMouseMove={(e) => {
        const box = ref.current.getBoundingClientRect();
        const index = Math.max(0, Math.min(data.length - 1, Math.round(((e.clientX - box.left) / box.width) * (data.length - 1))));
        setHover(index);
        show(e, `${labelFormat(data[index][labelKey])}: ${format(Number(data[index][valueKey]) || 0)}`);
      }}
    >
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img">
        <defs>
          <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={0} x2={width} y1={8 + plotHeight * (1 - f)} y2={8 + plotHeight * (1 - f)} stroke="var(--border)" strokeDasharray="3 4" />
        ))}
        <path d={`${line} L${width},${8 + plotHeight} L0,${8 + plotHeight} Z`} fill="url(#area-fill)" />
        <path d={line} fill="none" stroke="var(--brand)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {hover !== null && (
          <line x1={points[hover][0]} x2={points[hover][0]} y1={8} y2={8 + plotHeight} stroke="var(--text-3)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        )}
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={i} x={Math.min(width - 20, Math.max(16, i * step))} y={height - 6} textAnchor="middle" fontSize="11" fill="var(--text-3)">
              {labelFormat(d[labelKey])}
            </text>
          ) : null,
        )}
      </svg>
      {hover !== null && (
        <span
          style={{
            position: 'absolute',
            left: `calc(${(points[hover][0] / width) * 100}% - 5px)`,
            top: points[hover][1] - 5,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: 'var(--brand)',
            border: '2px solid var(--surface)',
            pointerEvents: 'none',
          }}
        />
      )}
      <div className="subtle" style={{ position: 'absolute', top: 0, left: 4 }}>
        {format(max)}
      </div>
      {tip && (
        <div className="chart-tooltip" style={{ left: tip.x, top: tip.y }}>
          {tip.content}
        </div>
      )}
    </div>
  );
}

/** Rosca para participação de poucas categorias (até 8; o restante vira "Outros"). */
export function DonutChart({ data, labelKey = 'label', valueKey = 'total', format = (v) => v, size = 150 }) {
  const { ref, tip, show, hide } = useTooltip();
  const items = useMemo(() => {
    const sorted = [...data].map((d) => ({ label: String(d[labelKey]), value: Number(d[valueKey]) || 0, color: d.color })).filter((d) => d.value > 0);
    if (sorted.length <= 8) return sorted;
    const head = sorted.slice(0, 7);
    head.push({ label: 'Outros', value: sorted.slice(7).reduce((s, d) => s + d.value, 0) });
    return head;
  }, [data, labelKey, valueKey]);
  const total = items.reduce((sum, d) => sum + d.value, 0);
  if (!total) return <Empty title="Sem dados" />;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="row wrap" style={{ gap: 18, alignItems: 'center' }}>
      <div ref={ref} style={{ position: 'relative', width: size, height: size }} onMouseLeave={hide}>
        <svg viewBox="0 0 100 100" width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--surface-2)" strokeWidth="14" />
          {items.map((d, i) => {
            const length = (d.value / total) * circumference;
            const gap = items.length > 1 ? 0.8 : 0;
            const segment = (
              <circle
                key={d.label}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={SERIES[i] }
                strokeWidth="14"
                strokeDasharray={`${Math.max(0, length - gap)} ${circumference}`}
                strokeDashoffset={-offset}
                onMouseMove={(e) => show(e, `${d.label}: ${format(d.value)} (${Math.round((d.value / total) * 100)}%)`)}
              />
            );
            offset += length;
            return segment;
          })}
        </svg>
        {tip && (
          <div className="chart-tooltip" style={{ left: tip.x, top: tip.y }}>
            {tip.content}
          </div>
        )}
      </div>
      <div className="stack sm" style={{ flex: 1, minWidth: 140 }}>
        {items.map((d, i) => (
          <div key={d.label} className="row between" style={{ fontSize: 13 }}>
            <span className="row truncate" style={{ gap: 6 }}>
              <i style={{ width: 10, height: 10, borderRadius: 3, background: SERIES[i], flex: 'none' }} />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="mono muted">
              {format(d.value)} · {Math.round((d.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Ranking em barras horizontais com valor ao lado. */
export function HBars({ data, labelKey = 'label', valueKey = 'total', format = (v) => v, onClick, max: fixedMax }) {
  if (!data?.length) return <Empty title="Sem dados" />;
  const max = fixedMax || Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);
  return (
    <div className="hbar">
      {data.map((d, i) => (
        <div key={`${d[labelKey]}-${i}`} className="hbar-row" style={{ cursor: onClick ? 'pointer' : undefined }} onClick={() => onClick?.(d)}>
          <span className="truncate" title={d[labelKey]}>
            {d[labelKey]}
          </span>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${((Number(d[valueKey]) || 0) / max) * 100}%`, background: d.color }} />
          </div>
          <span className="mono muted nowrap">{format(Number(d[valueKey]) || 0)}</span>
        </div>
      ))}
    </div>
  );
}
