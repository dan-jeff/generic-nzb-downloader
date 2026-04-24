import React from 'react';
import { SwipeableDrawer, Box, Typography, IconButton, useTheme, useMediaQuery } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SettingsPanel, { SettingsPanelHandle } from './SettingsPanel';

interface SettingsSheetProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  panelRef?: React.Ref<SettingsPanelHandle>;
}

const SettingsSheet: React.FC<SettingsSheetProps> = ({ open, onOpen, onClose, panelRef }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <SwipeableDrawer
      anchor="bottom"
      open={open}
      onOpen={onOpen}
      onClose={onClose}
      // Built-in swipe-to-open area is disabled because its bottom strip would
      // overlap the mobile bottom nav. Opening is handled via the gear icon
      // and the swipe-up gesture in App.tsx.
      disableSwipeToOpen
      ModalProps={{ keepMounted: true }}
      PaperProps={{
        sx: {
          height: isMobile ? '92%' : '80%',
          borderTopLeftRadius: 10,
          borderTopRightRadius: 10,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* Grab handle */}
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1.25, pb: 0.5 }}>
        <Box sx={{ width: 44, height: 4, borderRadius: 2, bgcolor: 'divider' }} />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 3, pt: 1, pb: 1 }}>
        <Typography variant="h6" sx={{ letterSpacing: '0.02em' }}>Settings</Typography>
        <IconButton onClick={onClose} size="small" aria-label="close settings">
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 2, pb: 'env(safe-area-inset-bottom)' }}>
        <SettingsPanel ref={panelRef} />
      </Box>
    </SwipeableDrawer>
  );
};

export default SettingsSheet;
