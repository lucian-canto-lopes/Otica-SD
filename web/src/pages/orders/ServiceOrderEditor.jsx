import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { api } from '../../lib/api.js';
import { invalidate, useApi } from '../../lib/hooks.js';
import { date } from '../../lib/format.js';
import { ClientPicker, PrescriptionFields, prescriptionSummary } from '../../components/business.jsx';
import { Button, Card, Checkbox, Field, Input, Loading, PageHeader, Select, Textarea, useToast } from '../../components/ui.jsx';
import { usePrescriptions } from '../sales/SaleEditor.jsx';

const EMPTY = {
  laboratory_id: '', prescription_id: '', sale_id: '', lens_description: '', frame_description: '', frame_type: '', frame_from_client: false,
  bridge: '', horizontal: '', vertical: '', diagonal: '', promised_date: '', lab_cost: '', notes: '', number: '',
};

export default function ServiceOrderEditor() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const labs = useApi('partners', { type: 'laboratory', per_page: 200 }).data?.data || [];
  const [client, setClient] = useState(null);
  const [values, setValues] = useState(EMPTY);
  const [sale, setSale] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prescriptions] = usePrescriptions(client?.id);

  useEffect(() => {
    (async () => {
      try {
        if (id) {
          const order = await api.get('service_orders', { id });
          if (order.client_id) setClient({ id: order.client_id, name: order.client_name, whatsapp: order.client_whatsapp });
          setValues({ ...EMPTY, ...Object.fromEntries(Object.entries(order).filter(([k]) => k in EMPTY).map(([k, v]) => [k, v ?? ''])), frame_from_client: Boolean(Number(order.frame_from_client)) });
          if (order.sale_id) setSale({ id: order.sale_id, number: order.sale_number });
        } else if (search.get('sale')) {
          const s = await api.get('sales', { id: search.get('sale') });
          setSale(s);
          if (s.client_id) setClient({ id: s.client_id, name: s.client_name, whatsapp: s.client_whatsapp });
          const lens = s.items.find((i) => /lente/i.test(i.description));
          const frame = s.items.find((i) => /arma/i.test(i.description));
          setValues((v) => ({
            ...v,
            sale_id: s.id,
            promised_date: s.delivery_date || '',
            lens_description: lens?.description || '',
            frame_description: frame?.description || '',
            ...(s.prescription ? pickGrades(s.prescription) : {}),
            prescription_id: s.prescription_id || '',
          }));
        } else if (search.get('client')) {
          const c = await api.get('clients', { id: search.get('client') });
          setClient({ id: c.id, name: c.name, whatsapp: c.whatsapp });
          if (c.prescriptions[0]) setValues((v) => ({ ...v, prescription_id: c.prescriptions[0].id, ...pickGrades(c.prescriptions[0]) }));
        }
      } catch (error) {
        toast.error(error);
      } finally {
        setLoaded(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const set = (field, value) => setValues((v) => ({ ...v, [field]: value }));
  const bind = (field) => ({ value: values[field] ?? '', onChange: (e) => set(field, e.target.value) });
  const applyPrescription = (prescriptionId) => {
    const p = prescriptions.find((x) => String(x.id) === String(prescriptionId));
    setValues((v) => ({ ...v, prescription_id: prescriptionId, ...(p ? pickGrades(p) : {}) }));
  };

  const save = async () => {
    if (!client) return toast.error('Selecione o cliente.');
    setSaving(true);
    try {
      const payload = { ...values, client_id: client.id };
      const result = id ? await api.patch('service_orders', payload, { id }) : await api.post('service_orders', payload);
      invalidate('service_orders');
      toast.success(id ? 'OS atualizada' : `OS nº ${result.number} aberta`);
      navigate(`/os/${result.id}`, { replace: true });
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <Loading />;
  return (
    <div className="stack lg">
      <PageHeader
        back={<Button variant="ghost" icon={ArrowLeft} onClick={() => navigate(-1)} aria-label="Voltar" />}
        title={id ? 'Editar ordem de serviço' : 'Nova ordem de serviço'}
        subtitle={sale ? `Vinculada à venda nº ${sale.number}` : 'OS avulsa (sem venda) — ex.: conserto, montagem com armação do cliente'}
      />
      <div className="grid cols-3">
        <div className="span-2 stack">
          <Card title="Cliente e receita">
            <div className="stack">
              <ClientPicker value={client} onChange={setClient} />
              {client && prescriptions.length > 0 && (
                <Field label="Copiar graus da receita">
                  <Select
                    value={values.prescription_id}
                    onChange={(e) => applyPrescription(e.target.value)}
                    placeholder="—"
                    options={prescriptions.map((p) => ({ value: p.id, label: `${date(p.prescribed_at) || 'Receita'} — ${prescriptionSummary(p)}` }))}
                  />
                </Field>
              )}
              <PrescriptionFields values={values} onChange={set} />
            </div>
          </Card>
          <Card title="Lentes e armação">
            <div className="form-grid">
              <Field label="Lentes" className="span-full">
                <Input {...bind('lens_description')} placeholder="Ex.: Varilux Comfort 1.67 antirreflexo" />
              </Field>
              <Field label="Armação" className="c8">
                <Input {...bind('frame_description')} />
              </Field>
              <Field label="Tipo de armação" className="c4">
                <Select {...bind('frame_type')} placeholder="—" options={['Aro fechado', 'Fio de nylon', 'Parafusada', 'Meio aro', 'Infantil', 'Esportiva']} />
              </Field>
              <div className="span-full">
                <Checkbox label="Armação trazida pelo cliente" checked={values.frame_from_client} onChange={(e) => set('frame_from_client', e.target.checked)} />
              </div>
              <Field label="Ponte" className="c3">
                <Input {...bind('bridge')} />
              </Field>
              <Field label="Horizontal" className="c3">
                <Input {...bind('horizontal')} />
              </Field>
              <Field label="Vertical" className="c3">
                <Input {...bind('vertical')} />
              </Field>
              <Field label="Diagonal maior" className="c3">
                <Input {...bind('diagonal')} />
              </Field>
            </div>
          </Card>
        </div>
        <Card title="Laboratório e prazo">
          <div className="stack">
            <Field label="Laboratório">
              <Select {...bind('laboratory_id')} placeholder="—" options={labs.map((l) => ({ value: l.id, label: l.name }))} />
            </Field>
            <Field label="Previsão de entrega">
              <Input type="date" {...bind('promised_date')} />
            </Field>
            <Field label="Custo do laboratório">
              <Input inputMode="decimal" {...bind('lab_cost')} />
            </Field>
            {!id && (
              <Field label="Número da OS" hint="Vazio = numeração automática">
                <Input inputMode="numeric" {...bind('number')} />
              </Field>
            )}
            <Field label="Observações para o laboratório">
              <Textarea rows={4} {...bind('notes')} />
            </Field>
            <Button variant="primary" icon={Save} loading={saving} onClick={save} className="block">
              {id ? 'Salvar alterações' : 'Abrir OS'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function pickGrades(p) {
  const fields = {};
  for (const eye of ['od', 'oe']) for (const f of ['sph', 'cyl', 'axis', 'dnp', 'height']) fields[`${eye}_${f}`] = p[`${eye}_${f}`] || '';
  fields.addition = p.addition || '';
  return fields;
}
