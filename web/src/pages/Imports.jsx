import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { dateTime, number } from '../lib/format.js';
import { useSession } from '../lib/session.jsx';
import { Badge, Button, Card, Checkbox, DataTable, Empty, Field, Loading, PageHeader, Select, useToast } from '../components/ui.jsx';

const ENTITIES = {
  clients: { label: 'Clientes', step: 1, hint: 'Comece pelos clientes: as vendas e receitas são ligadas a eles pelo código ou CPF.' },
  products: { label: 'Produtos e estoque', step: 2, hint: 'Armações, lentes e acessórios com preço e saldo atual.' },
  partners: { label: 'Fornecedores e laboratórios', step: 2, hint: 'Opcional: fornecedores também são criados automaticamente pelo nome na importação de produtos.' },
  sales: { label: 'Vendas (pedidos)', step: 3, hint: 'Cabeçalho de cada venda: código, data, cliente e valores.' },
  sale_items: { label: 'Itens das vendas', step: 4, hint: 'Itens ligados à venda pelo código. Importe depois das vendas. Não altera o estoque.' },
  prescriptions: { label: 'Receitas', step: 4, hint: 'Graus OD/OE ligados ao cliente pelo código, CPF ou nome.' },
};

// Sinônimos comuns em exportações de outros sistemas.
const SYNONYMS = {
  legacy_id: ['codigo', 'cod', 'id', 'codcliente', 'codigocliente', 'codproduto', 'codvenda', 'codigovenda', 'idcliente', 'idproduto', 'idvenda'],
  name: ['nome', 'nomecliente', 'cliente', 'razaosocial', 'descricao', 'produto', 'nomecompleto', 'fornecedor'],
  nickname: ['apelido', 'nomefantasia'],
  cpf: ['cpf', 'cpfcnpj', 'documento'],
  rg: ['rg', 'identidade'],
  birth_date: ['nascimento', 'datanascimento', 'dtnasc', 'dtnascimento', 'aniversario', 'datadenascimento'],
  gender: ['sexo', 'genero'],
  phone: ['telefone', 'fone', 'fone1', 'telefone1', 'telefonefixo', 'fixo'],
  whatsapp: ['celular', 'whatsapp', 'whats', 'fone2', 'telefone2', 'telefonecelular', 'cel'],
  email: ['email', 'e-mail', 'correio'],
  zip: ['cep'],
  address: ['endereco', 'logradouro', 'rua'],
  number: ['numero', 'num', 'nro'],
  complement: ['complemento'],
  neighborhood: ['bairro'],
  city: ['cidade', 'municipio'],
  state: ['uf', 'estado'],
  occupation: ['profissao', 'ocupacao'],
  notes: ['observacao', 'observacoes', 'obs'],
  tags: ['etiquetas', 'tags', 'grupo', 'categoria cliente'],
  created_at: ['datacadastro', 'cadastro', 'dtcadastro', 'datadecadastro'],
  sku: ['referencia', 'ref', 'codigo', 'codproduto', 'sku'],
  barcode: ['codigobarras', 'ean', 'codbarras', 'gtin'],
  category: ['categoria', 'grupo', 'tipo', 'familia'],
  brand: ['marca', 'grife', 'fabricante'],
  model: ['modelo'],
  color: ['cor'],
  cost: ['custo', 'precocusto', 'valorcusto', 'precodecusto'],
  price: ['preco', 'precovenda', 'valorvenda', 'valor', 'precodevenda', 'vlvenda'],
  stock: ['estoque', 'saldo', 'quantidade', 'qtdestoque', 'qtd'],
  min_stock: ['estoqueminimo', 'minimo'],
  supplier: ['fornecedor'],
  sale_date: ['data', 'datavenda', 'dtvenda', 'emissao', 'datadavenda', 'dataemissao'],
  delivery_date: ['entrega', 'dataentrega', 'previsaoentrega'],
  client_legacy_id: ['codcliente', 'codigocliente', 'idcliente', 'cliente_id'],
  client_cpf: ['cpfcliente', 'cpf'],
  client_name: ['cliente', 'nomecliente'],
  subtotal: ['subtotal', 'valorbruto'],
  discount: ['desconto', 'valordesconto', 'vldesconto'],
  total: ['total', 'valortotal', 'valorliquido', 'vltotal'],
  paid: ['pago', 'valorpago', 'entrada', 'recebido'],
  payment_terms: ['formapagamento', 'pagamento', 'condicaopagamento', 'formadepagamento'],
  status: ['situacao', 'status'],
  sale_legacy_id: ['codvenda', 'codigovenda', 'idvenda', 'venda', 'pedido', 'numeropedido'],
  product_legacy_id: ['codproduto', 'idproduto', 'codigoproduto'],
  product_sku: ['referencia', 'ref', 'sku'],
  description: ['descricao', 'produto', 'item'],
  quantity: ['quantidade', 'qtd', 'qtde', 'quant'],
  unit_price: ['precounitario', 'valorunitario', 'vlunitario', 'unitario', 'preco'],
  prescribed_at: ['datareceita', 'data'],
  expires_at: ['validade', 'vencimento'],
  doctor: ['medico', 'oftalmologista'],
};

