import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Inbox, MessageCircle, Search, X } from 'lucide-react';
import { whatsappLink } from '../lib/format.js';

export function Button({ variant = '', size = '', icon: Icon, loading, children, className = '', ...props }) {
  const classes = ['btn', variant, size, !children && Icon ? 'icon' : '', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} disabled={loading || props.disabled} {...props}>
      {loading ? <span className="spinner" /> : Icon ? <Icon size={size === 'sm' ? 15 : 17} /> : null}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, className = '', children }) {
  return (
    <div className={`field ${className}`}>
      {label && <label>{label}</label>}
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}

export function Input({ className = '', ...props }) {
  return <input className={`input ${className}`} {...props} />;
}

export function Textarea({ className = '', ...props }) {
  return <textarea className={`textarea ${className}`} {...props} />;
}

export function Select({ options = [], placeholder, className = '', ...props }) {
  return (
    <select className={`select ${className}`} {...props}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((option) =>
        typeof option === 'object' ? (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ) : (
          <option key={option} value={option}>
            {option}
          </option>
        ),
      )}
    </select>
  );
}

export function Checkbox({ label, ...props }) {
  return (
    <label className="checkbox">
      <input type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Buscar…', autoFocus, className = '' }) {
  return (
    <div className={`input-group ${className}`}>
      <Search size={16} />
      <input className="input" value={value} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function Card({ title, actions, children, className = '', bodyClass = 'card-body', ...props }) {
  return (
    <section className={`card ${className}`} {...props}>
      {(title || actions) && (
        <div className="card-header">
          {typeof title === 'string' ? <h3>{title}</h3> : title}
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {bodyClass === null ? children : <div className={bodyClass}>{children}</div>}
    </section>
  );
}

export function Kpi({ label, value, hint, icon: Icon, delta, onClick, tone }) {
  return (
    <div className={`card kpi ${onClick ? 'clickable' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined}>
      <span className="kpi-label">
        {Icon && <Icon size={15} style={tone ? { color: `var(--${tone})` } : undefined} />}
        {label}
      </span>
      <span className="kpi-value">{value}</span>
      {(hint || delta !== undefined) && (
        <span className="kpi-hint">
          {delta !== undefined && delta !== null && Number.isFinite(delta) && (
            <span className={`delta ${delta >= 0 ? 'up' : 'down'}`}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta * 100).toFixed(0)}%{' '}
            </span>
          )}
          {hint}
        </span>
      )}
    </div>
  );
}

export function Badge({ tone = '', children }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function TagChip({ tag }) {
  return (
    <span className="tag" style={{ color: tag.color, borderColor: `${tag.color}66`, background: `${tag.color}14` }}>
      {tag.name}
    </span>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.key} type="button" role="tab" className={`tab ${active === tab.key ? 'active' : ''}`} onClick={() => onChange(tab.key)}>
          {tab.label}
          {tab.count !== undefined && tab.count !== null && <span className="count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon: Icon = Inbox, title = 'Nada por aqui', children }) {
  return (
    <div className="empty">
      <Icon size={30} strokeWidth={1.5} />
      <strong>{title}</strong>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}

export function Loading({ inline }) {
  return inline ? (
    <span className="spinner" />
  ) : (
    <div className="loading-block">
      <span className="spinner lg" />
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="page-header">
      <div className="row top">
        {back}
        <div className="stack sm" style={{ gap: 2 }}>
          <h1>{title}</h1>
          {subtitle && <span className="muted">{subtitle}</span>}
        </div>
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function WhatsAppButton({ phone, text = '', size = 'sm', label = 'WhatsApp', onSent }) {
  if (!phone) return null;
  return (
    <a
      className={`btn whatsapp ${size}`}
      href={whatsappLink(phone, text)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => {
        e.stopPropagation();
        onSent?.();
      }}
    >
      <MessageCircle size={15} />
      {label}
    </a>
  );
}

export function Modal({ open, title, onClose, children, footer, size = '' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-root" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2>{title}</h2>
          <Button variant="ghost" icon={X} onClick={onClose} aria-label="Fechar" />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

/* Toasts */
const ToastContext = createContext(() => {});
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, tone = '') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((list) => [...list, { id, message, tone }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export function useToast() {
  const push = useContext(ToastContext);
  return {
    success: (m) => push(m, 'success'),
    error: (m) => push(typeof m === 'string' ? m : m?.message || 'Erro inesperado.', 'error'),
    info: (m) => push(m, ''),
  };
}

/* Confirmação */
const ConfirmContext = createContext(async () => false);
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolver = useRef(null);
  const confirm = useCallback((options) => {
    setState(typeof options === 'string' ? { message: options } : options);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);
  const close = (result) => {
    resolver.current?.(result);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={Boolean(state)}
        title={state?.title || 'Confirmar'}
        onClose={() => close(false)}
        footer={
          <>
            <Button onClick={() => close(false)}>Cancelar</Button>
            <Button variant={state?.danger ? 'danger solid' : 'primary'} onClick={() => close(true)}>
              {state?.confirmLabel || 'Confirmar'}
            </Button>
          </>
        }
      >
        <p>{state?.message}</p>
      </Modal>
    </ConfirmContext.Provider>
  );
}
export function useConfirm() {
  return useContext(ConfirmContext);
}

export function Pagination({ page, perPage, total, onChange }) {
  const pages = Math.max(1, Math.ceil((total || 0) / (perPage || 1)));
  if (!total) return null;
  const from = (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  return (
    <div className="pagination">
      <span className="subtle">
        {from}–{to} de {total.toLocaleString('pt-BR')}
      </span>
      <div className="row">
        <Button size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Anterior" />
        <span className="subtle">
          {page} / {pages}
        </span>
        <Button size="sm" icon={ChevronRight} disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Próxima" />
      </div>
    </div>
  );
}

/**
 * Tabela com ordenação, clique na linha e lista compacta no celular.
 * columns: [{ key, label, render?, className?, sortable? }]
 */
export function DataTable({ columns, rows, onRowClick, sort, onSort, mobile, empty, loading, rowKey = 'id' }) {
  if (loading && !rows?.length) return <Loading />;
  if (!rows?.length) return empty || <Empty title="Nenhum registro encontrado" />;
  return (
    <>
      <div className="table-wrap table-desktop">
        <table className="table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`${column.className || ''} ${column.sortable ? 'sortable' : ''}`}
                  onClick={() => column.sortable && onSort?.(column.key)}
                >
                  {column.label}
                  {sort?.key === column.key && (sort.dir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[rowKey]} className={onRowClick ? 'clickable' : ''} onClick={() => onRowClick?.(row)}>
                {columns.map((column) => (
                  <td key={column.key} className={column.className}>
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="list-mobile">
        {rows.map((row) => (
          <div key={row[rowKey]} className="mobile-item" onClick={() => onRowClick?.(row)}>
            {mobile ? mobile(row) : columns.slice(0, 2).map((c) => <div key={c.key}>{c.render ? c.render(row) : row[c.key]}</div>)}
          </div>
        ))}
      </div>
    </>
  );
}

/** Estado de ordenação + paginação compartilhado pelas listagens. */
export function useListState(initialSort = null, perPage = 25) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(initialSort);
  const toggleSort = (key) => {
    setPage(1);
    setSort((current) => (current?.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };
  return {
    page,
    setPage,
    sort,
    toggleSort,
    params: { page, per_page: perPage, sort: sort?.key, dir: sort?.dir },
  };
}

export function StatusBadge({ map, value }) {
  const item = map[value] || { label: value, tone: '' };
  return <Badge tone={item.tone}>{item.label}</Badge>;
}
