import React from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/usePWAInstall';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-xl animate-bounce">
      <WifiOff className="w-4 h-4 text-white" />
      <span>Mode Offline — Anda tetap dapat menggunakan fitur lokal.</span>
    </div>
  );
};
