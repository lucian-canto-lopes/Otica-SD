import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { invalidate, useApi } from '../../lib/hooks.js';
import { ORIGINS, UF } from '../../lib/constants.js';
import { Button, Checkbox, Field, Input, Modal, Select, Textarea, useToast } from '../../components/ui.jsx';

const EMPTY = {
  kind: 'client', name: '', nickname: '', cpf: '', rg: '', birth_date: '', gender: '', whatsapp: '', phone: '', email: '',
  instagram: '', zip: '', address: '', number: '', complement: '', neighborhood: '', city: '', state: '', occupation: '',
  origin: '', notes: '', next_contact_date: '', message_consent: false, tag_ids: [],
};

/** Formulário de cliente em modal; usado na listagem, na ficha e nos atalhos de venda/orçamento. */
export default function ClientForm({ open, client, initialName = '', onClose, onSaved }) {
  const [values, setValues] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [more, setMore] = useState(false);
  const tags = useApi(open ? 'tags' : null).data || [];
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setValues(client ? { ...EMPTY, ...Object.fromEntries(Object.entries(client).map(([k, v]) => [k, v ?? ''])), message_consent: Boolean(Number(client.message_consent)), tag_ids: (client.tags || []).map((t) => t.id) } : { ...EMPTY, name: initialName });
    setMore(Boolean(client));
  }, [open, client, initialName]);

  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const toggleTag = (id) => setValues((v) => ({ ...v, tag_ids: v.tag_ids.includes(id) ? v.tag_ids.filter((t) => t !== id) : [...v.tag_ids, id] }));

  const lookupZip = async () => {
    const zip = values.zip.replace(/\D/g, '');
    if (zip.length !== 8) return;
    try {
      const response = await fetch(`https://viacep.com.br/ws/${zip}/json/`);
      const data = await response.json();
      if (!data.erro) setValues((v) => ({ ...v, address: v.address || data.logradouro, neighborhood: v.neighborhood || data.bairro, city: data.localidade, state: data.uf }));
    } catch {
      // Consulta de CEP é opcional.
    }
  };

  const save = async (event) => {
    event?.preventDefault();
    setSaving(true);
    try {
      const result = client?.id ? await api.patch('clients', values, { id: client.id }) : await api.post('clients', values);
      invalidate('clients');
      toast.success(client?.id ? 'Cliente atualizado' : 'Cliente cadastrado');
      onSaved?.({ id: result.id || client?.id, name: values.name, whatsapp: values.whatsapp });
      onClose();
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={client?.id ? 'Editar cliente' : 'Novo cliente'}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={saving} onClick={save}>
            Salvar
          </Button>
        </>
      }
    >
      <form className="form-grid" onSubmit={save}>
        <Field label="Nome completo *" className="c8">
          <Input value={values.name} onChange={set('name')} required autoFocus />
        </Field>
        <Field label="Tipo" className="c4">
          <Select value={values.kind} onChange={set('kind')} options={[{ value: 'client', label: 'Cliente' }, { value: 'lead', label: 'Contato (ainda não comprou)' }]} />
        </Field>
        <Field label="WhatsApp" className="c4">
          <Input value={values.whatsapp} onChange={set('whatsapp')} inputMode="tel" placeholder="(00) 90000-0000" />
        </Field>
        <Field label="CPF" className="c4">
          <Input value={values.cpf} onChange={set('cpf')} inputMode="numeric" />
        </Field>
        <Field label="Nascimento" className="c4">
          <Input type="date" value={values.birth_date} onChange={set('birth_date')} />
        </Field>
        <div className="span-full">
          <Checkbox label="Autorizou receber mensagens (WhatsApp, campanhas e lembretes)" checked={values.message_consent} onChange={set('message_consent')} />
        </div>
        {tags.length > 0 && (
          <Field label="Etiquetas" className="span-full">
            <div className="chips">
              {tags.map((tag) => (
                <button type="button" key={tag.id} className={`chip ${values.tag_ids.includes(tag.id) ? 'active' : ''}`} onClick={() => toggleTag(tag.id)}>
                  <i style={{ width: 8, height: 8, borderRadius: 4, background: tag.color }} />
                  {tag.name}
                </button>
              ))}
            </div>
          </Field>
        )}
        {!more ? (
          <div className="span-full">
            <Button variant="ghost" size="sm" onClick={() => setMore(true)}>
              + Endereço, e-mail e mais dados
            </Button>
          </div>
        ) : (
          <>
            <div className="form-section span-full">Contato e endereço</div>
            <Field label="Telefone fixo" className="c4">
              <Input value={values.phone} onChange={set('phone')} inputMode="tel" />
            </Field>
            <Field label="E-mail" className="c4">
              <Input type="email" value={values.email} onChange={set('email')} />
            </Field>
            <Field label="Instagram" className="c4">
              <Input value={values.instagram} onChange={set('instagram')} placeholder="@usuario" />
            </Field>
            <Field label="CEP" className="c3">
              <Input value={values.zip} onChange={set('zip')} onBlur={lookupZip} inputMode="numeric" />
            </Field>
            <Field label="Endereço" className="c7">
              <Input value={values.address} onChange={set('address')} />
            </Field>
            <Field label="Número" className="c2">
              <Input value={values.number} onChange={set('number')} />
            </Field>
            <Field label="Complemento" className="c3">
              <Input value={values.complement} onChange={set('complement')} />
            </Field>
            <Field label="Bairro" className="c3">
              <Input value={values.neighborhood} onChange={set('neighborhood')} />
            </Field>
            <Field label="Cidade" className="c4">
              <Input value={values.city} onChange={set('city')} />
            </Field>
            <Field label="UF" className="c2">
              <Select value={values.state} onChange={set('state')} placeholder="—" options={UF} />
            </Field>
            <div className="form-section span-full">Outros dados</div>
            <Field label="Apelido / como gosta de ser chamado" className="c4">
              <Input value={values.nickname} onChange={set('nickname')} />
            </Field>
            <Field label="Sexo" className="c2">
              <Select value={values.gender} onChange={set('gender')} placeholder="—" options={[{ value: 'F', label: 'Feminino' }, { value: 'M', label: 'Masculino' }, { value: 'O', label: 'Outro' }]} />
            </Field>
            <Field label="RG" className="c3">
              <Input value={values.rg} onChange={set('rg')} />
            </Field>
            <Field label="Profissão" className="c3">
              <Input value={values.occupation} onChange={set('occupation')} />
            </Field>
            <Field label="Como conheceu a ótica" className="c4">
              <Select value={values.origin} onChange={set('origin')} placeholder="—" options={ORIGINS} />
            </Field>
            <Field label="Próximo contato" className="c4" hint="Gera uma tarefa na data">
              <Input type="date" value={values.next_contact_date} onChange={set('next_contact_date')} />
            </Field>
            <Field label="Observações" className="span-full">
              <Textarea value={values.notes} onChange={set('notes')} rows={3} />
            </Field>
          </>
        )}
      </form>
    </Modal>
  );
}
