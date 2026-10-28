import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Boxes, Package, Plus } from 'lucide-react';
import { api } from '../../lib/api.js';
import { invalidate, useApi, useDebounce } from '../../lib/hooks.js';
import { useSession } from '../../lib/session.jsx';
import { compactMoney, money, number } from '../../lib/format.js';
import {
  Badge, Button, Card, Checkbox, DataTable, Field, Input, Kpi, Modal, PageHeader, Pagination, SearchInput, Select, Textarea,
  useListState, useToast,
} from '../../components/ui.jsx';

const EMPTY = {
  name: '', sku: '', barcode: '', category: '', brand: '', model: '', color: '', size: '', unit: 'UN', cost: '', price: '',
  stock: '', min_stock: '', track_stock: true, supplier_id: '', description: '', active: true,
};

export function ProductForm({ open, product, categories = [], onClose, onSaved }) {
  const [values, setValues] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const suppliers = useApi(open ? 'partners' : null, { type: 'supplier', per_page: 500 }).data?.data || [];
  const toast = useToast();
  useEffect(() => {
    if (open) setValues(product ? { ...EMPTY, ...Object.fromEntries(Object.entries(product).map(([k, v]) => [k, v ?? ''])), track_stock: Boolean(Number(product.track_stock)), active: Boolean(Number(product.active)) } : EMPTY);
  }, [open, product]);
  const set = (f) => (e) => setValues((v) => ({ ...v, [f]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async (event) => {
    event?.preventDefault();
    setSaving(true);
    try {
      const result = product?.id ? await api.patch('products', values, { id: product.id }) : await api.post('products', values);
      invalidate('products');
      toast.success('Produto salvo');
      onSaved?.(result.id || product?.id);
      onClose();
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };
  const margin = Number(String(values.price).replace(',', '.')) && Number(String(values.cost).replace(',', '.'))
    ? (1 - Number(String(values.cost).replace(',', '.')) / Number(String(values.price).replace(',', '.'))) * 100
    : null;
  return (
    <Modal open={open} onClose={onClose} size="lg" title={product?.id ? 'Editar produto' : 'Novo produto'} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={saving} onClick={save}>Salvar</Button></>}>
      <form className="form-grid" onSubmit={save}>
        <Field label="Descrição *" className="c8">
          <Input value={values.name} onChange={set('name')} required autoFocus />
        </Field>
        <Field label="Categoria" className="c4">
          <Input value={values.category} onChange={set('category')} list="product-categories" placeholder="Armações, Lentes…" />
          <datalist id="product-categories">
            {['Armações', 'Lentes', 'Óculos solares', 'Lentes de contato', 'Acessórios', 'Serviços', ...categories].filter((c, i, a) => a.indexOf(c) === i).map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Referência" className="c3">
          <Input value={values.sku} onChange={set('sku')} />
        </Field>
        <Field label="Código de barras" className="c3">
          <Input value={values.barcode} onChange={set('barcode')} inputMode="numeric" />
        </Field>
        <Field label="Marca" className="c3">
          <Input value={values.brand} onChange={set('brand')} />
        </Field>
        <Field label="Modelo" className="c3">
          <Input value={values.model} onChange={set('model')} />
        </Field>
        <Field label="Cor" className="c3">
          <Input value={values.color} onChange={set('color')} />
        </Field>
        <Field label="Tamanho" className="c3">
          <Input value={values.size} onChange={set('size')} />
        </Field>
        <Field label="Custo" className="c3">
          <Input inputMode="decimal" value={values.cost} onChange={set('cost')} placeholder="0,00" />
        </Field>
        <Field label="Preço de venda" className="c3" hint={margin !== null ? `Margem ${margin.toFixed(0)}%` : undefined}>
          <Input inputMode="decimal" value={values.price} onChange={set('price')} placeholder="0,00" />
        </Field>
        {!product?.id && (
          <Field label="Estoque inicial" className="c3">
            <Input inputMode="numeric" value={values.stock} onChange={set('stock')} />
          </Field>
        )}
        <Field label="Estoque mínimo" className="c3">
          <Input inputMode="numeric" value={values.min_stock} onChange={set('min_stock')} />
        </Field>
        <Field label="Fornecedor" className="c6">
          <Select value={values.supplier_id} onChange={set('supplier_id')} placeholder="—" options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
        </Field>
        <div className="c6 stack sm" style={{ justifyContent: 'flex-end' }}>
          <Checkbox label="Controlar estoque deste item" checked={values.track_stock} onChange={set('track_stock')} />
          {product?.id && <Checkbox label="Ativo" checked={values.active} onChange={set('active')} />}
        </div>
        <Field label="Observações">
          <Textarea value={values.description} onChange={set('description')} rows={2} />
        </Field>
      </form>
    </Modal>
  );
}

export default function Products() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { can } = useSession();
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState('');
  const [creating, setCreating] = useState(false);
  const q = useDebounce(term, 250);
  const list = useListState({ key: 'name', dir: 'asc' });
  const lowStock = params.get('low_stock') === '1';
  const { data, loading } = useApi('products', { q, category, low_stock: lowStock ? 1 : undefined, with_meta: 1, ...list.params });
  const summary = data?.summary;

  return (
    <div className="stack">
      <PageHeader
        title="Produtos"
        subtitle="Cadastro e saldo de estoque"
        actions={
          <>
            <Button icon={Boxes} onClick={() => navigate('/estoque')}>
              Entrada / ajuste
            </Button>
            {can('sell') && (
              <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                Novo produto
              </Button>
            )}
          </>
        }
      />
      {summary && (
        <div className="grid kpis">
          <Kpi icon={Package} label="Produtos ativos" value={number(summary.products)} hint={`${number(summary.units)} unidades`} />
          <Kpi label="Estoque a custo" value={compactMoney(summary.cost_value)} />
          <Kpi label="Estoque a preço de venda" value={compactMoney(summary.sale_value)} />
          <Kpi icon={AlertTriangle} label="Abaixo do mínimo" value={number(summary.low_stock)} tone={Number(summary.low_stock) ? 'warning' : undefined} onClick={() => setParams(lowStock ? {} : { low_stock: '1' })} />
        </div>
      )}
      <div className="row wrap">
        <SearchInput className="grow" value={term} onChange={(v) => (setTerm(v), list.setPage(1))} placeholder="Descrição, referência, marca ou código de barras…" />
        <Select value={category} onChange={(e) => (setCategory(e.target.value), list.setPage(1))} placeholder="Todas as categorias" options={data?.categories || []} style={{ maxWidth: 220 }} />
        {lowStock && (
          <Button variant="ghost" onClick={() => setParams({})}>
            Mostrar todos
          </Button>
        )}
      </div>
      <Card bodyClass={null}>
        <DataTable
          rows={data?.data}
          loading={loading}
          sort={list.sort}
          onSort={list.toggleSort}
          onRowClick={(p) => navigate(`/produtos/${p.id}`)}
          columns={[
            { key: 'name', label: 'Produto', sortable: true, render: (p) => (<div><strong>{p.name}</strong><div className="subtle">{[p.sku, p.brand, p.color].filter(Boolean).join(' · ')}</div></div>) },
            { key: 'category', label: 'Categoria', sortable: true },
            { key: 'supplier_name', label: 'Fornecedor', render: (p) => p.supplier_name || '—' },
            { key: 'price', label: 'Preço', sortable: true, className: 'num', render: (p) => money(p.price) },
            {
              key: 'stock',
              label: 'Estoque',
              sortable: true,
              className: 'num',
              render: (p) => (Number(p.track_stock) ? <Badge tone={Number(p.stock) <= Number(p.min_stock) ? (Number(p.stock) <= 0 ? 'danger' : 'warning') : 'success'}>{p.stock}</Badge> : <span className="subtle">—</span>),
            },
          ]}
          mobile={(p) => (
            <>
              <div className="grow">
                <strong className="truncate" style={{ display: 'block' }}>
                  {p.name}
                </strong>
                <span className="subtle">
                  {p.category} · estoque {Number(p.track_stock) ? p.stock : '—'}
                </span>
              </div>
              <strong className="mono">{money(p.price)}</strong>
            </>
          )}
        />
        {data && <Pagination page={data.page} perPage={data.per_page} total={data.total} onChange={list.setPage} />}
      </Card>
      <ProductForm open={creating} categories={data?.categories} onClose={() => setCreating(false)} onSaved={(id) => id && navigate(`/produtos/${id}`)} />
    </div>
  );
}
