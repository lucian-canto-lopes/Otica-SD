import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, CheckCircle2, LogIn, Save, Trash2, Unlock } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { useSession } from '../../lib/session.jsx';
import { date, dateTime, money, number } from '../../lib/format.js';
import { COMPANY_STATUS, INVOICE_STATUS, ROLE_LABELS } from '../../lib/constants.js';
import { Badge, Button, Card, DataTable, Empty, Field, Input, Kpi, Loading, Modal, PageHeader, StatusBadge, useToast } from '../../components/ui.jsx';
import { BlockModal, CompanyFields } from './AdminCompanies.jsx';

const FORM_KEYS = ['name', 'trade_name', 'document', 'phone', 'whatsapp', 'email', 'city', 'state', 'status', 'plan_id', 'monthly_fee', 'billing_day', 'trial_ends_at', 'blocked_reason'];

export default function AdminCompanyDetail() {
  const { id } = useParams();
  const { data, loading, reload } = useApi('admin_companies', { id });
  const plans = useApi('admin_plans');
  const { selectCompany } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [blocking, setBlocking] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  useEffect(() => {
    if (data) setForm(Object.fromEntries(FORM_KEYS.map((k) => [k, data[k] ?? ''])));
  }, [data]);

  if (loading && !data) return <Loading />;
  if (!data || !form) return <Empty title="Ótica não encontrada" />;

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.patch('admin_companies', form, { id });
      toast.success('Ótica atualizada');
      reload();
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };

  const enter = async () => {
    try {
      await selectCompany(Number(id));
      navigate('/');
    } catch (error) {
      toast.error(error);
    }
  };

  const markInvoice = async (invoice, status) => {
    try {
      await api.patch('admin_invoices', { status, amount: invoice.amount, due_date: invoice.due_date, notes: invoice.notes, payment_method: invoice.payment_method }, { id: invoice.id });
      toast.success(status === 'paid' ? 'Fatura marcada como paga' : 'Fatura atualizada');
      reload();
    } catch (error) {
      toast.error(error);
    }
  };

  const remove = async () => {
    try {
      await api.del('admin_companies', { id }, { confirm: confirmName });
      toast.success('Ótica excluída');
      navigate('/admin/oticas');
    } catch (error) {
      toast.error(error);
    }
  };

  return (
    <div className="stack lg">
      <PageHeader
        back={<Button variant="ghost" icon={ArrowLeft} onClick={() => navigate('/admin/oticas')} aria-label="Voltar" />}
        title={data.trade_name || data.name}
        subtitle={
          <span className="row wrap">
            <StatusBadge map={COMPANY_STATUS} value={data.status} />
            {data.blocked_reason && data.status === 'blocked' && <span className="subtle">{data.blocked_reason}</span>}
            <span className="subtle">Cliente desde {date(data.created_at)}</span>
          </span>
        }
        actions={
          <>
            <Button icon={LogIn} onClick={enter}>
              Acessar ótica
            </Button>
            <Button variant={data.status === 'blocked' ? 'primary' : 'danger'} icon={data.status === 'blocked' ? Unlock : Ban} onClick={() => setBlocking(data)}>
              {data.status === 'blocked' ? 'Liberar acesso' : 'Bloquear'}
            </Button>
          </>
        }
      />

      <div className="grid kpis">
        <Kpi label="Clientes" value={number(data.stats?.clients)} />
        <Kpi label="Produtos" value={number(data.stats?.products)} />
        <Kpi label="Vendas registradas" value={number(data.stats?.sales)} />
        <Kpi label="Total vendido" value={money(data.stats?.sales_total)} />
      </div>

      <div className="grid cols-3">
        <Card title="Dados e assinatura" className="span-2">
          <form className="stack" onSubmit={save}>
            <CompanyFields values={form} set={(k, v) => setForm((f) => ({ ...f, [k]: v }))} plans={plans.data || []} />
            <div className="row end">
              <Button type="submit" variant="primary" icon={Save} loading={saving}>
                Salvar
              </Button>
            </div>
          </form>
        </Card>
        <Card title="Usuários com acesso" bodyClass={null}>
          {data.users?.length ? (
            <div>
              {data.users.map((user) => (
                <div key={user.id} className="mobile-item" style={{ display: 'flex', cursor: 'default' }}>
                  <div className="grow">
                    <strong className="truncate">{user.name}</strong>
                    <div className="subtle truncate">{user.email}</div>
                    <div className="subtle">{user.last_login_at ? `Último acesso ${dateTime(user.last_login_at)}` : 'Nunca acessou'}</div>
                  </div>
                  <div className="stack sm" style={{ alignItems: 'flex-end' }}>
                    <Badge tone="brand">{ROLE_LABELS[user.role] || user.role}</Badge>
                    {(!user.active || !user.member_active) && <Badge tone="danger">Inativo</Badge>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="Nenhum usuário vinculado" />
          )}
          <div className="card-body">
            <Link to="/admin/usuarios">Gerenciar usuários</Link>
          </div>
        </Card>
      </div>

      <Card title="Faturas" bodyClass={null} actions={<Link to={`/admin/financeiro?company=${id}`}>Ver no financeiro</Link>}>
        <DataTable
          rows={data.invoices}
          empty={<Empty title="Nenhuma fatura" />}
          columns={[
            { key: 'reference', label: 'Referência' },
            { key: 'description', label: 'Descrição' },
            { key: 'due_date', label: 'Vencimento', render: (r) => date(r.due_date) },
            { key: 'amount', label: 'Valor', className: 'num', render: (r) => money(r.amount) },
            {
              key: 'status',
              label: 'Situação',
              render: (r) =>
                r.status === 'pending' && r.due_date < new Date().toISOString().slice(0, 10) ? <Badge tone="danger">Vencida</Badge> : <StatusBadge map={INVOICE_STATUS} value={r.status} />,
            },
            { key: 'paid_at', label: 'Pago em', render: (r) => date(r.paid_at) },
            {
              key: 'actions',
              label: '',
              className: 'right',
              render: (r) =>
                r.status === 'pending' ? (
                  <Button size="sm" icon={CheckCircle2} onClick={() => markInvoice(r, 'paid')}>
                    Marcar paga
                  </Button>
                ) : null,
            },
          ]}
        />
      </Card>

      <Card title="Zona de perigo">
        <div className="row between wrap">
          <span className="muted">Excluir remove permanentemente a ótica e todos os seus dados (clientes, vendas, OS, anexos).</span>
          <Button variant="danger" icon={Trash2} onClick={() => (setConfirmName(''), setDeleting(true))}>
            Excluir ótica
          </Button>
        </div>
      </Card>

      <BlockModal company={blocking} onClose={() => setBlocking(null)} onDone={() => (setBlocking(null), reload())} />
      <Modal
        open={deleting}
        title="Excluir ótica"
        onClose={() => setDeleting(false)}
        footer={
          <>
            <Button onClick={() => setDeleting(false)}>Cancelar</Button>
            <Button variant="danger solid" disabled={confirmName !== data.name} onClick={remove}>
              Excluir definitivamente
            </Button>
          </>
        }
      >
        <div className="stack">
          <p>
            Esta ação não pode ser desfeita. Para confirmar, digite o nome exato: <strong>{data.name}</strong>
          </p>
          <Field label="Nome da ótica">
            <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