const normalize = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

function autoMap(headers, fields) {
  const mapping = {};
  const used = new Set();
  const candidates = Object.entries(fields).map(([key, label]) => [key, [key, label.replace('*', ''), ...(SYNONYMS[key] || [])].map(normalize)]);
  // Primeiro correspondências exatas, depois parciais.
  for (const exact of [true, false]) {
    for (const header of headers) {
      if (mapping[header]) continue;
      const h = normalize(header);
      const match = candidates.find(([key, names]) => !used.has(key) && names.some((n) => (exact ? n === h : n.length > 3 && (h.includes(n) || n.includes(h)))));
      if (match) {
        mapping[header] = match[0];
        used.add(match[0]);
      }
    }
  }
  return mapping;
}

function cellValue(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const d = new Date(value.getTime() + 12 * 3600 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  return value === null || value === undefined ? '' : value;
}

async function parseFile(file) {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  let workbook;
  if (/\.(csv|txt)$/i.test(file.name)) {
    let text = new TextDecoder('utf-8').decode(buffer);
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buffer);
    workbook = XLSX.read(text.replace(/^﻿/, ''), { type: 'string', raw: true, codepage: 65001 });
  } else {
    workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return { headers, rows: rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, cellValue(v)]))) };
}

function downloadErrors(errors, filename) {
  const lines = ['linha;erro', ...errors.map((e) => `${e.row};"${String(e.error).replace(/"/g, '""')}"`)];
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `erros-${filename || 'importacao'}.csv`;
  link.click();
}

