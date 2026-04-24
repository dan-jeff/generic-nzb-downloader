import { useState, useEffect } from 'react';

export interface CollapseSignal {
  expanded: boolean;
  timestamp: number;
}

export const useCollapsedState = (
  id: string,
  collapseSignal?: CollapseSignal | null,
): [boolean, () => void] => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(`collapsed_${id}`) === 'true') {
      setIsCollapsed(true);
    }
  }, [id]);

  useEffect(() => {
    if (!collapseSignal) return;
    const shouldCollapse = !collapseSignal.expanded;
    setIsCollapsed(shouldCollapse);
    localStorage.setItem(`collapsed_${id}`, String(shouldCollapse));
  }, [collapseSignal, id]);

  const toggle = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem(`collapsed_${id}`, String(next));
      return next;
    });
  };

  return [isCollapsed, toggle];
};
