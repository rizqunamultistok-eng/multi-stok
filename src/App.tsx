import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { InventoryProvider } from './context/InventoryContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar, ActiveTab } from './components/layout/Sidebar';
import { KasirDashboard } from './components/kasir/KasirDashboard';
import { MasterDataView } from './components/admin/MasterDataView';
import { BarangMasukView } from './components/gudang/BarangMasukView';
import { ReturStokView } from './components/retur/ReturStokView';
import { SupplierManagementView } from './components/admin/SupplierManagementView';
import { UserManagementView } from './components/admin/UserManagementView';
import { MinimumStockSettingsView } from './components/admin/MinimumStockSettingsView';
import { SalesReportView } from './components/admin/SalesReportView';
import { OpnameView } from './components/opname/OpnameView';
import { BarcodeScannerView } from './components/scanner/BarcodeScannerView';
import { StockListView } from './components/stock/StockListView';
import { PermintaanMutasiView } from './components/mutasi/PermintaanMutasiView';
import { ReportsView } from './components/reports/ReportsView';
import { SqlAndDeploymentView } from './components/docs/SqlAndDeploymentView';
import { LocalServerSetupView } from './components/server/LocalServerSetupView';
import { OfflineIndicator } from './components/common/OfflineIndicator';
import { LoginView } from './components/auth/LoginView';
import { canUseCashier } from './types';

function MainAppContent() {
  const { currentUser, isLoggedIn } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('admin_dashboard');
  const canOpenCashier = canUseCashier(currentUser.role);

  // Only location roles with a sales channel can open the cashier view.
  useEffect(() => {
    if (!canOpenCashier && (activeTab === 'kasir_dashboard' || activeTab === 'kasir_history')) {
      setActiveTab('admin_dashboard');
    }
  }, [activeTab, canOpenCashier]);

  if (!isLoggedIn) {
    return <LoginView />;
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-100 font-sans text-slate-900 antialiased selection:bg-blue-600 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        isSidebarOpen={isSidebarOpen}
        onMenuToggle={() => setIsSidebarOpen((isOpen) => !isOpen)}
      />

      {/* Main Container with Sidebar + Content */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={(tab) => {
            setActiveTab(tab);
            setIsSidebarOpen(false);
          }}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        {/* Dynamic Content Area */}
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-slate-50/50 pb-[calc(3rem+env(safe-area-inset-bottom))]">
          {/* Kasir View */}
          {activeTab === 'kasir_dashboard' && <KasirDashboard initialView="upload" />}
          {activeTab === 'kasir_history' && <KasirDashboard initialView="history" />}

          {/* Admin & Non-Kasir Views */}
          {activeTab === 'admin_dashboard' && <ReportsView />}
          {activeTab === 'master_barang' && <MasterDataView />}
          {activeTab === 'barang_masuk' && <BarangMasukView />}
          {activeTab === 'retur_stok' && <ReturStokView />}
          {activeTab === 'supplier_data' && <SupplierManagementView />}
          {activeTab === 'cek_stok' && <StockListView />}
          {activeTab === 'permintaan_mutasi' && <PermintaanMutasiView />}
          {activeTab === 'scan_barcode' && <BarcodeScannerView />}
          {activeTab === 'upload_opname' && <OpnameView />}
          {activeTab === 'mutasi_stok' && <ReportsView />}
          {activeTab === 'laporan_penjualan' && <SalesReportView />}
          {activeTab === 'kelola_user' && <UserManagementView />}
          {activeTab === 'minimum_stock_settings' && <MinimumStockSettingsView />}
          {activeTab === 'server_topology' && <LocalServerSetupView />}
          {activeTab === 'sql_deployment' && <SqlAndDeploymentView />}
        </main>
      </div>

      {/* PWA Offline Connectivity Indicator */}
      <OfflineIndicator />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <InventoryProvider>
        <MainAppContent />
      </InventoryProvider>
    </AuthProvider>
  );
}
