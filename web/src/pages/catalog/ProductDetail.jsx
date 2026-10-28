import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit3, PackageMinus, PackagePlus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { invalidate, useApi } from '../../lib/hooks.js';
import { useSession } from '../../lib/session.jsx';
import { date, dateTime, money, number } from '../../lib/format.js';
import { Badge, Button, Card, DataTable, Empty, Field, Input, Kpi, Loading, Modal, PageHeader, useConfirm, useToast } from '../../components/ui.jsx';
import { ProductForm } from './Products.jsx';

const MOVEMENT_LABELS = { in: 'Entrada', out: 'Saída', adjust: 'Ajuste', sale: 'Venda', sale_cancel: 'Estorno de venda' };

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: product, loading, reload } = useApi('products', { id });
  const [editing, setEditing] = useState(false);
  const [movement, setMovement] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  if (loading && !product) return <Loading />;
  if (!product) return <Empty title="Produto não encontrado" />;

  const saveMovement = async () => {
    setSaving(true);
    try {
      await api.post('stock', { type: movement, product_id: product.id, quantity, unit_cost: unitCost, reason });
      toast.success('Estoque atualizado');
      setMovement(null);
      setQuantity('');
      setUnitCost('');
      setReason('');
      invalidate('products');
      reload();
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };
  const deactivate = async () => {
    if (!(await confirm({ message: `Desativar "${product.name}"? Ele deixa de aparecer nas buscas de venda.`, danger: true, confirmLabel: 'Desativar' }))) return;
    await api.del('products', { id: product.id });
    invalidate('products');
    navigate('/produtos');
  };

  return (
    <div className="stack lg">
      <PageHeader
        back={<Button variant="ghost" icon={ArrowLeft} onClick={() => navigate(-1)} aria-label="Voltar" />}
        title={product.name}
        subtitle={[product.category, product.brand, product.model, product.color, product.sku && `ref. ${product.sku}`].filter(Boolean).join(' · ')}
        actions={
          can('sell') && (
            <>
              <Button icon={PackagePlus} onClick={() => setMovement('in')}>
                Entrada
              </Button>
              <Button icon={PackageMinus} onClick={() => setMovement('out')}>
                Saída
              </Button>
              <Button icon={SlidersHorizontal} onClick={() => setMovement('adjust')}>
                Ajustar saldo
              </Button>
              <Button variant="primary" icon={Edit3} onClick={() => setEditing(true)}>
                Editar
              </Button>
            </>
          )
        }
      />
      {!Number(product.active) && <Badge tone="danger">Produto inativo</Badge>}
      <div className="grid kpis">
        <Kpi label="Estoque atual" value={Number(product.track_stock) ? number(product.stock) : 'Não controlado'} hint={`mínimo ${product.min_stock}`} tone={Number(product.stock) <= Number(product.min_stock) ? 'warning' : undefined} />
        <Kpi label="Preço de venda" value={money(product.price)} hint={`custo ${money(product.cost)}`} />
        <Kpi label="Vendidos (total)" value={number(product.sales_stats.quantity)} hint={product.sales_stats.last_sale ? `última venda ${date(product.sales_stats.last_sale)}` : 'nunca vendido'} />
        <Kpi label="Faturamento" value={money(product.sales_stats.total)} />
      </div>
      <Card title="Histórico de movimentações" bodyClass={null}>
        <DataTable
          rows={product.movements}
          columns={[
            { key: 'created_at', label: 'Data', render: (m) => dateTime(m.created_at) },
            { key: 'type', label: 'Tipo', render: (m) => <Badge tone={Number(m.quantity) >= 0 ? 'success' : 'warning'}>{MOVEMENT_LABELS[m.type]}</Badge> },
            { key: 'quantity', label: 'Qtd', className: 'num', render: (m) => (Number(m.quantity) > 0 ? `+${m.quantity}` : m.quantity) },
            { key: 'balance_after', label: 'Saldo', className: 'num' },
            { key: 'reason', label: 'Motivo', render: (m) => (m.ref_type === 'sale' ? <a onClick={(e) => (e.stopPropagation(), navigate(`/vendas/${m.ref_id}`))} href="#">{m.reason}</a> : m.reason) },
            { key: 'user_name', label: 'Usuário', render: (m) => m.user_name || 'Sistema' },
          ]}
          empty={<Empty title="Sem movimentações" />}
        />
      </Card>
      {product.supplier_name && <span className="muted">Fornecedor: {product.supplier_name}</span>}
      {can('sell') && Number(product.active) === 1 && (
        <div>
          <Button variant="ghost" className="danger" icon={Trash2} onClick={deactivate}>
            Desativar produto
          </Button>
        </div>
      )}
      <ProductForm open={editing} product={product} onClose={() => setEditing(false)} onSaved={reload} />
      <Modal
        open={Boolean(movement)}
        onClose={() => setMovement(null)}
        title={{ in: 'Entrada de estoque', out: 'Saída de estoque', adjust: 'Ajustar saldo (inventário)' }[movement] || ''}
        footer={<><Button onClick={() => setMovement(null)}>Cancelar</Button><Button variant="primary" loading={saving} onClick={saveMovement}>Confirmar</Button></>}
      >
        <div className="form-grid">
          <Field label={movement === 'adjust' ? 'Novo saldo' : 'Quantidade'} className="c6">
            <Input inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus />
          </Field>
          {movement === 'in' && (
            <Field label="Custo unitário (opcional)" className="c6" hint="Atualiza o custo do produto">
              <Input inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
            </Field>
          )}
          <Field label="Motivo / documento">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: NF 1234, quebra, devolução…" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
