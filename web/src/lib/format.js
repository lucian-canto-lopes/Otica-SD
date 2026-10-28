const moneyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numberFormatter = new Intl.NumberFormat('pt-BR');

export const money = (value) => moneyFormatter.format(Number(value || 0));
export const number = (value) => numberFormatter.format(Number(value || 0));
export const percent = (value, digits = 0) =>
  value === null || value === undefined ? '—' : `${(Number(value) * 100).toFixed(digits).replace('.', ',')}%`;

export function compactMoney(value) {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1).replace('.', ',')} mi`;
  if (Math.abs(n) >= 10_000) return `R$ ${(n / 1000).toFixed(1).replace('.', ',')} mil`;
  return money(n);
}

export function date(value) {
  if (!value) return '';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
}

export function dateTime(value) {
  if (!value) return '';
  const time = String(value).slice(11, 16);
  return `${date(value)}${time ? ` ${time}` : ''}`;
}

export function relativeDate(value) {
  if (!value) return '';
  const target = new Date(String(value).replace(' ', 'T'));
  const diff = Math.round((Date.now() - target.getTime()) / 86400000);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'ontem';
  if (diff === -1) return 'amanhã';
  if (diff > 1 && diff < 31) return `há ${diff} dias`;
  if (diff < -1 && diff > -31) return `em ${-diff} dias`;
  return date(value);
}

export function today(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return toIsoDate(d);
}
export function toIsoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function monthStart(offsetMonths = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  return toIsoDate(d);
}
export function monthEnd(offsetMonths = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths + 1);
  d.setDate(0);
  return toIsoDate(d);
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export function monthLabel(ym) {
  const [y, m] = String(ym).split('-');
  return `${MONTHS[Number(m) - 1] || ''}/${String(y).slice(2)}`;
}

export function phone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value || '';
}

export function cpf(value) {
  const d = String(value || '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : value || '';
}

export function whatsappLink(phoneNumber, text = '') {
  let digits = String(phoneNumber || '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function age(birthDate) {
  if (!birthDate) return null;
  const b = new Date(`${String(birthDate).slice(0, 10)}T00:00:00`);
  const now = new Date();
  let years = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) years--;
  return years;
}

export function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

export function parseMoneyInput(value) {
  if (typeof value === 'number') return value;
  const text = String(value || '').trim();
  if (!text) return 0;
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  const n = Number(normalized.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function fileSize(bytes) {
  const n = Number(bytes || 0);
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}
