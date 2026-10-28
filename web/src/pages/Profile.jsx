import { useState } from 'react';
import { Save } from 'lucide-react';
import { api } from '../lib/api.js';
import { useSession } from '../lib/session.jsx';
import { Button, Card, Field, Input, PageHeader, useToast } from '../components/ui.jsx';

export default function Profile() {
  const { user, refresh } = useSession();
  const toast = useToast();
  const [form, setForm] = useState({ name: user?.name || '', phone: user?.phone || '', current_password: '', new_password: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async (event) => {
    event.preventDefault();
    if (form.new_password && form.new_password !== form.confirm) {
      toast.error('A confirmação não confere com a nova senha.');
      return;
    }
    setSaving(true);
    try {
      await api.patch('profile', { name: form.name, phone: form.phone, current_password: form.current_password, new_password: form.new_password });
      toast.success(form.new_password ? 'Perfil e senha atualizados' : 'Perfil atualizado');
      setForm((f) => ({ ...f, current_password: '', new_password: '', confirm: '' }));
      refresh();
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="stack" style={{ maxWidth: 640 }} onSubmit={save}>
      <PageHeader title="Meu perfil" subtitle={user?.email} />
      <Card title="Dados pessoais">
        <div className="form-grid">
          <Field label="Nome" className="c8">
            <Input required value={form.name} onChange={set('name')} />
          </Field>
          <Field label="Telefone" className="c4">
            <Input value={form.phone} onChange={set('phone')} />
          </Field>
        </div>
      </Card>
      <Card title="Alterar senha">
        <div className="form-grid">
          <Field label="Senha atual" className="c4">
            <Input type="password" autoComplete="current-password" value={form.current_password} onChange={set('current_password')} />
          </Field>
          <Field label="Nova senha" hint="Mínimo de 8 caracteres" className="c4">
            <Input type="password" autoComplete="new-password" value={form.new_password} onChange={set('new_password')} />
          </Field>
          <Field label="Confirmar nova senha" className="c4">
            <Input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
          </Field>
        </div>
      </Card>
      <p className="subtle">O tema claro ou escuro pode ser alternado pelo ícone de sol/lua no topo da tela e fica salvo neste navegador.</p>
      <div className="row end">
        <Button type="submit" variant="primary" icon={Save} loading={saving}>
          Salvar
        </Button>
      </div>
    </form>
  );
}