export default function Imports() {
  const { can } = useSession();
  const toast = useToast();
  const meta = useApi('imports');
  const fileInput = useRef(null);
  const [entity, setEntity] = useState('clients');
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [mapping, setMapping] = useState({});
  const [updateExisting, setUpdateExisting] = useState(true);
  const [progress, setProgress] = useState(null);
  const [summary, setSummary] = useState(null);
  const [parsing, setParsing] = useState(false);
  const fields = meta.data?.fields?.[entity] || {};

  const choose = async (selected) => {
    if (!selected) return;
    setParsing(true);
    setSummary(null);
    try {
      const result = await parseFile(selected);
      if (!result.rows.length) throw new Error('A planilha está vazia ou sem cabeçalho na primeira linha.');
      setFile(selected);
      setParsed(result);
      setMapping(autoMap(result.headers, fields));
    } catch (error) {
      toast.error(error.message || 'Não foi possível ler o arquivo.');
    } finally {
      setParsing(false);
    }
  };

  const changeEntity = (next) => {
    setEntity(next);
    setSummary(null);
    if (parsed) setMapping(autoMap(parsed.headers, meta.data?.fields?.[next] || {}));
  };

  const required = useMemo(() => Object.entries(fields).filter(([, label]) => label.includes('*')).map(([key]) => key), [fields]);
  const mappedFields = Object.values(mapping).filter(Boolean);
  const missing = required.filter((key) => !mappedFields.includes(key));

  const start = async () => {
    const rows = parsed.rows.map((row) => {
      const out = {};
      for (const [header, field] of Object.entries(mapping)) {
        if (field) out[field] = typeof row[header] === 'string' ? row[header].trim() : row[header];
      }
      return out;
    });
    const chunkSize = 500;
    let importId = null;
    const totals = { created: 0, updated: 0, failed: 0, errors: [] };
    setProgress({ done: 0, total: rows.length });
    try {
      for (let offset = 0; offset < rows.length; offset += chunkSize) {
        const chunk = rows.slice(offset, offset + chunkSize);
        const result = await api.post('imports', {
          entity,
          rows: chunk,
          filename: file.name,
          import_id: importId,
          offset,
          last_chunk: offset + chunkSize >= rows.length,
          update_existing: updateExisting,
        });
        importId = result.import_id;
        totals.created += result.created;
        totals.updated += result.updated;
        totals.failed += result.failed;
        totals.errors.push(...result.errors);
        setProgress({ done: Math.min(rows.length, offset + chunk.length), total: rows.length });
      }
      setSummary(totals);
      toast.success('Importação concluída');
      meta.reload();
    } catch (error) {
      toast.error(error);
      setSummary({ ...totals, interrupted: true });
    } finally {
      setProgress(null);
    }
  };

  if (!can('manage')) return <Empty title="Acesso restrito">Somente o proprietário ou gerente pode importar dados.</Empty>;
  if (meta.loading && !meta.data) return <Loading />;

  return (
    <>
      <PageHeader title="Importação de dados" subtitle="Traga clientes, produtos, vendas e receitas de outro sistema a partir de planilhas Excel ou CSV." />
      <div className="grid cols-3" style={{ alignItems: 'start' }}>
        <div className="stack lg span-2">
          <Card title="1. O que vai importar?">
            <div className="stack">
              <div className="chips">
                {Object.entries(ENTITIES).map(([key, e]) => (
                  <button key={key} type="button" className={`chip ${entity === key ? 'active' : ''}`} onClick={() => changeEntity(key)}>
                    <Badge>{e.step}</Badge> {e.label}
                  </button>
                ))}
              </div>
              <p className="muted">{ENTITIES[entity].hint}</p>
              <p className="subtle">Ordem recomendada: clientes → produtos → vendas → itens das vendas → receitas. Reimportar o mesmo arquivo atualiza os registros pelo código, sem duplicar.</p>
            </div>
          </Card>

          <Card title="2. Arquivo">
            <div className="dropzone" onClick={() => fileInput.current.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), choose(e.dataTransfer.files[0]))}>
              {parsing ? (
                <Loading inline />
              ) : (
                <div className="stack sm" style={{ alignItems: 'center' }}>
                  <FileSpreadsheet size={30} strokeWidth={1.5} />
                  <strong>{file ? file.name : 'Selecione ou arraste a planilha (.xlsx, .xls ou .csv)'}</strong>
                  {parsed && <span className="subtle">{number(parsed.rows.length)} linha(s) · {parsed.headers.length} coluna(s)</span>}
                </div>
              )}
              <input ref={fileInput} type="file" hidden accept=".xlsx,.xls,.csv,.txt" onChange={(e) => (choose(e.target.files[0]), (e.target.value = ''))} />
            </div>
          </Card>

          {parsed && (
            <Card title="3. Relacione as colunas" bodyClass={null}>
              <div className="table-wrap">
                <table className="table compact">
                  <thead>
                    <tr>
                      <th>Coluna da planilha</th>
                      <th>Exemplo</th>
                      <th style={{ minWidth: 220 }}>Campo no Ocular</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.headers.map((header) => (
                      <tr key={header}>
                        <td><strong>{header}</strong></td>
                        <td className="subtle truncate" style={{ maxWidth: 220 }}>{String(parsed.rows.find((r) => r[header] !== '')?.[header] ?? '')}</td>
                        <td>
                          <Select
                            className="sm"
                            placeholder="— ignorar —"
                            value={mapping[header] || ''}
                            onChange={(e) => setMapping((m) => ({ ...m, [header]: e.target.value }))}
                            options={Object.entries(fields).map(([value, label]) => ({ value, label: mappedFields.includes(value) && mapping[header] !== value ? `${label} (já usado)` : label }))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="card-body stack">
                {missing.length > 0 && <span className="error-text">Relacione os campos obrigatórios: {missing.map((k) => fields[k].replace(' *', '')).join(', ')}.</span>}
                <Checkbox label="Atualizar registros que já existem (mesmo código ou CPF)" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
                {progress ? (
                  <div className="stack sm">
                    <div className="progress"><div style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
                    <span className="subtle">Importando {number(progress.done)} de {number(progress.total)}…</span>
                  </div>
                ) : (
                  <div className="row end">
                    <Button variant="primary" icon={Upload} disabled={missing.length > 0} onClick={start}>
                      Importar {number(parsed.rows.length)} linha(s)
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          )}

          {summary && (
            <Card title={summary.interrupted ? 'Importação interrompida' : 'Resultado'}>
              <div className="stack">
                <div className="grid kpis">
                  <div><div className="kpi-label"><CheckCircle2 size={15} /> Novos</div><div className="kpi-value">{number(summary.created)}</div></div>
                  <div><div className="kpi-label">Atualizados</div><div className="kpi-value">{number(summary.updated)}</div></div>
                  <div><div className="kpi-label">Com erro</div><div className="kpi-value" style={{ color: summary.failed ? 'var(--danger)' : undefined }}>{number(summary.failed)}</div></div>
                </div>
                {summary.errors.length > 0 && (
                  <>
                    <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
                      <table className="table compact">
                        <thead><tr><th>Linha</th><th>Erro</th></tr></thead>
                        <tbody>
                          {summary.errors.slice(0, 200).map((e, i) => (
                            <tr key={i}><td className="mono">{e.row}</td><td>{e.error}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div><Button icon={Download} onClick={() => downloadErrors(summary.errors, file?.name)}>Baixar lista de erros</Button></div>
                  </>
                )}
              </div>
            </Card>
          )}
        </div>

        <Card title="Campos disponíveis">
          <div className="stack sm">
            {Object.entries(fields).map(([key, label]) => (
              <div key={key} className="row between" style={{ fontSize: 13 }}>
                <span>{label}</span>
                {mappedFields.includes(key) && <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />}
              </div>
            ))}
            <p className="subtle" style={{ marginTop: 8 }}>Datas em DD/MM/AAAA ou AAAA-MM-DD. Valores aceitam vírgula decimal (1.234,56). Telefones são normalizados para o WhatsApp.</p>
          </div>
        </Card>
      </div>

      <Card title="Histórico de importações" bodyClass={null} style={{ marginTop: 16 }}>
        <DataTable
          rows={meta.data?.history}
          empty={<Empty title="Nenhuma importação ainda" />}
          columns={[
            { key: 'created_at', label: 'Quando', render: (r) => dateTime(r.created_at) },
            { key: 'entity', label: 'Tipo', render: (r) => ENTITIES[r.entity]?.label || r.entity },
            { key: 'filename', label: 'Arquivo', render: (r) => <span className="truncate">{r.filename}</span> },
            { key: 'result', label: 'Resultado', render: (r) => <span className="subtle">{r.total} linhas · {r.created} novos · {r.updated} atualizados · {r.failed} erros</span> },
            { key: 'user_name', label: 'Por' },
          ]}
          mobile={(r) => (
            <div className="grow">
              <strong>{ENTITIES[r.entity]?.label}</strong> <span className="subtle">{dateTime(r.created_at)}</span>
              <div className="subtle">{r.created} novos · {r.updated} atualizados · {r.failed} erros</div>
            </div>
          )}
        />
      </Card>
    </>
  );
}
