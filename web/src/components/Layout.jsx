import { Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, Bell, Boxes, Building2, ClipboardList, CreditCard, FileSpreadsheet, FileText, Glasses, Inbox, LayoutDashboard,
  ListChecks, LogOut, Megaphone, Menu, Moon, Package, PieChart, Receipt, Search, Settings, ShieldCheck, ShoppingBag, Sun,
  Truck, Upload, UserCircle, Users, Workflow, XCircle,
} from 'lucide-react';
import { useSession } from '../lib/session.jsx';
import { api } from '../lib/api.js';
import { useApi, useDebounce } from '../lib/hooks.js';
import { initials } from '../lib/format.js';
import { Badge, Button, Loading } from './ui.jsx';
import { COMPANY_STATUS } from '../lib/constants.js';

function navGroups(can, counts) {
  return [
    {
      items: [
        { to: '/', label: 'Painel', icon: LayoutDashboard, end: true },
        { to: '/tarefas', label: 'Tarefas do dia', icon: ListChecks, count: counts.tasks },
        { to: '/atendimento', label: 'Atendimento', icon: Inbox, count: counts.unread },
      ],
    },
    {
      title: 'Clientes',
      items: [
        { to: '/clientes', label: 'Clientes', icon: Users, end: true },
        { to: '/clientes/painel', label: 'Visão da carteira', icon: PieChart },
        { to: '/nao-compras', label: 'Não compras', icon: XCircle },
      ],
    },
    {
      title: 'Vendas',
      items: [
        { to: '/orcamentos', label: 'Orçamentos', icon: FileText },
        { to: '/vendas', label: 'Vendas', icon: ShoppingBag },
        { to: '/os', label: 'Ordens de serviço', icon: Glasses },
      ],
    },
    {
      title: 'Estoque',
      items: [
        { to: '/produtos', label: 'Produtos', icon: Package },
        { to: '/estoque', label: 'Movimentações', icon: Boxes },
        { to: '/fornecedores', label: 'Fornecedores', icon: Truck },
      ],
    },
    {
      title: 'Marketing',
      items: [
        { to: '/campanhas', label: 'Campanhas', icon: Megaphone },
        { to: '/automacoes', label: 'Automações', icon: Workflow },
        { to: '/relatorios', label: 'Relatórios', icon: BarChart3 },
      ],
    },
    {
      title: 'Gestão',
      items: [
        can('manage') && { to: '/importacao', label: 'Importação', icon: Upload },
        can('manage') && { to: '/auditoria', label: 'Auditoria', icon: ClipboardList },
        { to: '/configuracoes', label: 'Configurações', icon: Settings },
      ].filter(Boolean),
    },
  ];
}

const ADMIN_NAV = {
  title: 'Plataforma',
  items: [
    { to: '/admin', label: 'Painel geral', icon: ShieldCheck, end: true },
    { to: '/admin/oticas', label: 'Óticas', icon: Building2 },
    { to: '/admin/usuarios', label: 'Usuários', icon: UserCircle },
    { to: '/admin/financeiro', label: 'Financeiro', icon: CreditCard },
    { to: '/admin/planos', label: 'Planos', icon: Receipt },
    { to: '/admin/auditoria', label: 'Auditoria geral', icon: FileSpreadsheet },
  ],
};

