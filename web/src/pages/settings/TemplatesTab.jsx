import { useRef, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { invalidate, useApi } from '../../lib/hooks.js';
import { useSession } from '../../lib/session.jsx';
import { TEMPLATE_VARIABLES } from '../../lib/constants.js';
import { Badge, Button, Card, Empty, Field, Input, Loading, Modal, Select, useConfirm, useToast } from '../../components/ui.jsx';

const CATEGORIES = [
  { value: 'marketing', label: 'Marketing' },
  { value: 'relacionamento', label: 'Relacionamento' },
  { value: 'servico', label: 'Serviço / avisos' },
];

/** Prévia com valores de exemplo para as variáveis. */
function preview(body, companyName) {
  const sample = {
    primeiro_nome: 'Maria',
    nome: 'Maria Oliveira',
    apelido: 'Maria',
    otica: companyName,
    telefone_otica: '(93) 99999-0000',
    ultima_compra: '10/03/2026',
    vencimento_receita: '15/11/2026',
    aniversario: '20/10/1985',
    cidade: 'Santarém',
  };
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key) => sample[key.toLowerCase()] ?? match);
}

export default function TemplatesTab() {
  const { can, company } = useSession();
  const canEdit = can('crm');
  const { data, loading, reload } = useApi('templates');
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const textarea = useRef(null);

  const insertVariable = (variable) => {
    const el = textarea.current;
    const body = editing.body || '';
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    setEditing((t) => ({ ...t, body: body.slice(0, start) + variable + body.slice(end) }));
    setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(start + variable.length, start + variable.length);
    });
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editing.id) await api.patch('templates', editing, { id: editing.id });
      else await api.post('templates', editing);
      invalidate('templates');
      toast.success('Modelo salvo');
      setEditing(null);
      reload();
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (template) => {
    if (!(await confirm({ message: `Excluir o modelo "${template.name}"?`, danger: true, confirmLabel: 'Excluir' }))) return;
    await api.del('templates', { id: template.id });
    invalidate('templates');
    reload();
  };

  if (loading && !data) return <Loading />;
  return (
    <Card
      title="Modelos de mensagem"
      actions={
        canEdit && (
          <Button size="sm" variant="primary" icon={Plus} onClick={() => setEditing({ name: '', category: 'marketing', body: '', meta_template_name: '', meta_language: 'pt_BR' })}>
            Novo modelo
          </Button>
        )
      }
    >
      {data?.length ? (
        <div className="grid cols-2">
          {data.map((template) => (
            <div key={template.id} className="card card-body stack sm" style={{ boxShadow: 'none' }}>
              <div className="row between">
                <span className="row">
                  <strong>{template.name}</strong>
                  <Badge>{CATEGORIES.find((c) => c.value === template.category)?.label || template.category}</Badge>
                  {template.meta_template_name && <Badge tone="info">Meta: {template.meta_template_name}</Badge>}
                </span>
                {canEdit && (
                  <span className="row">
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(template)} aria-label="Editar" />
                    <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(template)} aria-label="Excluir" />
                  </span>
                )}
              </div>
              <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>
                {template.body}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <Empty title="Nenhum modelo cadastrado" />
      )}

      <Modal
        open={Boolean(editing)}
        size="lg"
        title={editing?.id ? 'Editar modelo' : 'Novo modelo'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="template-form" loading={saving}>
              Salvar
            </Button>
          </>
        }
      >
        {editing && (
          <form id="template-form" className="form-grid" onSubmit={save}>
            <Field label="Nome *" className="c8">
              <Input required value={editing.name} onChange={(e) => setEditing((t) => ({ ...t, name: e.target.value }))} />
            </Field>
            <Field label="Categoria" className="c4">
              <Select options={CATEGORIES} value={editing.category} onChange={(e) => setEditing((t) => ({ ...t, category: e.target.value }))} />
            </Field>
            <Field label="Texto da mensagem *" hint="Clique numa variável para inserir no texto.">
              <div className="chips" style={{ marginBottom: 6 }}>
                {TEMPLATE_VARIABLES.map(([variable, label]) => (
                  <button key={variable} type="button" className="chip" onClick={() => insertVariable(variable)} title={variable}>
                    {label}
                  </button>
                ))}
              </div>
              <textarea ref={textarea} className="textarea" required rows={6} value={editing.body} onChange={(e) => setEditing((t) => ({ ...t, body: e.target.value }))} />
            </Field>
            {editing.body && (
              <Field label="Prévia">
                <div className="bubble out" style={{ maxWidth: '100%' }}>
                  {preview(editing.body, company?.trade_name || company?.name || 'Sua ótica')}
                </div>
              </Field>
            )}
            <div className="form-section">API oficial da Meta (opcional)</div>
            <p className="subtle">
              Fora da janela de 24 horas, a Meta só permite enviar modelos aprovados. Informe o nome do modelo aprovado no WhatsApp Manager; o texto personalizado acima é enviado como
              parâmetro {'{{1}}'}.
            </p>
            <Field label="Nome do modelo na Meta" className="c8">
              <Input value={editing.meta_template_name} onChange={(e) => setEditing((t) => ({ ...t, meta_template_name: e.target.value }))} />
            </Field>
            <Field label="Idioma" className="c4">
              <Input value={editing.meta_language} onChange={(e) => setEditing((t) => ({ ...t, meta_language: e.target.value }))} />
            </Field>
          </form>
        )}
      </Modal>
    </Card>
  );
}
