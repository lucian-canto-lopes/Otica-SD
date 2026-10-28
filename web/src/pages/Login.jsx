import { useState } from 'react';
import { Glasses, LogIn, MessageCircle, Megaphone, BarChart3 } from 'lucide-react';
import { useSession } from '../lib/session.jsx';
import { Button, Field, Input } from '../components/ui.jsx';

export default function Login() {
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-art">
        <div className="row" style={{ gap: 12 }}>
          <span className="brand-mark" style={{ background: '#fff', color: 'var(--brand)' }}>
            <Glasses size={20} />
          </span>
          <strong style={{ fontSize: 20 }}>Ocular</strong>
        </div>
        <div className="stack lg" style={{ maxWidth: 440 }}>
          <h1 style={{ fontSize: 34, lineHeight: 1.15 }}>Relacionamento e gestão para óticas, num só lugar.</h1>
          <div className="stack">
            <span className="row">
              <MessageCircle size={18} /> Atendimento e campanhas pelo WhatsApp
            </span>
            <span className="row">
              <Glasses size={18} /> Vendas, receitas e ordens de serviço
            </span>
            <span className="row">
              <Megaphone size={18} /> Automações de aniversário, receita e pós-venda
            </span>
            <span className="row">
              <BarChart3 size={18} /> Relatórios flexíveis e indicadores
            </span>
          </div>
        </div>
        <span style={{ opacity: 0.7, fontSize: 12 }}>© {new Date().getFullYear()} Ocular CRM</span>
      </div>
      <div className="login-form">
        <form className="card card-body stack lg" style={{ width: '100%', maxWidth: 380 }} onSubmit={submit}>
          <div className="stack sm">
            <h1>Entrar</h1>
            <span className="muted">Use o e-mail e a senha cadastrados para sua ótica.</span>
          </div>
          <Field label="E-mail">
            <Input type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Senha">
            <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <div className="error-text">{error}</div>}
          <Button type="submit" variant="primary" icon={LogIn} loading={loading} className="block">
            Entrar
          </Button>
        </form>
      </div>
    </div>
  );
}
