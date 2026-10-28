export const SALE_STATUS = {
  open: { label: 'Em aberto', tone: 'warning' },
  completed: { label: 'Concluída', tone: 'success' },
  cancelled: { label: 'Cancelada', tone: 'danger' },
};

export const QUOTE_STATUS = {
  open: { label: 'Aberto', tone: 'info' },
  sent: { label: 'Enviado', tone: 'brand' },
  approved: { label: 'Aprovado', tone: 'success' },
  lost: { label: 'Perdido', tone: 'danger' },
  expired: { label: 'Expirado', tone: '' },
  converted: { label: 'Virou venda', tone: 'success' },
};

export const ORDER_STATUS = {
  open: { label: 'Aberta', tone: 'info' },
  sent_to_lab: { label: 'Enviada ao laboratório', tone: 'brand' },
  in_production: { label: 'Em produção', tone: 'brand' },
  received_from_lab: { label: 'Recebida do laboratório', tone: 'warning' },
  mounting: { label: 'Em montagem', tone: 'warning' },
  ready: { label: 'Pronta para retirada', tone: 'success' },
  delivered: { label: 'Entregue', tone: '' },
  cancelled: { label: 'Cancelada', tone: 'danger' },
};
export const ORDER_FLOW = ['open', 'sent_to_lab', 'in_production', 'received_from_lab', 'mounting', 'ready', 'delivered'];

export const PAYMENT_METHODS = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  boleto: 'Boleto',
  crediario: 'Crediário',
  cheque: 'Cheque',
  convenio: 'Convênio',
  outro: 'Outro',
};

export const CHANNEL_LABELS = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  phone: 'Telefone',
  visit: 'Presencial',
  email: 'E-mail',
  other: 'Outro',
};

export const TASK_TYPES = {
  birthday: { label: 'Aniversário', tone: 'brand' },
  renewal: { label: 'Renovação', tone: 'info' },
  prescription: { label: 'Receita vencendo', tone: 'warning' },
  pickup: { label: 'Óculos pronto', tone: 'success' },
  follow_up: { label: 'Retorno', tone: 'info' },
  quote: { label: 'Orçamento', tone: 'warning' },
  other: { label: 'Outro', tone: '' },
};

export const CAMPAIGN_STATUS = {
  draft: { label: 'Rascunho', tone: '' },
  scheduled: { label: 'Agendada', tone: 'info' },
  running: { label: 'Em andamento', tone: 'brand' },
  paused: { label: 'Pausada', tone: 'warning' },
  completed: { label: 'Concluída', tone: 'success' },
  cancelled: { label: 'Cancelada', tone: 'danger' },
};

export const RECIPIENT_STATUS = {
  pending: { label: 'Falta enviar', tone: 'warning' },
  queued: { label: 'Na fila', tone: 'info' },
  sent: { label: 'Enviada', tone: 'success' },
  failed: { label: 'Falhou', tone: 'danger' },
  skipped: { label: 'Pulada', tone: '' },
  replied: { label: 'Respondeu', tone: 'brand' },
};

export const CAMPAIGN_MODES = {
  manual: 'Manual — lista para contato um a um',
  semi: 'Semiautomático — mensagem pronta, envio com um toque',
  auto: 'Automático — envio pela API em segundo plano',
};

export const ROLE_LABELS = {
  owner: 'Proprietário',
  manager: 'Gerente',
  seller: 'Vendedor',
  lab: 'Laboratório',
  viewer: 'Somente leitura',
};

export const COMPANY_STATUS = {
  trial: { label: 'Avaliação', tone: 'info' },
  active: { label: 'Ativa', tone: 'success' },
  blocked: { label: 'Bloqueada', tone: 'danger' },
  cancelled: { label: 'Cancelada', tone: '' },
};

export const INVOICE_STATUS = {
  pending: { label: 'Em aberto', tone: 'warning' },
  paid: { label: 'Paga', tone: 'success' },
  cancelled: { label: 'Cancelada', tone: '' },
};

export const TEMPLATE_VARIABLES = [
  ['{{primeiro_nome}}', 'Primeiro nome'],
  ['{{nome}}', 'Nome completo'],
  ['{{otica}}', 'Nome da ótica'],
  ['{{telefone_otica}}', 'WhatsApp da ótica'],
  ['{{ultima_compra}}', 'Data da última compra'],
  ['{{vencimento_receita}}', 'Vencimento da receita'],
  ['{{aniversario}}', 'Data de aniversário'],
  ['{{cidade}}', 'Cidade'],
];

export const ORIGINS = ['Indicação', 'Instagram', 'Facebook', 'Google', 'Passou na frente', 'Campanha WhatsApp', 'Convênio', 'Outro'];

export const UF = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
