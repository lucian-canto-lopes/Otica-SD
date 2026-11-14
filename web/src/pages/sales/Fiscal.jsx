import { useState } from 'react';
import { Download, FileText, RotateCcw } from 'lucide-react';
import { api, apiUrl } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { dateTime, money } from '../../lib/format.js';
import { Badge, Button, Card, Empty, Loading, PageHeader, useToast } from '../../components/ui.jsx';

const statusLabel = { simulated: 'Simulada', cancelled: 'Simulação cancelada', authorized: 'Autorizada', rejected: 'Rejeitada' };

export default function Fiscal() {
  const { data, loading, reload } = useApi('fiscal');
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const rows = data?.data || [];
  const cancel = async (row) => {
    if (!window.confirm(`Cancelar a simulação da venda ${row.sale_number}?`)) return;
    try { await api.patch('fiscal', {}, { id: row.id }); toast.success('Simulação cancelada'); reload(); }
    catch (error) { toast.error(error); }
  };
  return <div className="stack lg">
    <PageHeader title="Documentos fiscais de teste" subtitle="Emissões simuladas, sem transmissão à SEFAZ e sem validade fiscal." />
    <Card title="Histórico de simulações" bodyClass={null}>
      {loading ? <Loading /> : rows.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Número teste</th><th>Venda</th><th>Cliente</th><th>Data</th><th>Total</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.series}/{row.number} · modelo {row.model}</td><td><a href={`#/vendas/${row.sale_id}`}>#{row.sale_number}</a></td><td>{row.client_name || 'Consumidor não identificado'}</td><td>{dateTime(row.created_at)}</td><td>{money(row.total)}</td><td><Badge tone={row.status === 'simulated' ? 'warning' : ''}>{statusLabel[row.status] || row.status}</Badge></td><td className="row"><a className="btn icon" href={apiUrl('fiscal_xml', { id: row.id })} title="Baixar XML"><FileText size={16}/></a><a className="btn icon" href={apiUrl('fiscal_pdf', { id: row.id })} title="Baixar PDF"><Download size={16}/></a>{row.status === 'simulated' && <Button variant="ghost" icon={RotateCcw} title="Cancelar simulação" onClick={() => cancel(row)}/>}</td></tr>)}</tbody></table></div> : <Empty title="Nenhum documento fiscal de teste" description="As simulações feitas nas vendas aparecerão aqui." />}
    </Card>
    <p className="hint">Este módulo não gera notas fiscais válidas. XML e PDF exibem aviso de teste e são criados localmente.</p>
  </div>;
}
