import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { date, money, monthStart, phone, today } from '../../lib/format.js';
import { useSession } from '../../lib/session.jsx';
import { Badge, Button, Card, Checkbox, DataTable, Field, Input, Modal, PageHeader, Pagination, Select, Tabs, Textarea, useConfirm, useListState, useToast } from '../../components/ui.jsx';
import { ClientPicker } from '../../components/business.jsx';
import { HBars } from '../../components/charts.jsx';

export default function Lost() {
  const navigate = useNavigate();
  const { can } = useSession();
  const confirm = useConfirm();
  const [filters, setFilters] = useState({ from: monthStart(-2), to: today(), reason_id: '', kind: '' });
  const [creating, setCreating] = useState(false);
  const list = useListState();
  const reasons = useApi('loss_reasons');
  const { data, loading, reload } = useApi('lost', { ...filters, ...list.params });
  const set = (key, value) => (list.setPage(1), setFilters((f) => ({ ...f, [key]: value })));

  const columns = [
    { key: 'occurred_at', label: 'Data', render: (r) => date(r.occurred_at) },
    { key: 'name', label: 'Pessoa', render: (r) => <><strong>{r.name}</strong>{!r.client_id && <> <Badge>não cliente</Badge></>}<div className="subtle">{phone(r.contact_phone)}</div></> },
    { key: 'reason', label: 'Motivo', render: (r) => r.reason || <span className="subtle">Não informado</span> },
    { key: 'estimated_value', label: 'Valor estimado', className: 'num', render: (r) => (Number(r.estimated_value) ? money(r.estimated_value) : '—') },
    { key: 'user_name', label: 'Atendente', render: (r) => <span className="subtle">{r.user_name || '—'}{r.quote_number ? ` · orç. ${r.quote_number}` : ''}</span> },
    {
      key: 'actions',
      label: '',
      render: (r) =>
        can('sell') && (
          <Button
            size="sm"
            variant="ghost"
            icon={Trash2}
            aria-label="Excluir"
            onClick={async (e) => {
              e.stopPropagation();
              if (await confirm({ message: 'Excluir este registro?', danger: true, confirmLabel: 'Excluir' })) {
                await api.del('lost', { id: r.id });
                reload();
              }
            }}
          />
        ),
    },
  ];

  const totalValue = (data?.by_reason || []).reduce((sum, r) => sum + Number(r.value), 0);
  return (
    <>
      <PageHeader
        title="Não compras e desistências"
        subtitle="Registre por que clientes e visitantes não compraram para orientar preços, estoque e campanhas."
        actions={can('sell') && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Registrar não compra</Button>}
      />
      <div className="filters" style={{ marginBottom: 14 }}>
        <Input type="date" style={{ width: 160 }} value={filters.from} onChange={(e) => set('from', e.target.value)} />
        <Input type="date" style={{ width: 160 }} value={filters.to} onChange={(e) => set('to', e.target.value)} />
        <Select style={{ width: 220 }} placeholder="Todos os motivos" value={filters.reason_id} onChange={(e) => set('reason_id', e.target.value)} options={(reasons.data || []).map((r) => ({ value: r.id, label: r.name }))} />
        <Tabs active={filters.kind} onChange={(k) => set('kind', k)} tabs={[{ key: '', label: 'Todos' }, { key: 'client', label: 'Clientes' }, { key: 'non_client', label: 'Não clientes' }]} />
      </div>
      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <Card title="Motivos mais frequentes" className="span-2">
          <HBars data={data?.by_reason || []} format={(v) => `${v}`} />
        </Card>
        <Card title="Resumo do período">
          <div className="stack">
            <div><div className="kpi-label">Registros</div><div className="kpi-value">{data?.total ?? '—'}</div></div>
            <div><div className="kpi-label">Valor estimado perdido</div><div className="kpi-value">{money(totalValue)}</div></div>
          </div>
        </Card>
      </div>
      <Card bodyClass={null}>
        <DataTable
          columns={columns}
          rows={data?.data}
          loading={loading}
          onRowClick={(r) => r.client_id && navigate(`/clientes/${r.client_id}`)}
          mobile={(r) => (
            <div className="grow">
              <div className="row between"><strong className="truncate">{r.name}</strong><span className="subtle">{date(r.occurred_at)}</span></div>
              <div className="subtle">{r.reason || 'Motivo não informado'}{Number(r.estimated_value) ? ` · ${money(r.estimated_value)}` : ''}</div>
            </div>
          )}
        />
        <Pagination page={list.page} perPage={25} total={data?.total} onChange={list.setPage} />
      </Card>
      <LostForm open={creating} reasons={reasons.data || []} onClose={() => setCreating(false)} onSaved={reload} />
    </>
  );
}

function LostForm({ open, reasons, onClose, onSaved }) {
  const toast = useToast();
  const blank = { mode: 'client', contact_name: '', contact_phone: '', reason_id: '', estimated_value: '', notes: '', occurred_at: today(), create_lead: true, message_consent: false };
  const [form, setForm] = useState(blank);
  const [client, setClient] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const save = async () => {
    setSaving(true);
    try {
      const body = { ...form, client_id: form.mode === 'client' ? client?.id : undefined };
      if (form.mode === 'client') {
        delete body.contact_name;
        delete body.contact_phone;
      }
      await api.post('lost', body);
      toast.success('Registro salvo');
      setForm(blank);
      setClient(null);
      onClose();
      onSaved();
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };
  const valid = form.mode === 'client' ? Boolean(client) : form.contact_name.trim() !== '';
  return (
    <Modal open={open} title="Registrar não compra" onClose={onClose} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={!valid} loading={saving} onClick={save}>Salvar</Button></>}>
      <div className="stack">
        <Tabs active={form.mode} onChange={(m) => set('mode', m)} tabs={[{ key: 'client', label: 'Cliente cadastrado' }, { key: 'visitor', label: 'Não é cliente' }]} />
        {form.mode === 'client' ? (
          <Field label="Cliente"><ClientPicker value={client} onChange={setClient} /></Field>
        ) : (
          <>
            <div className="grid cols-2">
              <Field label="Nome"><Input value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} /></Field>
              <Field label="Telefone / WhatsApp"><Input inputMode="tel" value={form.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} /></Field>
            </div>
            <Checkbox label="Cadastrar como contato (lead) para campanhas futuras" checked={form.create_lead} onChange={(e) => set('create_lead', e.target.checked)} />
            {form.create_lead && <Checkbox label="A pessoa autorizou receber mensagens" checked={form.message_consent} onChange={(e) => set('message_consent', e.target.checked)} />}
          </>
        )}
        <div className="grid cols-2">
          <Field label="Motivo"><Select placeholder="Selecione…" value={form.reason_id} onChange={(e) => set('reason_id', e.target.value)} options={reasons.filter((r) => Number(r.active)).map((r) => ({ value: r.id, label: r.name }))} /></Field>
          <Field label="Valor estimado"><Input inputMode="decimal" placeholder="0,00" value={form.estimated_value} onChange={(e) => set('estimated_value', e.target.value)} /></Field>
        </div>
        <Field label="Data"><Input type="date" value={form.occurred_at} onChange={(e) => set('occurred_at', e.target.value)} /></Field>
        <Field label="Observações"><Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="O que a pessoa procurava? Qual valor esperava?" /></Field>
      </div>
    </Modal>
  );
}
