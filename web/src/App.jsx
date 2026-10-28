import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './lib/session.jsx';
import { Loading } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import SelectCompany from './pages/SelectCompany.jsx';

// Cada tela é carregada sob demanda para manter a abertura do sistema rápida.
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const ClientsList = lazy(() => import('./pages/clients/ClientsList.jsx'));
const ClientsOverview = lazy(() => import('./pages/clients/ClientsOverview.jsx'));
const ClientDetail = lazy(() => import('./pages/clients/ClientDetail.jsx'));
const Products = lazy(() => import('./pages/catalog/Products.jsx'));
const ProductDetail = lazy(() => import('./pages/catalog/ProductDetail.jsx'));
const Stock = lazy(() => import('./pages/catalog/Stock.jsx'));
const Partners = lazy(() => import('./pages/catalog/Partners.jsx'));
const Quotes = lazy(() => import('./pages/sales/Quotes.jsx'));
const QuoteEditor = lazy(() => import('./pages/sales/QuoteEditor.jsx'));
const QuoteDetail = lazy(() => import('./pages/sales/QuoteDetail.jsx'));
const Sales = lazy(() => import('./pages/sales/Sales.jsx'));
const SaleEditor = lazy(() => import('./pages/sales/SaleEditor.jsx'));
const SaleDetail = lazy(() => import('./pages/sales/SaleDetail.jsx'));
const ServiceOrders = lazy(() => import('./pages/orders/ServiceOrders.jsx'));
const ServiceOrderEditor = lazy(() => import('./pages/orders/ServiceOrderEditor.jsx'));
const ServiceOrderDetail = lazy(() => import('./pages/orders/ServiceOrderDetail.jsx'));
const Inbox = lazy(() => import('./pages/crm/Inbox.jsx'));
const Tasks = lazy(() => import('./pages/crm/Tasks.jsx'));
const Lost = lazy(() => import('./pages/crm/Lost.jsx'));
const Campaigns = lazy(() => import('./pages/crm/Campaigns.jsx'));
const CampaignEditor = lazy(() => import('./pages/crm/CampaignEditor.jsx'));
const CampaignDetail = lazy(() => import('./pages/crm/CampaignDetail.jsx'));
const Automations = lazy(() => import('./pages/crm/Automations.jsx'));
const Reports = lazy(() => import('./pages/reports/Reports.jsx'));
const Imports = lazy(() => import('./pages/Imports.jsx'));
const Settings = lazy(() => import('./pages/settings/Settings.jsx'));
const Audit = lazy(() => import('./pages/Audit.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard.jsx'));
const AdminCompanies = lazy(() => import('./pages/admin/AdminCompanies.jsx'));
const AdminCompanyDetail = lazy(() => import('./pages/admin/AdminCompanyDetail.jsx'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers.jsx'));
const AdminPlans = lazy(() => import('./pages/admin/AdminPlans.jsx'));
const AdminInvoices = lazy(() => import('./pages/admin/AdminInvoices.jsx'));
const AdminAudit = lazy(() => import('./pages/admin/AdminAudit.jsx'));

export default function App() {
  const { session, loading, company, isSuperadmin } = useSession();
  if (loading) return <Loading />;
  if (!session) return <Login />;
  if (!company && !isSuperadmin) return <SelectCompany />;

  const companyRoutes = company && (
    <>
      <Route index element={<Dashboard />} />
      <Route path="clientes" element={<ClientsList />} />
      <Route path="clientes/painel" element={<ClientsOverview />} />
      <Route path="clientes/:id" element={<ClientDetail />} />
      <Route path="produtos" element={<Products />} />
      <Route path="produtos/:id" element={<ProductDetail />} />
      <Route path="estoque" element={<Stock />} />
      <Route path="fornecedores" element={<Partners />} />
      <Route path="orcamentos" element={<Quotes />} />
      <Route path="orcamentos/novo" element={<QuoteEditor />} />
      <Route path="orcamentos/:id" element={<QuoteDetail />} />
      <Route path="orcamentos/:id/editar" element={<QuoteEditor />} />
      <Route path="vendas" element={<Sales />} />
      <Route path="vendas/nova" element={<SaleEditor />} />
      <Route path="vendas/:id" element={<SaleDetail />} />
      <Route path="vendas/:id/editar" element={<SaleEditor />} />
      <Route path="os" element={<ServiceOrders />} />
      <Route path="os/nova" element={<ServiceOrderEditor />} />
      <Route path="os/:id" element={<ServiceOrderDetail />} />
      <Route path="os/:id/editar" element={<ServiceOrderEditor />} />
      <Route path="atendimento" element={<Inbox />} />
      <Route path="atendimento/:id" element={<Inbox />} />
      <Route path="tarefas" element={<Tasks />} />
      <Route path="nao-compras" element={<Lost />} />
      <Route path="campanhas" element={<Campaigns />} />
      <Route path="campanhas/nova" element={<CampaignEditor />} />
      <Route path="campanhas/:id" element={<CampaignDetail />} />
      <Route path="campanhas/:id/editar" element={<CampaignEditor />} />
      <Route path="automacoes" element={<Automations />} />
      <Route path="relatorios" element={<Reports />} />
      <Route path="importacao" element={<Imports />} />
      <Route path="configuracoes" element={<Settings />} />
      <Route path="configuracoes/:tab" element={<Settings />} />
      <Route path="auditoria" element={<Audit />} />
    </>
  );

  return (
    <Routes>
      <Route element={<Layout />}>
        {companyRoutes}
        {!company && <Route index element={<Navigate to="/admin" replace />} />}
        <Route path="perfil" element={<Profile />} />
        <Route path="oticas" element={<SelectCompany embedded />} />
        {isSuperadmin && (
          <>
            <Route path="admin" element={<AdminDashboard />} />
            <Route path="admin/oticas" element={<AdminCompanies />} />
            <Route path="admin/oticas/:id" element={<AdminCompanyDetail />} />
            <Route path="admin/usuarios" element={<AdminUsers />} />
            <Route path="admin/planos" element={<AdminPlans />} />
            <Route path="admin/financeiro" element={<AdminInvoices />} />
            <Route path="admin/auditoria" element={<AdminAudit />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
