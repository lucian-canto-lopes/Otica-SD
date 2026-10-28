import { useState } from 'react';
import { Check, Pencil, Plus } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { money, number } from '../../lib/format.js';
import { Badge, Button, Card, Checkbox, Empty, Field, Input, Loading, Modal, PageHeader, Textarea, useToast } from '../../components/ui.jsx';

const parseFeatures = (value) => {
  try {
    return Array.isArray(value) ? value : JSON.parse(value || '[]');
  } catch {
    return [];
  }
};

export default function AdminPlans() {
  const { data, loading, reload } = useApi('admin_plans');
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const open = (plan) =>
    setEditing(
      plan
        ? { ...plan, features: parseFeatures(plan.features).join('\n'), active: Boolean(Number(plan.active)) }
        : { name: '', price: '', max_users: 3, max_clients: 0, features: '', active: true },
    );

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = { ...editing, features: editing.features.split('\n').map((f) => f.trim()).filter(Boolean) };
      if (editing.id) await api.patch('admin_plans', payload, { id: editing.id });
      else await api.post('admin_plans', payload);
      toast.success('Plano salvo');
      setEditing(null);
      reload();
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };

  const set = (key) => (e) => setEditing((p) => ({ ...p, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  return (
    <div className="stack">
      <PageHeader
        title="Planos"
        subtitle="Planos de assinatura oferecidos às óticas."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => open(null)}>
            Novo plano
          </Button>
        }
      />
      {loading && !data ? (
        <Loading />
      ) : data?.length ? (
        <div className="grid cols-3">
          {data.map((plan) => (
            <Card
              key={plan.id}
              title={
                <span className="row">
                  <h3>{plan.name}</h3>
                  {!Number(plan.active) && <Badge>Inativo</Badge>}
                </span>
              }
              actions={<Button size="sm" variant="ghost" icon={Pencil} onClick={() => open(plan)} aria-label="Editar" />}
            >
              <div className="stack">
                <div>
                  <span className="kpi-value">{money(plan.price)}</span> <span className="subtle">/ mês</span>
                </div>
                <div className="subtle">
                  Até {number(plan.max_users)} usuários · {Number(plan.max_clients) ? `${number(plan.max_clients)} clientes` : 'clientes ilimitados'}
                </div>
                <div className="stack sm">
                  {parseFeatures(plan.features).map((feature) => (
                    <span key={feature} className="row">
                      <Check size={15} style={{ color: 'var(--success)' }} /> {feature}
                    </span>
                  ))}
                </div>
                <Badge tone="brand">{number(plan.companies)} ótica(s) neste plano</Badge>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty title="Nenhum plano cadastrado" />
      )}

      <Modal
        open={Boolean(editing)}
        title={editing?.id ? 'Editar plano' : 'Novo plano'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="plan-form" loading={saving}>
              Salvar
            </Button>
          </>
        }
      >
        {editing && (
          <form id="plan-form" className="form-grid" onSubmit={save}>
            <Field label="Nome *" className="c8">
              <Input required value={editing.name} onChange={set('name')} />
            </Field>
            <Field label="Preço mensal (R$)" className="c4">
              <Input inputMode="decimal" value={editing.price} onChange={set('price')} />
            </Field>
            <Field label="Máximo de usuários" className="c6">
              <Input type="number" min="1" value={editing.max_users} onChange={set('max_users')} />
            </Field>
            <Field label="Máximo de clientes" hint="0 = ilimitado" className="c6">
              <Input type="number" min="0" value={editing.max_clients} onChange={set('max_clients')} />
            </Field>
            <Field label="Recursos (um por linha)">
              <Textarea rows={5} value={editing.features} onChange={set('features')} />
            </Field>
            <Checkbox label="Plano ativo (disponível para novas óticas)" checked={editing.active} onChange={set('active')} />
          </form>
        )}
      </Modal>
    </div>
  );
}
