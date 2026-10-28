import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../../lib/api.js';
import { invalidate, useApi, useDebounce } from '../../lib/hooks.js';
import { useSession } from '../../lib/session.jsx';
import { phone } from '../../lib/format.js';
import { UF } from '../../lib/constants.js';
import {
  Badge, Button, Card, Checkbox, DataTable, Field, Input, Modal, PageHeader, Pagination, SearchInput, Select, Tabs, Textarea,
  useListState, useToast, WhatsAppButton,
} from '../../components/ui.jsx';

const TYPES = { supplier: 'Fornecedor', laboratory: 'Laboratório', both: 'Fornecedor e laboratório' };
const EMPTY = { type: 'supplier', name: '', trade_name: '', document: '', contact_name: '', phone: '', whatsapp: '', email: '', address: '', city: '', state: '', notes: '', active: true };

function PartnerForm({ open, partner, onClose, onSaved }) {
  const [values, setValues] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  useEffect(() => {
    if (open) setValues(partner ? { ...EMPTY, ...Object.fromEntries(Object.entries(partner).map(([k, v]) => [k, v ?? ''])), active: Boolean(Number(partner.active)) } : EMPTY);
  }, [open, partner]);
  const set = (f) => (e) => setValues((v) => ({ ...v, [f]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async () => {
    setSaving(true);
    try {
      if (partner?.id) await api.patch('partners', values, { id: partner.id });
      else await api.post('partners', values);
      invalidate('partners');
      toast.success('Cadastro salvo');
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title={partner?.id ? 'Editar fornecedor' : 'Novo fornecedor / laboratório'} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={saving} onClick={save}>Salvar</Button></>}>
      <div className="form-grid">
        <Field label="Tipo" className="c4">
          <Select value={values.type} onChange={set('type')} options={Object.entries(TYPES).map(([value, label]) => ({ value, label }))} />
        </Field>
        <Field label="Razão social / nome *" className="c8">
          <Input value={values.name} onChange={set('name')} autoFocus />
        </Field>
        <Field label="Nome fantasia" className="c6">
          <Input value={values.trade_name} onChange={set('trade_name')} />
        </Field>
        <Field label="CNPJ / CPF" className="c6">
          <Input value={values.document} onChange={set('document')} />
        </Field>
        <Field label="Contato" className="c4">
          <Input value={values.contact_name} onChange={set('contact_name')} />
        </Field>
        <Field label="Telefone" className="c4">
          <Input value={values.phone} onChange={set('phone')} />
        </Field>
        <Field label="WhatsApp" className="c4">
          <Input value={values.whatsapp} onChange={set('whatsapp')} />
        </Field>
        <Field label="E-mail" className="c6">
          <Input type="email" value={values.email} onChange={set('email')} />
        </Field>
        <Field label="Cidade" className="c4">
          <Input value={values.city} onChange={set('city')} />
        </Field>
        <Field label="UF" className="c2">
          <Select value={values.state} onChange={set('state')} placeholder="—" options={UF} />
        </Field>
        <Field label="Endereço">
          <Input value={values.address} onChange={set('address')} />
        </Field>
        <Field label="Observações (prazos, condições, contas…)">
          <Textarea value={values.notes} onChange={set('notes')} rows={3} />
        </Field>
        {partner?.id && <Checkbox label="Ativo" checked={values.active} onChange={set('active')} />}
      </div>
    </Modal>
  );
}

export default function Partners() {
  const { can } = useSession();
  const [type, setType] = useState('');
  const [term, setTerm] = useState('');
  const [editing, setEditing] = useState(null);
  const q = useDebounce(term, 250);
  const list = useListState({ key: 'name', dir: 'asc' });
  const { data, loading, reload } = useApi('partners', { type, q, ...list.params });

  return (
    <div className="stack">
      <PageHeader
        title="Fornecedores e laboratórios"
        actions={can('sell') && <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>Novo cadastro</Button>}
      />
      <Tabs
        active={type}
        onChange={(t) => (setType(t), list.setPage(1))}
        tabs={[{ key: '', label: 'Todos' }, { key: 'supplier', label: 'Fornecedores' }, { key: 'laboratory', label: 'Laboratórios' }]}
      />
      <SearchInput value={term} onChange={setTerm} placeholder="Nome, CNPJ ou contato…" />
      <Card bodyClass={null}>
        <DataTable
          rows={data?.data}
          loading={loading}
          sort={list.sort}
          onSort={list.toggleSort}
          onRowClick={(p) => setEditing(p)}
          columns={[
            { key: 'name', label: 'Nome', sortable: true, render: (p) => (<div><strong>{p.name}</strong>{p.trade_name && <div className="subtle">{p.trade_name}</div>}</div>) },
            { key: 'type', label: 'Tipo', sortable: true, render: (p) => <Badge tone={p.type === 'laboratory' ? 'brand' : 'info'}>{TYPES[p.type]}</Badge> },
            { key: 'contact_name', label: 'Contato', render: (p) => p.contact_name || '—' },
            { key: 'phone', label: 'Telefone', render: (p) => phone(p.phone || p.whatsapp) || '—' },
            { key: 'city', label: 'Cidade', render: (p) => [p.city, p.state].filter(Boolean).join('/') || '—' },
            { key: 'products_count', label: 'Produtos', className: 'num' },
            { key: 'wa', label: '', render: (p) => <WhatsAppButton phone={p.whatsapp} label="" /> },
          ]}
          mobile={(p) => (
            <>
              <div className="grow">
                <strong>{p.name}</strong>
                <div className="subtle">
                  {TYPES[p.type]} · {phone(p.phone || p.whatsapp)}
                </div>
              </div>
              <WhatsAppButton phone={p.whatsapp} label="" />
            </>
          )}
        />
        {data && <Pagination page={data.page} perPage={data.per_page} total={data.total} onChange={list.setPage} />}
      </Card>
      <PartnerForm open={Boolean(editing)} partner={editing?.id ? editing : null} onClose={() => setEditing(null)} onSaved={reload} />
    </div>
  );
}
