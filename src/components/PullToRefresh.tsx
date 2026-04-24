import React, { useRef, useState } from 'react';
import { Box } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';

const THRESHOLD = 70;
const MAX_PULL = 100;

interface PullToRefreshProps {
  onRefresh: () => void | Promise<void>;
  children: React.ReactNode;
  scrollContainerRef?: React.RefObject<HTMLElement>;
}

const findScrollAncestor = (el: Element | null): Element | null => {
  let cur: Element | null = el;
  while (cur && cur !== document.body) {
    const style = window.getComputedStyle(cur);
    if (
      (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
      cur.scrollHeight > cur.clientHeight
    ) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
};

const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children, scrollContainerRef }) => {
  const startY = useRef<number | null>(null);
  const scrollAncestor = useRef<Element | null>(null);
  const [pullDist, setPullDist] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const isAtTop = () => {
    const el = scrollContainerRef?.current ?? scrollAncestor.current;
    return el ? el.scrollTop <= 0 : true;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!scrollContainerRef?.current && e.target instanceof Element) {
      scrollAncestor.current = findScrollAncestor(e.target);
    }
    if (!isAtTop() || refreshing) {
      startY.current = null;
      return;
    }
    startY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY.current == null) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0) {
      setPullDist(0);
      return;
    }
    const damped = Math.min(MAX_PULL, dy * 0.45);
    setPullDist(damped);
  };

  const handleTouchEnd = async () => {
    if (startY.current == null) return;
    startY.current = null;
    if (pullDist >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDist(THRESHOLD);
      try {
        await onRefresh();
      } catch {
        // swallow — pull-to-refresh should never throw up
      }
      setRefreshing(false);
    }
    setPullDist(0);
  };

  const progress = Math.min(1, pullDist / THRESHOLD);
  const rotation = progress * 360;
  const settling = pullDist === 0 || refreshing;

  return (
    <Box
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      sx={{ position: 'relative', height: '100%' }}
    >
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: pullDist,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          transition: settling ? 'height 200ms ease-out' : 'none',
          zIndex: 1,
        }}
      >
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            bgcolor: 'action.hover',
            border: '1px solid', borderColor: 'divider',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: progress,
            transform: `scale(${0.5 + progress * 0.5})`,
          }}
        >
          <RefreshIcon
            sx={{
              fontSize: 20,
              color: 'primary.main',
              animation: refreshing ? 'pull-refresh-spin 0.8s linear infinite' : 'none',
              transform: refreshing ? 'none' : `rotate(${rotation}deg)`,
            }}
          />
        </Box>
      </Box>
      <Box
        sx={{
          transform: `translateY(${pullDist}px)`,
          transition: settling ? 'transform 200ms ease-out' : 'none',
          height: '100%',
        }}
      >
        {children}
      </Box>
    </Box>
  );
};

export default PullToRefresh;
