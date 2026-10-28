import { useState } from 'react';
import { Plus, ShieldCheck, Trash2, UserX } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi, useDebounce } from '../../lib/hooks.js';
import { dateTime } from '../../lib/format.js';
import { ROLE_LABELS } from '../../lib/constants.js';
import {
  Badge, Button, Card, Checkbox, DataTable, Field, Input, Modal, PageHeader, Pagination, SearchInput, Select, useConfirm, useListState, useToast,
} from '../../components/ui.jsx';

const roleOptions = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));

export default function AdminUsers() {
  const [term, setTerm] = useState('');
  const q = useDebounce(term);
  const list = useListState();
  const { data, loading, reload } = useApi('admin_users', { ...list.params, q });
  const companies = useApi('admin_companies', { per_page: 500 });
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const open = (user) =>
    setEditing(
      user
        ? {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone || '',
            password: '',
            is_superadmin: Boolean(user.is_superadmin),
            active: Boolean(user.active),
            companies: user.companies.filter((c) => Number(c.active)).map((c) => ({ company_id: c.company_id, role: c.role })),
          }
        : { name: '', email: '', phone: '', password: '', is_superadmin: false, active: true, companies: [] },
    );
  const set = (key, value) => setEditing((u) => ({ ...u, [key]: value }));
  const setMembership = (index, key, value) => set('companies', editing.companies.map((m, i) => (i === index ? { ...m, [key]: value } : m)));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = { ...editing, companies: editing.companies.filter((m) => m.company_id) };
      if (editing.id) await api.patch('admin_users', payload, { id: editing.id });
      else await api.post('admin_users', payload);
      toast.success('Usuário salvo');
      setEditing(null);
      reload();
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (user) => {
    if (!(await confirm({ message: `Desativar o acesso de ${user.name}?`, danger: true, confirmLabel: 'Desativar' }))) return;
    try {
      await api.del('admin_users', { id: user.id });
      toast.success('Usuário desativado');
      reload();
    } catch (error) {
      toast.error(error);
    }
  };

  const companyOptions = (companies.data?.data || []).map((c) => ({ value: c.id, label: c.trade_name || c.name }));

  return (
    <div className="stack">
      <PageHeader
        title="Usuários"
        subtitle="Um usuário pode acessar uma ou mais óticas, com um papel em cada uma."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => open(null)}>
            Novo usuário
          </Button>
        }
      />
      <Card bodyClass={null}>
        <div className="card-body">
          <SearchInput value={term} onChange={(v) => (setTerm(v), list.setPage(1))} placeholder="Buscar por nome ou e-mail…" />
        </div>
        <DataTable
          loading={loading}
          rows={data?.data}
          onRowClick={open}
          mobile={(u) => (
            <div className="grow">
              <div className="row between">
                <strong className="truncate">{u.name}</strong>
                {!Number(u.active) && <Badge tone="danger">Inativo</Badge>}
              </div>
              <div className="subtle truncate">{u.email}</div>
              <div className="subtle">{u.companies.map((c) => c.name).join(', ') || (u.is_superadmin ? 'Administrador da plataforma' : 'Sem ótica')}</div>
            </div>
          )}
          columns={[
            {
              key: 'name',
              label: 'Usuário',
              render: (u) => (
                <div>
                  <strong>{u.name}</strong> {Number(u.is_superadmin) ? <Badge tone="brand"><ShieldCheck size={12} /> Plataforma</Badge> : null}
                  <div className="subtle">{u.email}</div>
                </div>
              ),
            },
            {
              key: 'companies',
              label: 'Óticas',
              render: (u) => (
                <div className="chips">
                  {u.companies
                    .filter((c) => Number(c.active))
                    .map((c) => (
                      <Badge key={c.company_id}>
                        {c.name} · {ROLE_LABELS[c.role]}
                      </Badge>
                    ))}
                </div>
              ),
            },
            { key: 'last_login_at', label: 'Último acesso', render: (u) => (u.last_login_at ? dateTime(u.last_login_at) : <span className="subtle">Nunca</span>) },
            { key: 'active', label: 'Situação', render: (u) => (Number(u.active) ? <Badge tone="success">Ativo</Badge> : <Badge tone="danger">Inativo</Badge>) },
            {
              key: 'actions',
              label: '',
              className: 'right',
              render: (u) =>
                Number(u.active) ? (
                  <span onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" icon={UserX} onClick={() => deactivate(u)} title="Desativar" />
                  </span>
                ) : null,
            },
          ]}
        />
        {data && <Pagination page={data.page} perPage={data.per_page} total={data.total} onChange={list.setPage} />}
      </Card>

      <Modal
        open={Boolean(editing)}
        size="lg"
        title={editing?.id ? 'Editar usuário' : 'Novo usuário'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="user-form" loading={saving}>
              Salvar
            </Button>
          </>
        }
      >
        {editing && (
          <form id="user-form" className="stack" onSubmit={save}>
            <div className="form-grid">
              <Field label="Nome *" className="c6">
                <Input required value={editing.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label="E-mail *" className="c6">
                <Input required type="email" value={editing.email} onChange={(e) => set('email', e.target.value)} />
              </Field>
              <Field label="Telefone" className="c6">
                <Input value={editing.phone} onChange={(e) => set('phone', e.target.value)} />
              </Field>
              <Field label={editing.id ? 'Nova senha (opcional)' : 'Senha inicial *'} hint="Mínimo de 8 caracteres" className="c6">
                <Input type="text" autoComplete="new-password" required={!editing.id} value={editing.password} onChange={(e) => set('password', e.target.value)} />
              </Field>
              <div className="row wrap" style={{ gap: 18 }}>
                <Checkbox label="Usuário ativo" checked={editing.active} onChange={(e) => set('active', e.target.checked)} />
                <Checkbox label="Administrador da plataforma (acesso a todas as óticas)" checked={editing.is_superadmin} onChange={(e) => set('is_superadmin', e.target.checked)} />
              </div>
            </div>
            <div className="form-section">Acesso às óticas</div>
            {editing.companies.map((membership, index) => (
              <div key={index} className="row">
                <Select className="grow" placeholder="Selecione a ótica" options={companyOptions} value={membership.company_id} onChange={(e) => setMembership(index, 'company_id', e.target.value)} />
                <Select style={{ maxWidth: 170 }} options={roleOptions} value={membership.role} onChange={(e) => setMembership(index, 'role', e.target.value)} />
                <Button variant="ghost" icon={Trash2} onClick={() => set('companies', editing.companies.filter((_, i) => i !== index))} aria-label="Remover acesso" />
              </div>
            ))}
            <div>
              <Button size="sm" icon={Plus} onClick={() => set('companies', [...editing.companies, { company_id: '', role: 'seller' }])}>
                Adicionar ótica
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
