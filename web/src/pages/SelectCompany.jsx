import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, LogOut } from 'lucide-react';
import { useSession } from '../lib/session.jsx';
import { Badge, Button, Empty, PageHeader, SearchInput, useToast } from '../components/ui.jsx';
import { COMPANY_STATUS, ROLE_LABELS } from '../lib/constants.js';
import { initials } from '../lib/format.js';

export default function SelectCompany({ embedded }) {
  const { companies, selectCompany, logout, user, logoUrl } = useSession();
  const [term, setTerm] = useState('');
  const navigate = useNavigate();
  const toast = useToast();
  const filtered = companies.filter((c) => `${c.name} ${c.trade_name}`.toLowerCase().includes(term.toLowerCase()));

  const choose = async (company) => {
    try {
      await selectCompany(company.id);
      navigate('/');
    } catch (error) {
      toast.error(error);
    }
  };

  const content = (
    <div className="stack" style={{ maxWidth: 560, width: '100%', margin: '0 auto' }}>
      <PageHeader title="Escolha a ótica" subtitle={`Olá, ${user?.name?.split(' ')[0] || ''}! Você tem acesso a ${companies.length} ótica(s).`} />
      {companies.length > 6 && <SearchInput value={term} onChange={setTerm} placeholder="Buscar ótica…" autoFocus />}
      {filtered.map((company) => {
        const logo = logoUrl(company);
        return (
          <button key={company.id} type="button" className="company-card" onClick={() => choose(company)}>
            {logo ? <img src={logo} alt="" /> : <span className="brand-mark" style={{ background: company.primary_color }}>{initials(company.trade_name || company.name)}</span>}
            <div className="grow">
              <strong>{company.trade_name || company.name}</strong>
              <div className="subtle">{ROLE_LABELS[company.role] || company.role}</div>
            </div>
            {company.status !== 'active' && <Badge tone={COMPANY_STATUS[company.status]?.tone}>{COMPANY_STATUS[company.status]?.label}</Badge>}
          </button>
        );
      })}
      {!companies.length && (
        <Empty icon={Building2} title="Nenhuma ótica vinculada">
          Peça ao responsável pela ótica ou ao administrador da plataforma para liberar seu acesso.
        </Empty>
      )}
      {!embedded && (
        <Button variant="ghost" icon={LogOut} onClick={logout}>
          Sair
        </Button>
      )}
    </div>
  );
  return embedded ? content : <div style={{ padding: '48px 16px' }}>{content}</div>;
}
