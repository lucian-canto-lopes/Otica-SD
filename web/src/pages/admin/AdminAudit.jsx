import { useApi } from '../../lib/hooks.js';
import { PageHeader } from '../../components/ui.jsx';
import { AuditTable } from '../Audit.jsx';

export default function AdminAudit() {
  const companies = useApi('admin_companies', { per_page: 500 });
  return (
    <div className="stack">
      <PageHeader title="Auditoria geral" subtitle="Atividade de todas as óticas e da administração da plataforma." />
      <AuditTable action="admin_audit" showCompany companies={companies.data?.data || []} />
    </div>
  );
}
