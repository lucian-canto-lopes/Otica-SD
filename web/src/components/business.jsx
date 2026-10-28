import { useEffect, useRef, useState } from 'react';
import { Camera, FileText, Paperclip, Plus, Trash2, Upload, UserPlus, X } from 'lucide-react';
import { api, apiUrl } from '../lib/api.js';
import { useApi, useDebounce } from '../lib/hooks.js';
import { date, fileSize, money, parseMoneyInput, phone } from '../lib/format.js';
import { Button, Empty, Input, Loading, useConfirm, useToast } from './ui.jsx';

/** Busca de cliente com autocompletar. value = {id, name} | null */
export function ClientPicker({ value, onChange, placeholder = 'Buscar cliente por nome, CPF ou telefone…', onCreate, autoFocus }) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounced = useDebounce(term, 250);
  const box = useRef(null);

  useEffect(() => {
    if (!open || debounced.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get('clients', { q: debounced, per_page: 8 })
      .then((r) => !cancelled && setResults(r.data))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (value?.id) {
    return (
      <div className="input row between" style={{ display: 'flex' }}>
        <span className="truncate">
          <strong>{value.name}</strong> {value.whatsapp && <span className="subtle">· {phone(value.whatsapp)}</span>}
        </span>
        <button type="button" className="btn ghost icon sm" onClick={() => onChange(null)} aria-label="Trocar cliente">
          <X size={15} />
        </button>
      </div>
    );
  }
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <Input value={term} autoFocus={autoFocus} placeholder={placeholder} onFocus={() => setOpen(true)} onChange={(e) => (setTerm(e.target.value), setOpen(true))} />
      {open && (term.length >= 2 || onCreate) && (
        <div className="search-results">
          {loading && (
            <div className="search-item">
              <Loading inline /> Buscando…
            </div>
          )}
          {results.map((client) => (
            <button
              type="button"
              key={client.id}
              className="search-item"
              onClick={() => {
                onChange(client);
                setOpen(false);
                setTerm('');
              }}
            >
              <div className="grow">
                <div className="truncate">
                  <strong>{client.name}</strong>
                </div>
                <div className="subtle">
                  {[phone(client.whatsapp || client.phone), client.city, client.last_purchase && `última compra ${date(client.last_purchase)}`].filter(Boolean).join(' · ')}
                </div>
              </div>
            </button>
          ))}
          {!loading && term.length >= 2 && !results.length && <div className="search-item subtle">Nenhum cliente encontrado.</div>}
          {onCreate && (
            <button
              type="button"
              className="search-item"
              onClick={() => {
                setOpen(false);
                onCreate(term);
              }}
            >
              <UserPlus size={16} /> Cadastrar novo cliente{term ? `: "${term}"` : ''}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Busca rápida de produto (nome, referência ou código de barras). */
export function ProductSearch({ onSelect, placeholder = 'Adicionar produto do estoque…' }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const debounced = useDebounce(term, 200);
  useEffect(() => {
    if (debounced.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    api.get('products', { q: debounced, per_page: 10 }).then((r) => !cancelled && setResults(r.data));
    return () => {
      cancelled = true;
    };
  }, [debounced]);
  return (
    <div style={{ position: 'relative' }}>
      <Input
        value={term}
        placeholder={placeholder}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results.length) {
            e.preventDefault();
            onSelect(results[0]);
            setTerm('');
          }
        }}
      />
      {results.length > 0 && (
        <div className="search-results">
          {results.map((product) => (
            <button
              type="button"
              key={product.id}
              className="search-item"
              onClick={() => {
                onSelect(product);
                setTerm('');
              }}
            >
              <div className="grow">
                <div className="truncate">
                  <strong>{product.name}</strong>
                </div>
                <div className="subtle">
                  {[product.sku, product.category, product.track_stock ? `estoque ${product.stock}` : null].filter(Boolean).join(' · ')}
                </div>
              </div>
              <strong className="mono">{money(product.price)}</strong>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const emptyItem = () => ({ key: Math.random().toString(36).slice(2), product_id: null, description: '', quantity: 1, unit_price: '', discount: '' });

export function itemTotal(item) {
  return Math.max(0, parseMoneyInput(item.quantity || 0) * parseMoneyInput(item.unit_price) - parseMoneyInput(item.discount));
}

/** Editor de itens de venda/orçamento: aceita produtos do cadastro ou itens livres. */
export function ItemsEditor({ items, onChange }) {
  const update = (key, field, value) => onChange(items.map((item) => (item.key === key ? { ...item, [field]: value } : item)));
  const remove = (key) => onChange(items.filter((item) => item.key !== key));
  const addProduct = (product) =>
    onChange([
      ...items.filter((i) => i.description || i.product_id),
      { ...emptyItem(), product_id: product.id, description: product.name, unit_price: String(product.price).replace('.', ','), stock: product.track_stock ? product.stock : null },
    ]);
  return (
    <div className="stack">
      <div className="row wrap">
        <div className="grow" style={{ minWidth: 220 }}>
          <ProductSearch onSelect={addProduct} />
        </div>
        <Button icon={Plus} onClick={() => onChange([...items, emptyItem()])}>
          Item livre
        </Button>
      </div>
      <div className="table-wrap">
        <table className="table compact items-table">
          <thead>
            <tr>
              <th style={{ minWidth: 220 }}>Descrição</th>
              <th style={{ width: 80 }}>Qtd</th>
              <th style={{ width: 120 }}>Preço unit.</th>
              <th style={{ width: 100 }}>Desconto</th>
              <th className="num" style={{ width: 110 }}>
                Total
              </th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.key}>
                <td>
                  <Input value={item.description} placeholder="Ex.: Lente multifocal, ajuste, armação do cliente…" onChange={(e) => update(item.key, 'description', e.target.value)} />
                  {item.product_id ? (
                    <span className="subtle">
                      Produto do estoque{item.stock !== null && item.stock !== undefined ? ` · saldo ${item.stock}` : ''}
                    </span>
                  ) : (
                    <span className="subtle">Item livre</span>
                  )}
                </td>
                <td>
                  <Input inputMode="decimal" value={item.quantity} onChange={(e) => update(item.key, 'quantity', e.target.value)} />
                </td>
                <td>
                  <Input inputMode="decimal" placeholder="0,00" value={item.unit_price} onChange={(e) => update(item.key, 'unit_price', e.target.value)} />
                </td>
                <td>
                  <Input inputMode="decimal" placeholder="0,00" value={item.discount} onChange={(e) => update(item.key, 'discount', e.target.value)} />
                </td>
                <td className="num">{money(itemTotal(item))}</td>
                <td>
                  <Button variant="ghost" size="sm" icon={Trash2} onClick={() => remove(item.key)} aria-label="Remover item" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!items.length && <Empty title="Nenhum item">Busque um produto acima ou adicione um item livre.</Empty>}
    </div>
  );
}

export const PRESCRIPTION_FIELDS = ['sph', 'cyl', 'axis', 'dnp', 'height'];

/** Grade de graus OD/OE + adição (receita e OS). */
export function PrescriptionFields({ values, onChange, readOnly }) {
  const labels = ['Esférico', 'Cilíndrico', 'Eixo', 'DNP', 'Altura'];
  return (
    <div className="stack sm">
      <div className="presc-grid">
        <span />
        {labels.map((label) => (
          <span key={label} className="head">
            {label}
          </span>
        ))}
        {['od', 'oe'].map((eye) => [
          <span key={eye} className="eye">
            {eye.toUpperCase()}
          </span>,
          ...PRESCRIPTION_FIELDS.map((field) => (
            <Input
              key={`${eye}_${field}`}
              className="sm"
              value={values[`${eye}_${field}`] || ''}
              readOnly={readOnly}
              inputMode={field === 'axis' || field === 'dnp' || field === 'height' ? 'decimal' : 'text'}
              onChange={(e) => onChange(`${eye}_${field}`, e.target.value)}
            />
          )),
        ])}
        <span className="eye" style={{ fontSize: 11 }}>
          ADD
        </span>
        <Input className="sm" value={values.addition || ''} readOnly={readOnly} onChange={(e) => onChange('addition', e.target.value)} />
      </div>
    </div>
  );
}

export function prescriptionSummary(p) {
  if (!p) return '';
  const eye = (e) => [p[`${e}_sph`], p[`${e}_cyl`], p[`${e}_axis`] && `${p[`${e}_axis`]}°`].filter(Boolean).join(' ');
  return [`OD ${eye('od') || '—'}`, `OE ${eye('oe') || '—'}`, p.addition && `ADD ${p.addition}`].filter(Boolean).join(' · ');
}

/**
 * Anexos de cliente, venda, OS ou orçamento. No celular, "Tirar foto" abre a câmera traseira diretamente.
 */
export function AttachmentsPanel({ entityType, entityId, canEdit = true }) {
  const { data, loading, reload } = useApi('attachments', { entity_type: entityType, entity_id: entityId });
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileInput = useRef(null);
  const cameraInput = useRef(null);
  const toast = useToast();
  const confirm = useConfirm();

  const upload = async (files) => {
    if (!files?.length) return;
    const form = new FormData();
    form.append('entity_type', entityType);
    form.append('entity_id', entityId);
    for (const file of files) form.append('files[]', await compressImage(file));
    setUploading(true);
    try {
      await api.upload('attachments', form);
      toast.success(files.length > 1 ? `${files.length} arquivos anexados` : 'Arquivo anexado');
      reload();
    } catch (error) {
      toast.error(error);
    } finally {
      setUploading(false);
    }
  };

  const remove = async (attachment) => {
    if (!(await confirm({ message: `Excluir o anexo "${attachment.original_name}"?`, danger: true, confirmLabel: 'Excluir' }))) return;
    await api.del('attachments', { id: attachment.id });
    reload();
  };

  return (
    <div className="stack">
      {canEdit && (
        <div
          className={`dropzone ${drag ? 'drag' : ''}`}
          onDragOver={(e) => (e.preventDefault(), setDrag(true))}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            upload([...e.dataTransfer.files]);
          }}
        >
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            <Button variant="primary" icon={Camera} loading={uploading} onClick={() => cameraInput.current.click()}>
              Tirar foto
            </Button>
            <Button icon={Upload} onClick={() => fileInput.current.click()} disabled={uploading}>
              Enviar arquivo
            </Button>
          </div>
          <div className="subtle" style={{ marginTop: 8 }}>
            Receitas, documentos, fotos da armação… (imagens, PDF, Word, Excel · até 15 MB). Também é possível arrastar arquivos para cá.
          </div>
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (upload([...e.target.files]), (e.target.value = ''))} />
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
            hidden
            onChange={(e) => (upload([...e.target.files]), (e.target.value = ''))}
          />
        </div>
      )}
      {loading && !data ? (
        <Loading />
      ) : data?.length ? (
        <div className="thumbs">
          {data.map((attachment) => {
            const url = apiUrl('attachments', { id: attachment.id });
            const isImage = attachment.mime.startsWith('image/') && !attachment.mime.includes('heic');
            return (
              <div key={attachment.id} className="thumb">
                <a className="preview" href={url} target="_blank" rel="noreferrer">
                  {isImage ? <img src={url} alt={attachment.original_name} loading="lazy" /> : <FileText size={34} strokeWidth={1.4} />}
                </a>
                <div className="info">
                  <div className="truncate" title={attachment.original_name}>
                    {attachment.original_name}
                  </div>
                  <div className="row between subtle">
                    <span>
                      {date(attachment.created_at)} · {fileSize(attachment.size)}
                    </span>
                    {canEdit && (
                      <button type="button" className="btn ghost icon sm" onClick={() => remove(attachment)} aria-label="Excluir anexo">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  {attachment.entity_type !== entityType && <span className="badge">{{ sale: 'Venda', service_order: 'OS', quote: 'Orçamento', client: 'Cliente' }[attachment.entity_type]}</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty icon={Paperclip} title="Nenhum anexo" />
      )}
    </div>
  );
}

/** Reduz fotos grandes da câmera antes do envio (mais rápido em redes móveis). */
async function compressImage(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.size < 900 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
