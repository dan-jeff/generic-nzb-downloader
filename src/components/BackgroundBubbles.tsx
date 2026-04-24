import React from 'react';
import { Box, useTheme } from '@mui/material';

interface Bubble {
  size: number;
  left: string;
  top: string;
  delay: number;
  duration: number;
  hue: 'primary' | 'secondary';
}

const BUBBLES: Bubble[] = [
  { size: 260, left: '-4%',  top: '6%',  delay: 0,    duration: 26, hue: 'primary'   },
  { size: 180, left: '74%',  top: '12%', delay: -7,   duration: 22, hue: 'secondary' },
  { size: 340, left: '42%',  top: '52%', delay: -3,   duration: 32, hue: 'primary'   },
  { size: 140, left: '86%',  top: '68%', delay: -12,  duration: 24, hue: 'secondary' },
  { size: 210, left: '6%',   top: '74%', delay: -15,  duration: 28, hue: 'secondary' },
  { size: 120, left: '60%',  top: '2%',  delay: -5,   duration: 20, hue: 'primary'   },
  { size: 90,  left: '28%',  top: '30%', delay: -9,   duration: 18, hue: 'secondary' },
  { size: 160, left: '92%',  top: '38%', delay: -2,   duration: 30, hue: 'primary'   },
];

const BackgroundBubbles: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  // Higher opacity + no heavy blur so shapes are clearly visible.
  const fillOpacity  = isDark ? 0.32 : 0.18;
  const edgeOpacity  = isDark ? 0.08 : 0.05;

  const colorFor = (hue: Bubble['hue']) =>
    hue === 'primary' ? theme.palette.primary.main : theme.palette.secondary.main;

  const toHex2 = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 255).toString(16).padStart(2, '0');

  return (
    <Box
      aria-hidden
      sx={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      {BUBBLES.map((b, i) => {
        const color = colorFor(b.hue);
        return (
          <Box
            key={i}
            sx={{
              position: 'absolute',
              width: b.size,
              height: b.size,
              left: b.left,
              top: b.top,
              borderRadius: '50%',
              // Distinct shape: solid-ish core, soft edge falloff — no blur filter.
              background: `radial-gradient(circle at 35% 30%, ${color}${toHex2(fillOpacity)} 0%, ${color}${toHex2(fillOpacity * 0.6)} 45%, ${color}${toHex2(edgeOpacity)} 80%, transparent 100%)`,
              willChange: 'transform',
              animation: `bubble-float ${b.duration}s ease-in-out ${b.delay}s infinite alternate`,
            }}
          />
        );
      })}
    </Box>
  );
};

export default BackgroundBubbles;