function GlobalSearch() {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [active, setActive] = useState(0);
  const debounced = useDebounce(term, 220);
  const navigate = useNavigate();
  const box = useRef(null);

  useEffect(() => {
    if (debounced.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    api.get('search', { q: debounced }).then((r) => !cancelled && (setResults(r), setActive(0)));
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    const shortcut = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        box.current?.querySelector('input')?.focus();
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', shortcut);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', shortcut);
    };
  }, []);

  const go = (item) => {
    const paths = { client: '/clientes/', sale: '/vendas/', service_order: '/os/', quote: '/orcamentos/', product: '/produtos/' };
    navigate(paths[item.type] + item.id);
    setOpen(false);
    setTerm('');
  };
  const typeLabel = { client: 'Cliente', sale: 'Venda', service_order: 'OS', quote: 'Orçamento', product: 'Produto' };

  return (
    <div ref={box} style={{ position: 'relative', flex: 1, maxWidth: 460 }}>
      <div className="input-group">
        <Search size={16} />
        <input
          className="input"
          placeholder="Buscar cliente, CPF, telefone, nº de venda ou OS…  (Ctrl+K)"
          value={term}
          onFocus={() => setOpen(true)}
          onChange={(e) => (setTerm(e.target.value), setOpen(true))}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1));
            if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
            if (e.key === 'Enter' && results[active]) go(results[active]);
            if (e.key === 'Escape') setOpen(false);
          }}
        />
      </div>
      {open && results.length > 0 && (
        <div className="search-results">
          {results.map((item, index) => (
            <button key={`${item.type}-${item.id}`} type="button" className={`search-item ${index === active ? 'active' : ''}`} onClick={() => go(item)}>
              <Badge>{typeLabel[item.type]}</Badge>
              <span className="grow truncate">
                <strong>{item.title}</strong>
              </span>
              <span className="subtle">{item.subtitle}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || '');
  const dark = theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  const toggle = () => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('ocular-theme', next);
    } catch {
      // ignora: preferência vale só para esta sessão
    }
    setTheme(next);
  };
  return <Button variant="ghost" icon={dark ? Sun : Moon} onClick={toggle} aria-label="Alternar tema" title="Alternar tema claro/escuro" />;
}

export default function Layout() {
  const { user, company, companies, can, isSuperadmin, logout, logoUrl, selectCompany } = useSession();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const counts = useApi(company ? 'dashboard' : null, { compact: 1 }, { enabled: Boolean(company) }).data;

  useEffect(() => setOpen(false), [location.pathname]);

  const groups = company ? navGroups(can, { tasks: counts?.tasks_today, unread: counts?.unread_conversations }) : [];
  if (isSuperadmin) groups.push(ADMIN_NAV);
  const logo = logoUrl(company);

  return (
    <div className="app">
      {open && <div className="backdrop" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          {logo ? <img src={logo} alt="" /> : <span className="brand-mark">{company ? initials(company.trade_name || company.name) : 'O'}</span>}
          <div className="grow">
            <div className="truncate" style={{ fontWeight: 700 }}>
              {company ? company.trade_name || company.name : 'Ocular'}
            </div>
            <div className="subtle truncate">{company ? 'Ocular CRM' : 'Administração da plataforma'}</div>
          </div>
        </div>
        <nav>
          {groups.map((group, index) => (
            <div key={group.title || index} className={group.title ? 'nav-group' : ''}>
              {group.title && <div className="nav-group-title">{group.title}</div>}
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <item.icon size={18} />
                  <span>{item.label}</span>
                  {item.count > 0 && <span className="count">{item.count}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <Button variant="ghost" icon={Menu} className="menu-toggle" onClick={() => setOpen(true)} aria-label="Menu" />
          {company ? <GlobalSearch /> : <div className="grow" />}
          <div className="row" style={{ marginLeft: 'auto' }}>
            {company && company.status !== 'active' && (
              <span className="hidden-mobile">
                <Badge tone={COMPANY_STATUS[company.status]?.tone}>{COMPANY_STATUS[company.status]?.label}</Badge>
              </span>
            )}
            {company && counts?.tasks_today > 0 && (
              <Button variant="ghost" icon={Bell} onClick={() => navigate('/tarefas')} title={`${counts.tasks_today} tarefas para hoje`} aria-label="Tarefas" />
            )}
            <ThemeToggle />
            <div style={{ position: 'relative' }}>
              <button type="button" className="btn ghost" onClick={() => setMenu((m) => !m)}>
                <span className="avatar" style={{ width: 28, height: 28, fontSize: 12 }}>
                  {initials(user?.name)}
                </span>
                <span className="hidden-mobile truncate" style={{ maxWidth: 140 }}>
                  {user?.name}
                </span>
              </button>
              {menu && (
                <div className="search-results" style={{ left: 'auto', right: 0, width: 280 }} onMouseLeave={() => setMenu(false)}>
                  <div className="search-item" style={{ cursor: 'default' }}>
                    <div className="grow">
                      <strong>{user?.name}</strong>
                      <div className="subtle">{user?.email}</div>
                    </div>
                  </div>
                  {(companies.length > 1 || isSuperadmin) && (
                    <>
                      <div className="nav-group-title" style={{ padding: '8px 12px 4px' }}>
                        Trocar de ótica
                      </div>
                      {companies.slice(0, 8).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={`search-item ${company?.id === c.id ? 'active' : ''}`}
                          onClick={async () => {
                            setMenu(false);
                            await selectCompany(c.id);
                            navigate('/');
                          }}
                        >
                          <Building2 size={15} /> <span className="truncate">{c.trade_name || c.name}</span>
                        </button>
                      ))}
                      {companies.length > 8 && (
                        <button type="button" className="search-item" onClick={() => (setMenu(false), navigate('/oticas'))}>
                          Ver todas…
                        </button>
                      )}
                      {isSuperadmin && company && (
                        <button
                          type="button"
                          className="search-item"
                          onClick={async () => {
                            setMenu(false);
                            await selectCompany(0);
                            navigate('/admin');
                          }}
                        >
                          <ShieldCheck size={15} /> Voltar à plataforma
                        </button>
                      )}
                    </>
                  )}
                  <div className="divider" style={{ margin: '4px 0' }} />
                  <button type="button" className="search-item" onClick={() => (setMenu(false), navigate('/perfil'))}>
                    <UserCircle size={15} /> Meu perfil e senha
                  </button>
                  <button type="button" className="search-item" onClick={logout}>
                    <LogOut size={15} /> Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="content">
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
