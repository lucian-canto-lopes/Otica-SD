import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PackagePlus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { invalidate, useApi } from '../../lib/hooks.js';
import { useSession } from '../../lib/session.jsx';
import { dateTime } from '../../lib/format.js';
import { ProductSearch } from '../../components/business.jsx';
import { Badge, Button, Card, DataTable, Field, Input, PageHeader, Pagination, Select, useListState, useToast } from '../../components/ui.jsx';

const MOVEMENT_LABELS = { in: 'Entrada', out: 'Saída', adjust: 'Ajuste', sale: 'Venda', sale_cancel: 'Estorno de venda' };

export default function Stock() {
  const navigate = useNavigate();
  const { can } = useSession();
  const toast = useToast();
  const [type, setType] = useState('');
  const list = useListState();
  const { data, loading, reload } = useApi('stock', { type, ...list.params });
  const [entryType, setEntryType] = useState('in');
  const [items, setItems] = useState([]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const add = (product) =>
    setItems((list) => (list.some((i) => i.product_id === product.id) ? list : [...list, { product_id: product.id, name: product.name, stock: product.stock, quantity: '1', unit_cost: '' }]));
  const update = (id, field, value) => setItems((list) => list.map((i) => (i.product_id === id ? { ...i, [field]: value } : i)));

  const save = async () => {
    setSaving(true);
    try {
      await api.post('stock', { type: entryType, items, reason });
      toast.success('Estoque atualizado');
      setItems([]);
      setReason('');
      invalidate('products');
      reload();
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack lg">
      <PageHeader title="Movimentações de estoque" subtitle="Entradas de mercadoria, saídas e inventário" />
      {can('sell') && (
        <Card title="Lançar movimentação">
          <div className="stack">
            <div className="row wrap">
              <Select
                value={entryType}
                onChange={(e) => setEntryType(e.target.value)}
                options={[{ value: 'in', label: 'Entrada de mercadoria' }, { value: 'out', label: 'Saída (perda, quebra, uso)' }, { value: 'adjust', label: 'Inventário (definir saldo)' }]}
                style={{ maxWidth: 260 }}
              />
              <div className="grow" style={{ minWidth: 240 }}>
                <ProductSearch onSelect={add} placeholder="Buscar produto para adicionar…" />
              </div>
            </div>
            {items.length > 0 && (
              <div className="table-wrap">
                <table className="table compact">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th className="num">Saldo atual</th>
                      <th style={{ width: 120 }}>{entryType === 'adjust' ? 'Novo saldo' : 'Quantidade'}</th>
                      {entryType === 'in' && <th style={{ width: 130 }}>Custo unit.</th>}
                      <th style={{ width: 40 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.product_id}>
                        <td>{item.name}</td>
                        <td className="num">{item.stock}</td>
                        <td>
                          <Input className="sm" inputMode="numeric" value={item.quantity} onChange={(e) => update(item.product_id, 'quantity', e.target.value)} />
                        </td>
                        {entryType === 'in' && (
                          <td>
                            <Input className="sm" inputMode="decimal" value={item.unit_cost} onChange={(e) => update(item.product_id, 'unit_cost', e.target.value)} />
                          </td>
                        )}
                        <td>
                          <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setItems((l) => l.filter((i) => i.product_id !== item.product_id))} aria-label="Remover" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="row wrap">
              <Field label="Documento / motivo" className="grow">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: NF 4521 Distribuidora Aurora" />
              </Field>
              <Button variant="primary" icon={PackagePlus} disabled={!items.length} loading={saving} onClick={save} style={{ alignSelf: 'flex-end' }}>
                Lançar {items.length ? `(${items.length})` : ''}
              </Button>
            </div>
          </div>
        </Card>
      )}
      <Card
        title="Histórico"
        bodyClass={null}
        actions={<Select className="sm" value={type} onChange={(e) => (setType(e.target.value), list.setPage(1))} placeholder="Todos os tipos" options={Object.entries(MOVEMENT_LABELS).map(([value, label]) => ({ value, label }))} />}
      >
        <DataTable
          rows={data?.data}
          loading={loading}
          onRowClick={(m) => navigate(`/produtos/${m.product_id}`)}
          columns={[
            { key: 'created_at', label: 'Data', render: (m) => dateTime(m.created_at) },
            { key: 'product_name', label: 'Produto' },
            { key: 'type', label: 'Tipo', render: (m) => <Badge tone={Number(m.quantity) >= 0 ? 'success' : 'warning'}>{MOVEMENT_LABELS[m.type]}</Badge> },
            { key: 'quantity', label: 'Qtd', className: 'num', render: (m) => (Number(m.quantity) > 0 ? `+${m.quantity}` : m.quantity) },
            { key: 'balance_after', label: 'Saldo', className: 'num' },
            { key: 'reason', label: 'Motivo' },
            { key: 'user_name', label: 'Usuário', render: (m) => m.user_name || 'Sistema' },
          ]}
          mobile={(m) => (
            <>
              <div className="grow">
                <strong className="truncate" style={{ display: 'block' }}>
                  {m.product_name}
                </strong>
                <span className="subtle">
                  {MOVEMENT_LABELS[m.type]} · {dateTime(m.created_at)}
                </span>
              </div>
              <strong>{Number(m.quantity) > 0 ? `+${m.quantity}` : m.quantity}</strong>
            </>
          )}
        />
        {data && <Pagination page={data.page} perPage={data.per_page} total={data.total} onChange={list.setPage} />}
      </Card>
    </div>
  );
}
