import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, Plus, Save, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { invalidate, useApi } from '../../lib/hooks.js';
import { useSession } from '../../lib/session.jsx';
import { date, money, parseMoneyInput, today } from '../../lib/format.js';
import { PAYMENT_METHODS } from '../../lib/constants.js';
import { ClientPicker, emptyItem, itemTotal, ItemsEditor, prescriptionSummary } from '../../components/business.jsx';
import { Button, Card, Checkbox, Field, Input, Loading, PageHeader, Select, Textarea, useToast } from '../../components/ui.jsx';
import ClientForm from '../clients/ClientForm.jsx';
import { PrescriptionModal } from '../clients/ClientDetail.jsx';

const toInputMoney = (value) => (value === null || value === undefined || value === '' ? '' : String(Number(value).toFixed(2)).replace('.', ','));
const addMonths = (iso, months) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
};

export function usePrescriptions(clientId) {
  const { data, reload } = useApi(clientId ? 'prescriptions' : null, { client_id: clientId }, { enabled: Boolean(clientId) });
  return [data || [], reload];
}

export default function SaleEditor() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useSession();
  const team = useApi('team').data || [];
  const labs = useApi('partners', { type: 'laboratory', per_page: 200 }).data?.data || [];
  const [loaded, setLoaded] = useState(!id && !search.get('quote') && !search.get('client'));
  const [client, setClient] = useState(null);
  const [items, setItems] = useState([emptyItem()]);
  const [discount, setDiscount] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [payments, setPayments] = useState([]);
  const [form, setForm] = useState({ sale_date: today(), delivery_date: '', seller_id: user?.id || '', notes: '', payment_terms: '', prescription_id: '', number: '', quote_id: '' });
  const [createOrder, setCreateOrder] = useState(false);
  const [order, setOrder] = useState({ laboratory_id: '', lens_description: '', frame_description: '', frame_from_client: false, notes: '' });
  const [clientModal, setClientModal] = useState(null);
  const [prescriptionModal, setPrescriptionModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prescriptions, reloadPrescriptions] = usePrescriptions(client?.id);

  // Carrega a venda (edição), o orçamento (conversão) ou o cliente informado na URL.
  useEffect(() => {
    (async () => {
      try {
        if (id) {
          const sale = await api.get('sales', { id });
          if (sale.client_id) setClient({ id: sale.client_id, name: sale.client_name, whatsapp: sale.client_whatsapp });
          setItems(sale.items.map((i) => ({ ...emptyItem(), product_id: i.product_id, description: i.description, quantity: String(Number(i.quantity)).replace('.', ','), unit_price: toInputMoney(i.unit_price), discount: Number(i.discount) ? toInputMoney(i.discount) : '' })));
          setDiscount(Number(sale.discount) ? toInputMoney(sale.discount) : '');
          setPayments(sale.payments.map((p) => ({ ...p, key: p.id, amount: toInputMoney(p.amount), paid: Boolean(p.paid_at) })));
          setForm({ sale_date: sale.sale_date, delivery_date: sale.delivery_date || '', seller_id: sale.seller_id || '', notes: sale.notes || '', payment_terms: sale.payment_terms || '', prescription_id: sale.prescription_id || '', number: '', quote_id: sale.quote_id || '' });
        } else if (search.get('quote')) {
          const quote = await api.get('quotes', { id: search.get('quote') });
          if (quote.client_id) setClient({ id: quote.client_id, name: quote.client_name, whatsapp: quote.client_whatsapp });
          setItems(quote.items.map((i) => ({ ...emptyItem(), product_id: i.product_id, description: i.description, quantity: String(Number(i.quantity)).replace('.', ','), unit_price: toInputMoney(i.unit_price), discount: Number(i.discount) ? toInputMoney(i.discount) : '' })));
          setDiscount(Number(quote.discount) ? toInputMoney(quote.discount) : '');
          setForm((f) => ({ ...f, quote_id: quote.id, prescription_id: quote.prescription_id || '', notes: quote.notes || '' }));
        } else if (search.get('client')) {
          const c = await api.get('clients', { id: search.get('client') });
          setClient({ id: c.id, name: c.name, whatsapp: c.whatsapp });
          if (c.prescriptions[0]) setForm((f) => ({ ...f, prescription_id: c.prescriptions[0].id }));
        }
      } catch (error) {
        toast.error(error);
      } finally {
        setLoaded(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + itemTotal(item), 0), [items]);
  const discountValue = Math.min(subtotal, parseMoneyInput(discount));
  const total = Math.max(0, subtotal - discountValue);
  const paymentsTotal = payments.reduce((sum, p) => sum + parseMoneyInput(p.amount), 0);
  const paidNow = payments.reduce((sum, p) => sum + (p.paid ? parseMoneyInput(p.amount) : 0), 0);
  const remaining = Math.round((total - paymentsTotal) * 100) / 100;

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const updatePayment = (key, field, value) => setPayments((list) => list.map((p) => (p.key === key ? { ...p, [field]: value } : p)));
  const addPayment = (amount = remaining, method = 'pix', paid = true) =>
    setPayments((list) => [...list, { key: Math.random(), method, amount: toInputMoney(Math.max(0, amount)), installment: list.length + 1, due_date: form.sale_date, paid }]);
  const splitRemaining = (count) => {
    if (remaining <= 0) return;
    const base = Math.floor((remaining / count) * 100) / 100;
    const last = Math.round((remaining - base * (count - 1)) * 100) / 100;
    setPayments((list) => [
      ...list,
      ...Array.from({ length: count }, (_, i) => ({
        key: Math.random(),
        method: 'crediario',
        amount: toInputMoney(i === count - 1 ? last : base),
        installment: list.length + i + 1,
        due_date: addMonths(form.sale_date, i + 1),
        paid: false,
      })),
    ]);
  };

  const save = async () => {
    const validItems = items.filter((i) => i.description.trim());
    if (!validItems.length) return toast.error('Adicione ao menos um item.');
    if (remaining < -0.009) return toast.error('A soma dos pagamentos supera o total da venda.');
    setSaving(true);
    try {
      const payload = {
        ...form,
        client_id: client?.id || null,
        items: validItems.map((i) => ({ product_id: i.product_id, description: i.description, quantity: parseMoneyInput(i.quantity), unit_price: parseMoneyInput(i.unit_price), discount: parseMoneyInput(i.discount) })),
        discount: discountValue,
        payments: payments.map((p, index) => ({ method: p.method, amount: parseMoneyInput(p.amount), installment: index + 1, due_date: p.due_date || null, paid_at: p.paid ? p.paid_at || form.sale_date : null })),
        create_service_order: !id && createOrder,
        service_order: { ...order, promised_date: form.delivery_date },
      };
      const result = id ? await api.patch('sales', payload, { id }) : await api.post('sales', payload);
      invalidate('sales');
      invalidate('dashboard');
      toast.success(id ? 'Venda atualizada' : `Venda nº ${result.number} registrada`);
      navigate(`/vendas/${result.id}`, { replace: true });
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <Loading />;
  const selectedPrescription = prescriptions.find((p) => String(p.id) === String(form.prescription_id));

  return (
    <div className="stack lg" style={{ paddingBottom: 70 }}>
      <PageHeader
        back={<Button variant="ghost" icon={ArrowLeft} onClick={() => navigate(-1)} aria-label="Voltar" />}
        title={id ? 'Editar venda' : 'Nova venda'}
        subtitle={form.quote_id ? 'A partir de orçamento' : 'Pedido de venda (não fiscal)'}
      />
      <div className="grid cols-3">
        <div className="span-2 stack">
          <Card title="Cliente">
            <div className="stack">
              <ClientPicker value={client} onChange={(c) => (setClient(c), setForm((f) => ({ ...f, prescription_id: '' })))} onCreate={(name) => setClientModal(name)} autoFocus={!id} />
              {client && (
                <div className="row wrap">
                  <Select
                    value={form.prescription_id}
                    onChange={set('prescription_id')}
                    placeholder="Sem receita vinculada"
                    options={prescriptions.map((p) => ({ value: p.id, label: `${date(p.prescribed_at) || 'Receita'} — ${prescriptionSummary(p)}` }))}
                    style={{ maxWidth: 460 }}
                  />
                  <Button icon={Plus} onClick={() => setPrescriptionModal(true)}>
                    Nova receita
                  </Button>
                </div>
              )}
              {!client && <span className="subtle">Sem cliente, a venda fica como "Consumidor" e não entra no relacionamento.</span>}
            </div>
          </Card>
          <Card title="Itens">
            <ItemsEditor items={items} onChange={setItems} />
          </Card>
          <Card title="Pagamento">
            <div className="stack">
              {payments.map((p, index) => (
                <div key={p.key} className="row wrap" style={{ alignItems: 'flex-end' }}>
                  <span className="subtle" style={{ width: 22 }}>
                    {index + 1}ª
                  </span>
                  <Field label={index === 0 ? 'Forma' : undefined} className="grow" >
                    <Select value={p.method} onChange={(e) => updatePayment(p.key, 'method', e.target.value)} options={Object.entries(PAYMENT_METHODS).map(([value, label]) => ({ value, label }))} />
                  </Field>
                  <Field label={index === 0 ? 'Valor' : undefined} style={{ width: 120 }}>
                    <Input inputMode="decimal" value={p.amount} onChange={(e) => updatePayment(p.key, 'amount', e.target.value)} style={{ width: 120 }} />
                  </Field>
                  <Field label={index === 0 ? 'Vencimento' : undefined}>
                    <Input type="date" value={p.due_date || ''} onChange={(e) => updatePayment(p.key, 'due_date', e.target.value)} />
                  </Field>
                  <Checkbox label="Pago" checked={Boolean(p.paid)} onChange={(e) => updatePayment(p.key, 'paid', e.target.checked)} />
                  <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setPayments((list) => list.filter((x) => x.key !== p.key))} aria-label="Remover pagamento" />
                </div>
              ))}
              <div className="row wrap">
                <Button icon={Plus} onClick={() => addPayment()} disabled={remaining <= 0}>
                  {payments.length ? 'Adicionar pagamento' : 'Pagamento à vista / entrada'}
                </Button>
                {remaining > 0 && (
                  <>
                    <span className="subtle">Parcelar restante ({money(remaining)}) em:</span>
                    {[2, 3, 4, 5, 6, 10].map((n) => (
                      <Button key={n} size="sm" icon={CalendarPlus} onClick={() => splitRemaining(n)}>
                        {n}x
                      </Button>
                    ))}
                  </>
                )}
              </div>
              <Field label="Condições (texto livre no pedido)">
                <Input value={form.payment_terms} onChange={set('payment_terms')} placeholder="Ex.: entrada + 3x no cartão" />
              </Field>
            </div>
          </Card>
          {!id && (
            <Card title={<Checkbox label="Gerar ordem de serviço para o laboratório" checked={createOrder} onChange={(e) => setCreateOrder(e.target.checked)} />}>
              {createOrder ? (
                <div className="form-grid">
                  <Field label="Laboratório" className="c6">
                    <Select value={order.laboratory_id} onChange={(e) => setOrder((o) => ({ ...o, laboratory_id: e.target.value }))} placeholder="—" options={labs.map((l) => ({ value: l.id, label: l.name }))} />
                  </Field>
                  <div className="c6" style={{ alignSelf: 'end' }}>
                    <Checkbox label="Armação trazida pelo cliente" checked={order.frame_from_client} onChange={(e) => setOrder((o) => ({ ...o, frame_from_client: e.target.checked }))} />
                  </div>
                  <Field label="Lentes" className="c6">
                    <Input value={order.lens_description} placeholder={items.find((i) => /lente/i.test(i.description))?.description || ''} onChange={(e) => setOrder((o) => ({ ...o, lens_description: e.target.value }))} />
                  </Field>
                  <Field label="Armação" className="c6">
                    <Input value={order.frame_description} placeholder={items.find((i) => /arma/i.test(i.description))?.description || ''} onChange={(e) => setOrder((o) => ({ ...o, frame_description: e.target.value }))} />
                  </Field>
                  <span className="subtle span-full">Os graus vêm da receita selecionada. A OS poderá ser completada (medidas, observações) depois.</span>
                </div>
              ) : (
                <span className="subtle">Marque para abrir a OS junto com a venda.</span>
              )}
            </Card>
          )}
        </div>
        <div className="stack">
          <Card title="Resumo">
            <div className="stack sm">
              <div className="row between">
                <span className="muted">Subtotal</span>
                <strong className="mono">{money(subtotal)}</strong>
              </div>
              <div className="row between">
                <span className="muted">Desconto</span>
                <div className="row" style={{ width: 190 }}>
                  <Input
                    className="sm"
                    placeholder="%"
                    inputMode="decimal"
                    value={discountPercent}
                    onChange={(e) => {
                      setDiscountPercent(e.target.value);
                      const pct = parseMoneyInput(e.target.value);
                      setDiscount(pct ? toInputMoney((subtotal * pct) / 100) : '');
                    }}
                    style={{ width: 60 }}
                  />
                  <Input className="sm" placeholder="R$" inputMode="decimal" value={discount} onChange={(e) => (setDiscount(e.target.value), setDiscountPercent(''))} />
                </div>
              </div>
              <div className="divider" />
              <div className="row between">
                <strong>Total</strong>
                <strong className="mono" style={{ fontSize: 22, color: 'var(--brand)' }}>
                  {money(total)}
                </strong>
              </div>
              <div className="row between">
                <span className="muted">Pago agora</span>
                <span className="mono">{money(paidNow)}</span>
              </div>
              <div className="row between">
                <span className="muted">{remaining >= 0 ? 'Falta lançar' : 'Excedente'}</span>
                <span className="mono" style={{ color: Math.abs(remaining) > 0.009 ? 'var(--danger)' : undefined }}>
                  {money(remaining)}
                </span>
              </div>
            </div>
          </Card>
          <Card title="Detalhes">
            <div className="stack">
              <Field label="Data da venda">
                <Input type="date" value={form.sale_date} onChange={set('sale_date')} />
              </Field>
              <Field label="Previsão de entrega">
                <Input type="date" value={form.delivery_date} onChange={set('delivery_date')} />
              </Field>
              <Field label="Vendedor(a)">
                <Select value={form.seller_id} onChange={set('seller_id')} placeholder="—" options={team.filter((t) => Number(t.active)).map((t) => ({ value: t.id, label: t.name }))} />
              </Field>
              {!id && (
                <Field label="Número do pedido" hint="Deixe vazio para usar a numeração automática">
                  <Input inputMode="numeric" value={form.number} onChange={set('number')} />
                </Field>
              )}
              <Field label="Observações (saem no pedido)">
                <Textarea value={form.notes} onChange={set('notes')} rows={3} />
              </Field>
              {selectedPrescription && <span className="subtle">Receita: {prescriptionSummary(selectedPrescription)}</span>}
            </div>
          </Card>
        </div>
      </div>
      <div className="sticky-footer card" style={{ position: 'fixed', left: 'auto', right: 16, bottom: 16, borderRadius: 12 }}>
        <span className="muted hidden-mobile">Total {money(total)}</span>
        <Button onClick={() => navigate(-1)}>Cancelar</Button>
        <Button variant="primary" icon={Save} loading={saving} onClick={save}>
          {id ? 'Salvar alterações' : 'Finalizar venda'}
        </Button>
      </div>
      <ClientForm open={clientModal !== null} initialName={clientModal || ''} onClose={() => setClientModal(null)} onSaved={(c) => setClient(c)} />
      <PrescriptionModal
        open={prescriptionModal}
        clientId={client?.id}
        onClose={() => setPrescriptionModal(false)}
        onSaved={async () => {
          reloadPrescriptions();
          const list = await api.get('prescriptions', { client_id: client.id });
          if (list[0]) setForm((f) => ({ ...f, prescription_id: list[0].id }));
        }}
      />
    </div>
  );
}
