import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader, Tabs } from '../../components/ui.jsx';
import { useSession } from '../../lib/session.jsx';
import { CompanyTab, DocumentsTab, PlanTab } from './CompanyTabs.jsx';
import { ReasonsTab, TagsTab, TeamTab } from './TeamTabs.jsx';
import ChannelsTab from './ChannelsTab.jsx';
import TemplatesTab from './TemplatesTab.jsx';
import IntegrationsTab from './IntegrationsTab.jsx';

const TABS = [
  { key: 'otica', label: 'Ótica', component: CompanyTab },
  { key: 'documentos', label: 'Documentos e numeração', component: DocumentsTab },
  { key: 'equipe', label: 'Equipe', component: TeamTab },
  { key: 'etiquetas', label: 'Etiquetas', component: TagsTab },
  { key: 'motivos', label: 'Motivos de não compra', component: ReasonsTab },
  { key: 'canais', label: 'Canais de mensagem', component: ChannelsTab },
  { key: 'modelos', label: 'Modelos de mensagem', component: TemplatesTab },
  { key: 'integracoes', label: 'Integrações', component: IntegrationsTab },
  { key: 'plano', label: 'Plano', component: PlanTab },
];

export default function Settings() {
  const { tab = 'otica' } = useParams();
  const navigate = useNavigate();
  const { can } = useSession();
  const active = TABS.find((t) => t.key === tab) || TABS[0];
  const Component = active.component;
  return (
    <div className="stack">
      <PageHeader title="Configurações" subtitle={can('manage') ? 'Dados da ótica, equipe, canais de atendimento e integrações.' : 'Somente proprietários e gerentes podem alterar as configurações.'} />
      <Tabs tabs={TABS} active={active.key} onChange={(key) => navigate(`/configuracoes/${key}`)} />
      <Component />
    </div>
  );
}
