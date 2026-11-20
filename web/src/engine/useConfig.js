// React hook: re-render when the Assumptions drawer changes the config. Returns api.version,
// which views put in useMemo dependencies so engine results recompute.
import { useEffect, useState } from 'react';

export function useConfigVersion(api) {
  const [v, setV] = useState(api?.version ?? 0);
  useEffect(() => (api ? api.subscribe((a) => setV(a.version)) : undefined), [api]);
  return v;
}
