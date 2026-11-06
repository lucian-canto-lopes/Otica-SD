from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.shapes import Drawing, Rect, String, Line

OUT = '/home/l7/Documentos/ChatGPT/Gerenciamento de Óticas/output/pdf/acompanhamento_projeto_ocular_v2.pdf'
pdfmetrics.registerFont(TTFont('DejaVu', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuBold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
s = getSampleStyleSheet()
s.add(ParagraphStyle(name='TitleX', fontName='DejaVuBold', fontSize=19, leading=24, textColor=colors.HexColor('#173e3a'), spaceAfter=16))
s.add(ParagraphStyle(name='HeadX', fontName='DejaVuBold', fontSize=11.5, leading=16, textColor=colors.HexColor('#176c64'), spaceBefore=13, spaceAfter=6))
s.add(ParagraphStyle(name='BodyX', fontName='DejaVu', fontSize=9, leading=14, spaceAfter=7))
s.add(ParagraphStyle(name='SmallX', fontName='DejaVu', fontSize=7.8, leading=11))
s.add(ParagraphStyle(name='BoxX', fontName='DejaVu', fontSize=8, leading=11, alignment=TA_CENTER))
P=lambda t,st='BodyX': Paragraph(t,s[st])
doc=SimpleDocTemplate(OUT,pagesize=(21*cm,29.7*cm),rightMargin=2*cm,leftMargin=2*cm,topMargin=1.8*cm,bottomMargin=1.7*cm)
story=[P('Acompanhamento do projeto final — Ocular V2','TitleX'),P('Disciplina: Sistemas Distribuídos  |  Atualização: 05/11/2026','SmallX')]
story += [P('Resumo do projeto','HeadX'),P('O Ocular é uma plataforma web de gestão para múltiplas óticas. Cada empresa trabalha em um ambiente isolado, com clientes, receitas, produtos, estoque, orçamentos, vendas, ordens de serviço, atendimentos, campanhas e relatórios próprios. Um superadministrador gerencia empresas, usuários, planos, faturas e bloqueios. A V2 amplia o protótipo acadêmico para um sistema de CRM e operação comercial, com tarefas automáticas, auditoria, geração de PDFs e integração de mensagens.'),P('Repositório utilizado','HeadX'),P('Código-fonte: <link href="https://github.com/lucian-canto-lopes/optical">github.com/lucian-canto-lopes/optical</link>. A versão examinada está na branch local <b>v2-react</b>, alinhada ao commit <b>00f09d3</b> do remoto; a tag <b>v2.0.0</b> marca a primeira entrega da V2. As imagens oficiais usadas nos contêineres vêm dos repositórios de imagens Nginx, PHP, MySQL, PostgreSQL e Evolution API, conforme <b>compose.yaml</b>.'),P('O que mudou desde a entrega anterior','HeadX')]
items=[
'A interface anterior em HTML/JavaScript foi refeita com <b>React 18 e Vite</b>, com telas responsivas e tema claro/escuro.',
'O modelo passou a aceitar usuários em várias óticas, papéis por empresa, planos, faturamento, suspensão imediata e auditoria.',
'O cadastro operacional ganhou receitas, etiquetas, linha do tempo de clientes, inventário, orçamentos, vendas com parcelas, OS em kanban, anexos e PDFs A5.',
'O CRM ganhou caixa de atendimento, campanhas segmentadas, automações, importação de planilhas, relatórios flexíveis, chaves de API e webhooks.',
'Foi integrada a <b>Evolution API</b> para WhatsApp por QR Code, com um PostgreSQL próprio para a sessão; o worker processa campanhas, tarefas e webhooks. Houve ainda correções de inicialização no XAMPP e compatibilidade de migração com MySQL 5.6.'
]
for i in items: story.append(P('• '+i))
story += [P('Tecnologias e distribuição','HeadX'),P('O frontend React é compilado para arquivos estáticos e servido por Nginx Alpine. Requisições HTTP em <b>/api</b> seguem para a API PHP/Apache, que valida sessão, permissões e regras de negócio antes de acessar o MySQL. O worker PHP roda em contêiner separado e consulta o mesmo banco para tarefas assíncronas. A API se comunica com a Evolution API para conectar o WhatsApp e receber eventos por webhook. A Evolution usa PostgreSQL separado. Docker Compose cria a rede interna e os volumes persistentes.'),PageBreak(),P('Diagrama de componentes atualizado','TitleX')]
rows=[
['Navegador / usuário','React 18 + Vite (build em app/public)'],
['Frontend: Nginx Alpine','Entrega interface; encaminha /api → api:80'],
['API: PHP + Apache','Autenticação, regras, PDFs, CRM, integrações'],
['MySQL 8.4','Dados das óticas e da plataforma'],
['Worker: PHP','Campanhas, automações, tarefas, webhooks'],
['Evolution API v2','Conexão WhatsApp por QR Code e eventos'],
['PostgreSQL 16 Alpine','Sessões da Evolution API'],
]
t=Table([[P(a,'BoxX'),P(b,'BoxX')] for a,b in rows],colWidths=[6*cm,10.5*cm],rowHeights=[1.12*cm]*len(rows))
t.setStyle(TableStyle([('BOX',(0,0),(-1,-1),1,colors.HexColor('#176c64')),('INNERGRID',(0,0),(-1,-1),0.45,colors.HexColor('#adcac6')),('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e6f2ef')),('VALIGN',(0,0),(-1,-1),'MIDDLE')]))
d=Drawing(470,185)
def box(x,y,w,label):
 d.add(Rect(x,y,w,32,rx=5,ry=5,fillColor=colors.HexColor('#e6f2ef'),strokeColor=colors.HexColor('#176c64')))
 d.add(String(x+w/2,y+12,label,fontName='DejaVu',fontSize=8,textAnchor='middle'))
def edge(x1,y1,x2,y2):
 d.add(Line(x1,y1,x2,y2,strokeColor=colors.HexColor('#176c64'),strokeWidth=1.3))
box(4,135,95,'Navegador');box(130,135,95,'Nginx / React');box(256,135,95,'API PHP');box(382,135,84,'MySQL')
box(256,72,95,'Worker PHP');box(256,9,95,'Evolution API');box(382,9,84,'PostgreSQL')
edge(99,151,130,151);edge(225,151,256,151);edge(351,151,382,151)
edge(351,88,425,135);edge(303,135,303,41);edge(351,25,382,25)
d.add(String(14,106,'HTTP /api',fontName='DejaVu',fontSize=7))
d.add(String(19,17,'WhatsApp ↔ Evolution ↔ API',fontName='DejaVu',fontSize=7))
story += [d,Spacer(1,10),t,Spacer(1,12),P('<b>Fluxo principal:</b> navegador → Nginx → API PHP → MySQL. O worker → MySQL. Para WhatsApp: API ↔ Evolution API ↔ WhatsApp; Evolution API → PostgreSQL. Webhooks da Evolution retornam à API.','BodyX'),P('Limites atuais e próximos passos','HeadX'),P('A plataforma contém modos de atendimento manual, API oficial e provedores não oficiais. Para operação real, é necessário configurar credenciais próprias, endereço público de webhook, HTTPS e políticas de uso dos canais. O controle de assinatura gera faturas no sistema; a documentação não descreve cobrança automática por gateway de pagamento.'),P('Base da atualização: README.md, CHANGELOG.md, docs/estrutura.md, compose.yaml e histórico Git da branch v2-react. Alterações locais ainda não registradas em commit não foram tratadas como entrega concluída.','SmallX')]
def footer(c,d):
 c.setFont('DejaVu',7);c.setFillColor(colors.grey);c.drawRightString(19*cm,1*cm,f'Ocular V2  •  {d.page}')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
