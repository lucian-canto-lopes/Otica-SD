import { useState } from 'react';
import { Download, FileText, RotateCcw } from 'lucide-react';
import { api, apiUrl } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { useSession } from '../../lib/session.jsx';
import { dateTime, money } from '../../lib/format.js';
import { Badge, Button, Card, Empty, Loading, PageHeader, useToast } from '../../components/ui.jsx';

const statusLabel = { simulated: 'Simulada', cancelled: 'Simulação cancelada' };

export default function Fiscal() {
  const { can } = useSession();
  const { data, error, loading, reload } = useApi('fiscal');
  const toast = useToast();
  const [cancellingId, setCancellingId] = useState(null);
  const rows = data?.data || [];

  const cancel = async (row) => {
    if (!window.confirm('Cancelar a simulação da venda ' + row.sale_number + '?')) return;
    setCancellingId(row.id);
    try {
      await api.patch('fiscal', {}, { id: row.id });
      toast.success('Simulação cancelada');
      reload();
    } catch (requestError) {
      toast.error(requestError);
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="stack lg">
      <PageHeader
        title="Simulações fiscais · NF-e modelo 55"
        subtitle="Prévias locais sem assinatura, transmissão à SEFAZ ou valor fiscal."
      />
      <Card title="Histórico de simulações" bodyClass={null}>
        {loading && !data ? <Loading /> : error ? (
          <div className="card-body stack" role="alert">
            <p className="error-text">Não foi possível carregar o histórico fiscal: {error.message}</p>
            <div><Button onClick={reload}>Tentar novamente</Button></div>
          </div>
        ) : rows.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Número de teste</th>
                  <th>Venda</th>
                  <th>Cliente</th>
                  <th>Data</th>
                  <th>Total</th>
                  <th>Situação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>Série {row.series} · nº {row.number} · modelo {row.model}</td>
                    <td><a href={'#/vendas/' + row.sale_id}>#{row.sale_number}</a></td>
                    <td>{row.client_name || 'Consumidor não identificado'}</td>
                    <td>{dateTime(row.created_at)}</td>
                    <td>{money(row.total)}</td>
                    <td><Badge tone={row.status === 'simulated' ? 'warning' : ''}>{statusLabel[row.status] || row.status}</Badge></td>
                    <td>
                      <div className="row wrap">
                        <a className="btn icon" href={apiUrl('fiscal_xml', { id: row.id })} title="Baixar XML de teste" aria-label={'Baixar XML de teste da venda ' + row.sale_number}><FileText size={16} /></a>
                        <a className="btn icon" href={apiUrl('fiscal_pdf', { id: row.id })} title="Baixar PDF de teste" aria-label={'Baixar PDF de teste da venda ' + row.sale_number}><Download size={16} /></a>
                        {row.status === 'simulated' && can('finance') && (
                          <Button
                            variant="ghost"
                            icon={RotateCcw}
                            title="Cancelar simulação"
                            aria-label={'Cancelar simulação da venda ' + row.sale_number}
                            loading={cancellingId === row.id}
                            onClick={() => cancel(row)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Nenhuma simulação fiscal">Crie uma simulação NF-e 55 no detalhe de uma venda.</Empty>
        )}
      </Card>
      <p className="hint">As novas prévias XML seguem a estrutura NF-e 4.00 conferida com XSD, mas não contêm assinatura digital. Os arquivos permanecem disponíveis após o cancelamento da simulação e não são notas fiscais válidas.</p>
    </div>
  );
}
