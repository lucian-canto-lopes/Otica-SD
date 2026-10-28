import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Save } from 'lucide-react';
import { api } from '../../lib/api.js';
import { invalidate } from '../../lib/hooks.js';
import { date, money, parseMoneyInput } from '../../lib/format.js';
import { ClientPicker, emptyItem, itemTotal, ItemsEditor, prescriptionSummary } from '../../components/business.jsx';
import { Button, Card, Field, Input, Loading, PageHeader, Select, Textarea, useToast } from '../../components/ui.jsx';
import ClientForm from '../clients/ClientForm.jsx';
import { PrescriptionModal } from '../clients/ClientDetail.jsx';
import { usePrescriptions } from './SaleEditor.jsx';

const toInputMoney = (value) => (Number(value) ? String(Number(value).toFixed(2)).replace('.', ',') : '');

export default function QuoteEditor() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [loaded, setLoaded] = useState(!id && !search.get('client'));
  const [client, setClient] = useState(null);
  const [contact, setContact] = useState({ name: '', phone: '' });
  const [items, setItems] = useState([emptyItem()]);
  const [discount, setDiscount] = useState('');
  const [form, setForm] = useState({ quote_date: '', valid_until: '', notes: '', prescription_id: '' });
  const [clientModal, setClientModal] = useState(null);
  const [prescriptionModal, setPrescriptionModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prescriptions, reloadPrescriptions] = usePrescriptions(client?.id);

  useEffect(() => {
    (async () => {
      try {
        if (id) {
          const quote = await api.get('quotes', { id });
          if (quote.client_id) setClient({ id: quote.client_id, name: quote.client_name, whatsapp: quote.client_whatsapp });
          setContact({ name: quote.contact_name || '', phone: quote.contact_phone || '' });
          setItems(quote.items.map((i) => ({ ...emptyItem(), product_id: i.product_id, description: i.description, quantity: String(Number(i.quantity)).replace('.', ','), unit_price: toInputMoney(i.unit_price), discount: toInputMoney(i.discount) })));
          setDiscount(toInputMoney(quote.discount));
          setForm({ quote_date: quote.quote_date, valid_until: quote.valid_until || '', notes: quote.notes || '', prescription_id: quote.prescription_id || '' });
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
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const save = async () => {
    const validItems = items.filter((i) => i.description.trim());
    if (!validItems.length) return toast.error('Adicione ao menos um item.');
    setSaving(true);
    try {
      const payload = {
        ...form,
        client_id: client?.id || null,
        contact_name: client ? '' : contact.name,
        contact_phone: client ? '' : contact.phone,
        discount: discountValue,
        items: validItems.map((i) => ({ product_id: i.product_id, description: i.description, quantity: parseMoneyInput(i.quantity), unit_price: parseMoneyInput(i.unit_price), discount: parseMoneyInput(i.discount) })),
      };
      const result = id ? await api.patch('quotes', payload, { id }) : await api.post('quotes', payload);
      invalidate('quotes');
      toast.success(id ? 'Orçamento atualizado' : `Orçamento nº ${result.number} criado`);
      navigate(`/orcamentos/${result.id}`, { replace: true });
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <Loading />;
  return (
    <div className="stack lg">
      <PageHeader back={<Button variant="ghost" icon={ArrowLeft} onClick={() => navigate(-1)} aria-label="Voltar" />} title={id ? 'Editar orçamento' : 'Novo orçamento'} />
      <div className="grid cols-3">
        <div className="span-2 stack">
          <Card title="Cliente">
            <div className="stack">
              <ClientPicker value={client} onChange={setClient} onCreate={(name) => setClientModal(name)} autoFocus={!id} />
              {client ? (
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
              ) : (
                <div className="form-grid">
                  <span className="subtle span-full">Ou registre só o contato de quem ainda não é cliente:</span>
                  <Field label="Nome do contato" className="c7">
                    <Input value={contact.name} onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))} />
                  </Field>
                  <Field label="WhatsApp" className="c5">
                    <Input value={contact.phone} inputMode="tel" onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))} />
                  </Field>
                </div>
              )}
            </div>
          </Card>
          <Card title="Itens">
            <ItemsEditor items={items} onChange={setItems} />
          </Card>
        </div>
        <div className="stack">
          <Card title="Resumo">
            <div className="stack sm">
              <div className="row between">
                <span className="muted">Subtotal</span>
                <span className="mono">{money(subtotal)}</span>
              </div>
              <div className="row between">
                <span className="muted">Desconto</span>
                <Input className="sm" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} style={{ width: 120 }} />
              </div>
              <div className="divider" />
              <div className="row between">
                <strong>Total</strong>
                <strong className="mono" style={{ fontSize: 22, color: 'var(--brand)' }}>
                  {money(subtotal - discountValue)}
                </strong>
              </div>
            </div>
          </Card>
          <Card title="Detalhes">
            <div className="stack">
              <Field label="Data">
                <Input type="date" value={form.quote_date} onChange={set('quote_date')} />
              </Field>
              <Field label="Válido até" hint="Vazio = usa a validade padrão da ótica">
                <Input type="date" value={form.valid_until} onChange={set('valid_until')} />
              </Field>
              <Field label="Observações">
                <Textarea value={form.notes} onChange={set('notes')} rows={4} />
              </Field>
              <Button variant="primary" icon={Save} loading={saving} onClick={save} className="block">
                Salvar orçamento
              </Button>
            </div>
          </Card>
        </div>
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
