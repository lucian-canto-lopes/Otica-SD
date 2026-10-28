import { useApi } from '../../lib/hooks.js';
import { MONTH_NAMES } from '../../lib/format.js';
import { QUOTE_STATUS } from '../../lib/constants.js';
import { Checkbox, Field, Input, Select } from '../../components/ui.jsx';

/** Remove filtros vazios antes de enviar à API. */
export function cleanFilters(filters) {
  return Object.fromEntries(
    Object.entries(filters || {}).filter(
      ([k, v]) => v !== '' && v !== null && v !== undefined && (v !== false || k === 'require_consent') && !(Array.isArray(v) && !v.length),
    ),
  );
}

function MultiChips({ options, value = [], onChange }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o.value} type="button" className={`chip ${value.includes(o.value) ? 'active' : ''}`} onClick={() => toggle(o.value)} style={o.color && value.includes(o.value) ? { borderColor: o.color, color: o.color } : undefined}>
          {o.label}
        </button>
      ))}
      {!options.length && <span className="subtle">Nenhuma opção cadastrada.</span>}
    </div>
  );
}

/**
 * Filtros de clientes no mesmo formato aceito por buildClientFilter no back-end.
 * showConsent: exibe a opção de exigir aceite de mensagens (campanhas).
 */
export default function AudienceFilters({ value, onChange, showConsent = false }) {
  const tags = useApi('tags');
  const reasons = useApi('loss_reasons');
  const v = value || {};
  const set = (key, val) => onChange({ ...v, [key]: val });
  const bind = (key) => ({ value: v[key] ?? '', onChange: (e) => set(key, e.target.value) });
  const tagOptions = (tags.data || []).map((t) => ({ value: t.id, label: t.name, color: t.color }));

  return (
    <div className="stack">
      <Field label="Com alguma destas etiquetas">
        <MultiChips options={tagOptions} value={v.tags_any || []} onChange={(val) => set('tags_any', val)} />
      </Field>
      <Field label="Sem estas etiquetas">
        <MultiChips options={tagOptions} value={v.tags_none || []} onChange={(val) => set('tags_none', val)} />
      </Field>
      <Field label="Mês de aniversário">
        <MultiChips options={MONTH_NAMES.map((m, i) => ({ value: i + 1, label: m.slice(0, 3) }))} value={(v.birth_month || []).map(Number)} onChange={(val) => set('birth_month', val)} />
      </Field>
      <div className="filter-panel">
        <Field label="Aniversário">
          <Select placeholder="Qualquer data" {...bind('birthday_window')} options={[{ value: 'today', label: 'Hoje' }, { value: 'week', label: 'Próximos 7 dias' }, { value: 'this_month', label: 'Neste mês' }, { value: 'next_30', label: 'Próximos 30 dias' }]} />
        </Field>
        <Field label="Idade mínima"><Input type="number" min="0" {...bind('age_min')} /></Field>
        <Field label="Idade máxima"><Input type="number" min="0" {...bind('age_max')} /></Field>
        <Field label="Cidade"><Input {...bind('city')} placeholder="Ex.: Santarém" /></Field>
        <Field label="Bairro"><Input {...bind('neighborhood')} /></Field>
        <Field label="Sexo">
          <Select placeholder="Todos" {...bind('gender')} options={[{ value: 'F', label: 'Feminino' }, { value: 'M', label: 'Masculino' }]} />
        </Field>
        <Field label="Tipo">
          <Select placeholder="Clientes e leads" {...bind('kind')} options={[{ value: 'client', label: 'Somente clientes' }, { value: 'lead', label: 'Somente leads' }]} />
        </Field>
        <Field label="Sem comprar há (dias)" hint="Clientes inativos"><Input type="number" min="1" {...bind('no_purchase_days')} placeholder="Ex.: 365" /></Field>
        <Field label="Comprou a partir de"><Input type="date" {...bind('purchased_from')} /></Field>
        <Field label="Comprou até"><Input type="date" {...bind('purchased_to')} /></Field>
        <Field label="Total comprado mínimo (R$)"><Input inputMode="decimal" {...bind('total_spent_min')} /></Field>
        <Field label="Nº mínimo de compras"><Input type="number" min="1" {...bind('sales_count_min')} /></Field>
        <Field label="Comprou produto/marca"><Input {...bind('bought_product')} placeholder="Ex.: Varilux, Ray-Ban" /></Field>
        <Field label="Receita vence em até (dias)"><Input type="number" min="1" {...bind('prescription_expiring_days')} placeholder="Ex.: 30" /></Field>
        <Field label="Com orçamento">
          <Select placeholder="Indiferente" value={(v.quote_status || [])[0] || ''} onChange={(e) => set('quote_status', e.target.value ? [e.target.value] : [])} options={Object.entries(QUOTE_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
        </Field>
        <Field label="Não comprou pelo motivo">
          <Select placeholder="Indiferente" value={(v.lost_reason_id || [])[0] || ''} onChange={(e) => set('lost_reason_id', e.target.value ? [Number(e.target.value)] : [])} options={(reasons.data || []).map((r) => ({ value: r.id, label: r.name }))} />
        </Field>
        <Field label="Sem contato há (dias)"><Input type="number" min="1" {...bind('no_interaction_days')} /></Field>
        <Field label="Origem"><Input {...bind('origin')} placeholder="Ex.: Instagram" /></Field>
      </div>
      <div className="row wrap" style={{ gap: 16 }}>
        <Checkbox label="Nunca compraram" checked={Boolean(v.never_purchased)} onChange={(e) => set('never_purchased', e.target.checked ? 1 : '')} />
        {!showConsent && (
          <Select style={{ width: 220 }} placeholder="Aceite de mensagens: todos" value={v.consent ?? ''} onChange={(e) => set('consent', e.target.value)} options={[{ value: '1', label: 'Aceitam mensagens' }, { value: '0', label: 'Não aceitam' }]} />
        )}
        {showConsent && (
          <Checkbox
            label="Somente clientes que autorizaram mensagens (recomendado — LGPD)"
            checked={v.require_consent !== false}
            onChange={(e) => onChange({ ...v, require_consent: e.target.checked ? undefined : false })}
          />
        )}
      </div>
    </div>
  );
}
