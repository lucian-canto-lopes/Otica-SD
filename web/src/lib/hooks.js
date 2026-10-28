import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

// Cache simples em memória: telas reabertas aparecem na hora e atualizam em segundo plano.
const cache = new Map();

export function invalidate(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export function useApi(action, params = {}, { enabled = true, keepPrevious = true } = {}) {
  const key = action ? `${action}:${JSON.stringify(params)}` : null;
  const [state, setState] = useState(() => ({ data: key ? cache.get(key) : undefined, error: null, loading: !cache.has(key) }));
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!key || !enabled) return;
    const id = ++requestId.current;
    setState((s) => ({ data: cache.has(key) ? cache.get(key) : keepPrevious ? s.data : undefined, error: null, loading: true }));
    try {
      const data = await api.get(action, params);
      cache.set(key, data);
      if (id === requestId.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (id === requestId.current) setState((s) => ({ data: s.data, error, loading: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load, setData: (data) => setState((s) => ({ ...s, data })) };
}

export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const listener = () => setMatches(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);
  return matches;
}

/** Estado de formulário com atualização por campo. */
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const set = useCallback((field, value) => setValues((v) => ({ ...v, [field]: value })), []);
  const bind = (field, type = 'text') =>
    type === 'checkbox'
      ? { checked: Boolean(values[field]), onChange: (e) => set(field, e.target.checked) }
      : { value: values[field] ?? '', onChange: (e) => set(field, e.target.value) };
  return { values, setValues, set, bind };
}
