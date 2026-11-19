import { useState } from 'react';
import { Minus, Pencil, Plus, RotateCcw, Trash2, UserMinus } from 'lucide-react';
import { api } from '../../lib/api.js';
import { invalidate, useApi } from '../../lib/hooks.js';
import { useSession } from '../../lib/session.jsx';
import { dateTime, money, number } from '../../lib/format.js';
import { ROLE_LABELS } from '../../lib/constants.js';
import { Badge, Button, Card, DataTable, Empty, Field, Input, Modal, Select, TagChip, useConfirm, useToast } from '../../components/ui.jsx';
import { ReadOnlyNotice } from './common.jsx';

const ROLE_HELP = {
  owner: 'Acesso total, inclusive configurações e equipe.',
  manager: 'Acesso total à operação e às configurações.',
  seller: 'Clientes, orçamentos, vendas, OS, atendimento e campanhas.',
  lab: 'Ordens de serviço e consulta de clientes.',
  viewer: 'Apenas consulta.',
};

function useSaver(reload) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const run = async (fn, message) => {
    setSaving(true);
    try {
      await fn();
      if (message) toast.success(message);
      reload();
      return true;
    } catch (error) {
      toast.error(error);
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { saving, run };
}

export function TeamTab() {
  const { can, user } = useSession();
  const canEdit = can('manage');
  const { data, loading, reload } = useApi('team');
  const { data: seats, reload: reloadSeats } = useApi('team_seats');
  const confirm = useConfirm();
  const toast = useToast();
  const { saving, run } = useSaver(reload);
  const [editing, setEditing] = useState(null);

  const changeCapacity = async (key, amount) => {
    const next = Math.max(0, Number(seats?.[key] || 0) + amount);
    try {
      await api.patch('team_seats', {
        extra_user_slots: key === 'extra_user_slots' ? next : Number(seats?.extra_user_slots || 0),
        extra_screen_slots: key === 'extra_screen_slots' ? next : Number(seats?.extra_screen_slots || 0),
      });
      toast.success('Limites da ótica atualizados');
      reloadSeats();
    } catch (error) {
      toast.error(error);
    }
  };

  const changeMemberScreens = async (member, amount) => {
    const next = Math.max(1, Number(member.concurrent_screens || 1) + amount);
    await run(() => api.patch('team', { concurrent_screens: next }, { id: member.id }), 'Limite de telas atualizado');
    reloadSeats();
  };

  const endMemberSessions = async (member) => {
    await run(() => api.patch('team', { end_sessions: true }, { id: member.id }), 'Sessões encerradas');
    reloadSeats();
  };

  const save = async (event) => {
    event.preventDefault();
    const ok = editing.id
      ? await run(() => api.patch('team', { role: editing.role, active: editing.active }, { id: editing.id }), 'Acesso atualizado')
      : await run(() => api.post('team', editing), 'Usuário adicionado à equipe');
    if (ok) setEditing(null);
  };
  const revoke = async (member) => {
    if (!(await confirm({ message: `Remover o acesso de ${member.name} a esta ótica?`, danger: true, confirmLabel: 'Remover acesso' }))) return;
    run(() => api.del('team', { id: member.id }), 'Acesso removido');
  };

  return (
    <div className="stack">
      {!canEdit && <ReadOnlyNotice />}
      {canEdit && seats && (
      <Card title="Vagas e telas contratadas">
        <div className="subtle" style={{ paddingBottom: 12 }}>O proprietário pode usar as telas livres da ótica. Cada tela ocupada por ele reduz as disponíveis para funcionários. Telas adicionais de funcionários exigem contratação.</div>
          <div className="grid cols-2">
            <div className="stack sm">
              <strong>Usuários da ótica</strong>
              <span className="subtle">{number(seats.active_users)} de {number(seats.included_users + seats.extra_user_slots)} contas · {number(seats.included_users)} incluídas no plano</span>
              <div className="row wrap">
                <Button size="sm" icon={Minus} disabled={!Number(seats.extra_user_slots)} onClick={() => changeCapacity('extra_user_slots', -1)} aria-label="Diminuir vagas extras" />
                <Badge>{number(seats.extra_user_slots)} vaga(s) extra(s)</Badge>
                <Button size="sm" icon={Plus} onClick={() => changeCapacity('extra_user_slots', 1)} aria-label="Aumentar vagas extras" />
                <span className="subtle">{money(seats.extra_user_price)}/mês cada</span>
              </div>
            </div>
            <div className="stack sm">
              <strong>Telas simultâneas extras</strong>
              <span className="subtle">{number(seats.active_screens)} de {number(Number(seats.included_users) + Number(seats.extra_user_slots) + Number(seats.extra_screen_slots))} telas da ótica em uso</span>
              <span className="subtle">{number(seats.assigned_extra_screens)} atribuída(s) de {number(seats.extra_screen_slots)} contratada(s)</span>
              <div className="row wrap">
                <Button size="sm" icon={Minus} disabled={Number(seats.extra_screen_slots) <= Number(seats.assigned_extra_screens)} onClick={() => changeCapacity('extra_screen_slots', -1)} aria-label="Diminuir telas extras da ótica" />
                <Badge>{number(seats.extra_screen_slots)} extra(s)</Badge>
                <Button size="sm" icon={Plus} onClick={() => changeCapacity('extra_screen_slots', 1)} aria-label="Aumentar telas extras da ótica" />
                <span className="subtle">{money(seats.extra_screen_price)}/mês cada</span>
              </div>
              <span><strong>Adicional estimado: {money(Number(seats.extra_user_slots) * Number(seats.extra_user_price) + Number(seats.extra_screen_slots) * Number(seats.extra_screen_price))}/mês</strong></span>
            </div>
          </div>
        </Card>
      )}
      <Card
        title="Equipe da ótica"
        bodyClass={null}
        actions={
          canEdit && (
            <Button size="sm" variant="primary" icon={Plus} onClick={() => setEditing({ name: '', email: '', password: '', role: 'seller' })}>
              Adicionar pessoa
            </Button>
          )
        }
      >
        <DataTable
          loading={loading}
          rows={data}
          onRowClick={canEdit ? (m) => setEditing({ ...m, active: Boolean(Number(m.active)) }) : undefined}
          mobile={(m) => (
            <div className="grow">
              <div className="row between">
                <strong className="truncate">{m.name}</strong>
                <Badge tone={Number(m.active) ? 'brand' : 'danger'}>{Number(m.active) ? ROLE_LABELS[m.role] : 'Sem acesso'}</Badge>
              </div>
              <div className="subtle truncate">{m.email}</div>
              <div className="subtle">Telas ativas: {number(m.active_screens)} de {number(m.concurrent_screens || 1)}</div>
              {canEdit && Number(m.active) && (
                <div className="row wrap" onClick={(event) => event.stopPropagation()}>
                  {m.role !== 'owner' && <Button size="sm" variant="ghost" icon={Minus} disabled={Number(m.concurrent_screens || 1) <= 1} onClick={() => changeMemberScreens(m, -1)} aria-label={`Diminuir telas de ${m.name}`} />}
                  {m.role !== 'owner' && <Button size="sm" variant="ghost" icon={Plus} onClick={() => changeMemberScreens(m, 1)} aria-label={`Aumentar telas de ${m.name}`} />}
                  {Number(m.active_screens) > 0 && m.id !== user?.id && <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => endMemberSessions(m)} aria-label={`Encerrar sessões de ${m.name}`} />}
                  {m.id !== user?.id && <Button size="sm" variant="ghost" icon={UserMinus} onClick={() => revoke(m)} aria-label={`Remover acesso de ${m.name}`} />}
                </div>
              )}
            </div>
          )}
          columns={[
            { key: 'name', label: 'Nome', render: (m) => (<div><strong>{m.name}</strong><div className="subtle">{m.email}</div></div>) },
            { key: 'role', label: 'Papel', render: (m) => <Badge tone="brand">{ROLE_LABELS[m.role]}</Badge> },
            { key: 'active', label: 'Acesso', render: (m) => (Number(m.active) ? <Badge tone="success">Ativo</Badge> : <Badge tone="danger">Removido</Badge>) },
            { key: 'screens', label: 'Telas simultâneas', render: (m) => (
              <div className="row">
                <Badge tone={Number(m.active_screens) >= Number(m.concurrent_screens || 1) ? 'warning' : 'brand'}>{number(m.active_screens)} / {number(m.concurrent_screens || 1)}</Badge>
                {canEdit && Number(m.active) && <span onClick={(e) => e.stopPropagation()} className="row">
                  {m.role !== 'owner' && <Button size="sm" variant="ghost" icon={Minus} disabled={Number(m.concurrent_screens || 1) <= 1} onClick={() => changeMemberScreens(m, -1)} aria-label={`Diminuir telas de ${m.name}`} />}
                  {m.role !== 'owner' && <Button size="sm" variant="ghost" icon={Plus} onClick={() => changeMemberScreens(m, 1)} aria-label={`Aumentar telas de ${m.name}`} />}
                  {Number(m.active_screens) > 0 && m.id !== user?.id && <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => endMemberSessions(m)} title={`Encerrar sessões de ${m.name}`} aria-label={`Encerrar sessões de ${m.name}`} />}
                </span>}
              </div>
            ) },
            { key: 'last_login_at', label: 'Último acesso', render: (m) => (m.last_login_at ? dateTime(m.last_login_at) : <span className="subtle">Nunca</span>) },
            {
              key: 'actions',
              label: '',
              className: 'right',
              render: (m) =>
                canEdit && Number(m.active) && m.id !== user?.id ? (
                  <span onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" icon={UserMinus} onClick={() => revoke(m)} title="Remover acesso" />
                  </span>
                ) : null,
            },
          ]}
        />
      </Card>
      <Modal
        open={Boolean(editing)}
        title={editing?.id ? `Acesso de ${editing.name}` : 'Adicionar pessoa à equipe'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="team-form" loading={saving}>
              Salvar
            </Button>
          </>
        }
      >
        {editing && (
          <form id="team-form" className="form-grid" onSubmit={save}>
            {!editing.id && (
              <>
                <Field label="Nome" className="c6">
                  <Input value={editing.name} onChange={(e) => setEditing((m) => ({ ...m, name: e.target.value }))} />
                </Field>
                <Field label="E-mail de acesso *" className="c6">
                  <Input required type="email" value={editing.email} onChange={(e) => setEditing((m) => ({ ...m, email: e.target.value }))} />
                </Field>
                <Field label="Senha inicial" hint="Obrigatória se o e-mail ainda não tiver cadastro (mín. 8 caracteres). Se já existir, a pessoa usa a senha atual.">
                  <Input type="text" autoComplete="new-password" value={editing.password} onChange={(e) => setEditing((m) => ({ ...m, password: e.target.value }))} />
                </Field>
              </>
            )}
            <Field label="Papel" hint={ROLE_HELP[editing.role]}>
              <Select value={editing.role} onChange={(e) => setEditing((m) => ({ ...m, role: e.target.value }))} options={Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))} />
            </Field>
            {editing.id && (
              <label className="checkbox">
                <input type="checkbox" checked={editing.active} onChange={(e) => setEditing((m) => ({ ...m, active: e.target.checked }))} />
                <span>Acesso ativo</span>
              </label>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
}

const TAG_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948', '#64748b'];

export function TagsTab() {
  const { can } = useSession();
  const canEdit = can('sell');
  const { data, loading, reload } = useApi('tags');
  const confirm = useConfirm();
  const { saving, run } = useSaver(() => (invalidate('tags'), reload()));
  const [editing, setEditing] = useState(null);

  const save = async (event) => {
    event.preventDefault();
    const payload = { name: editing.name, color: editing.color };
    const ok = editing.id ? await run(() => api.patch('tags', payload, { id: editing.id }), 'Etiqueta salva') : await run(() => api.post('tags', payload), 'Etiqueta criada');
    if (ok) setEditing(null);
  };
  const remove = async (tag) => {
    if (!(await confirm({ message: `Excluir a etiqueta "${tag.name}"? Ela será removida de ${tag.clients} cliente(s).`, danger: true, confirmLabel: 'Excluir' }))) return;
    run(() => api.del('tags', { id: tag.id }), 'Etiqueta excluída');
  };

  return (
    <Card
      title="Etiquetas de clientes"
      actions={
        canEdit && (
          <Button size="sm" variant="primary" icon={Plus} onClick={() => setEditing({ name: '', color: TAG_COLORS[0] })}>
            Nova etiqueta
          </Button>
        )
      }
    >
      <p className="muted" style={{ marginBottom: 12 }}>
        Use etiquetas para segmentar clientes (ex.: VIP, multifocal, convênio) e filtrar relatórios e campanhas. Um cliente pode ter várias.
      </p>
      {loading && !data ? null : data?.length ? (
        <div className="stack sm">
          {data.map((tag) => (
            <div key={tag.id} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="row">
                <TagChip tag={tag} />
                <span className="subtle">{number(tag.clients)} cliente(s)</span>
              </span>
              {canEdit && (
                <span className="row">
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(tag)} aria-label="Editar" />
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(tag)} aria-label="Excluir" />
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty title="Nenhuma etiqueta" />
      )}
      <Modal
        open={Boolean(editing)}
        title={editing?.id ? 'Editar etiqueta' : 'Nova etiqueta'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="tag-form" loading={saving}>
              Salvar
            </Button>
          </>
        }
      >
        {editing && (
          <form id="tag-form" className="stack" onSubmit={save}>
            <Field label="Nome *">
              <Input required maxLength={60} value={editing.name} onChange={(e) => setEditing((t) => ({ ...t, name: e.target.value }))} />
            </Field>
            <Field label="Cor">
              <div className="chips">
                {TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={color}
                    onClick={() => setEditing((t) => ({ ...t, color }))}
                    style={{ width: 28, height: 28, borderRadius: '50%', background: color, border: editing.color === color ? '3px solid var(--text)' : '2px solid var(--surface)', cursor: 'pointer' }}
                  />
                ))}
                <input type="color" value={editing.color} onChange={(e) => setEditing((t) => ({ ...t, color: e.target.value }))} style={{ width: 34, height: 30, border: 'none', background: 'none' }} />
              </div>
            </Field>
            {editing.name && <TagChip tag={editing} />}
          </form>
        )}
      </Modal>
    </Card>
  );
}

export function ReasonsTab() {
  const { can } = useSession();
  const canEdit = can('manage');
  const { data, loading, reload } = useApi('loss_reasons');
  const { saving, run } = useSaver(() => (invalidate('loss_reasons'), reload()));
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);

  const add = async (event) => {
    event.preventDefault();
    if (await run(() => api.post('loss_reasons', { name }), 'Motivo adicionado')) setName('');
  };

  return (
    <Card title="Motivos de não compra / desistência">
      <div className="stack">
        <p className="muted">Usados ao marcar um orçamento como perdido e ao registrar atendimentos sem venda. Alimentam os relatórios gerenciais.</p>
        {!canEdit && <ReadOnlyNotice />}
        {canEdit && (
          <form className="row" onSubmit={add}>
            <Input className="grow" required placeholder="Novo motivo…" value={name} onChange={(e) => setName(e.target.value)} />
            <Button type="submit" variant="primary" icon={Plus} loading={saving}>
              Adicionar
            </Button>
          </form>
        )}
        {loading && !data ? null : data?.length ? (
          <div>
            {data.map((reason) => (
              <div key={reason.id} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', opacity: Number(reason.active) ? 1 : 0.55 }}>
                {editing?.id === reason.id ? (
                  <form
                    className="row grow"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (await run(() => api.patch('loss_reasons', { name: editing.name, active: true }, { id: reason.id }), 'Motivo salvo')) setEditing(null);
                    }}
                  >
                    <Input className="grow sm" autoFocus value={editing.name} onChange={(e) => setEditing((r) => ({ ...r, name: e.target.value }))} />
                    <Button size="sm" type="submit" variant="primary">
                      Salvar
                    </Button>
                    <Button size="sm" onClick={() => setEditing(null)}>
                      Cancelar
                    </Button>
                  </form>
                ) : (
                  <>
                    <span>
                      {reason.name} <span className="subtle">· {number(reason.uses)} registro(s)</span> {!Number(reason.active) && <Badge>Inativo</Badge>}
                    </span>
                    {canEdit && (
                      <span className="row">
                        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing({ id: reason.id, name: reason.name })} aria-label="Editar" />
                        {Number(reason.active) ? (
                          <Button size="sm" variant="ghost" icon={Trash2} onClick={() => run(() => api.del('loss_reasons', { id: reason.id }), 'Motivo desativado')} title="Desativar" />
                        ) : (
                          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => run(() => api.patch('loss_reasons', { name: reason.name, active: true }, { id: reason.id }), 'Motivo reativado')} title="Reativar" />
                        )}
                      </span>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Nenhum motivo cadastrado" />
        )}
      </div>
    </Card>
  );
}
