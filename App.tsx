import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, Building2, BarChart3, Home, Menu, X, Brain, Database,
} from 'lucide-react';
import type { Property, ViewName } from '@/types';
import {
  loadCsvData, getProperty, saveProperty, deleteProperty, getPropertyCount, getAllProperties,
} from '@/lib/database';
import { Dashboard } from '@/views/Dashboard';
import { PropertyList } from '@/views/PropertyList';
import { PropertyDetail } from '@/views/PropertyDetail';
import { Analytics } from '@/views/Analytics';
import { PricePrediction } from '@/views/PricePrediction';
import { MongoDBInsights } from '@/views/MongoDBInsights';
import { PropertyForm, createEmptyProperty } from '@/components/PropertyForm';

const NAV_ITEMS: { id: ViewName; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
  { id: 'properties', label: 'Properties', icon: <Building2 className="h-5 w-5" /> },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="h-5 w-5" /> },
  { id: 'prediction', label: 'Predict Price', icon: <Brain className="h-5 w-5" /> },
  { id: 'insights', label: 'Database Insights', icon: <Database className="h-5 w-5" /> },
];

function App() {
  const [view, setView] = useState<ViewName>('dashboard');
  const [topProperties, setTopProperties] = useState<Property[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [propertyListRefresh, setPropertyListRefresh] = useState(0);

  const refresh = useCallback(async () => {
    // Keep the sidebar count independent from the larger analytics payload.
    // A slow full-dataset refresh must not make a successful MongoDB count
    // appear as "MongoDB unavailable".
    const count = await getPropertyCount();
    setTotalCount(count);
    setDataError('');

    try {
      // Load the complete dataset for charts, analytics, prediction and
      // property comparisons. The Properties page has its own server-side
      // pagination, so this does not control how many cards it displays.
      const all = await getAllProperties(0, 20000);
      setTopProperties(all);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MongoDB property data is unavailable.';
      console.error('Full property dataset refresh failed:', message);
      // Keep any existing dashboard data and the accurate count visible.
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await loadCsvData();
        await refresh();
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const handleSave = async (p: Property) => {
    const isNewProperty = !/^[a-f\d]{24}$/i.test(p.id);
    const saved = await saveProperty(p);
    if (isNewProperty) setTotalCount((current) => current + 1);
    setFormOpen(false);
    setEditingProperty(null);
    if (selectedProperty?.id === saved.id) setSelectedProperty(saved);
    try {
      await refresh();
      setPropertyListRefresh((value) => value + 1);
    } catch (refreshError) {
      console.error('Property saved, but refreshing the property list failed:', refreshError);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteProperty(id);
    setTotalCount((current) => Math.max(0, current - 1));
    if (selectedProperty?.id === id) {
      setSelectedProperty(null);
      setView('properties');
    }
    try {
      await refresh();
      setPropertyListRefresh((value) => value + 1);
    } catch (refreshError) {
      console.error('Property deleted, but refreshing the property list failed:', refreshError);
    }
  };

  const handleAdd = () => {
    setEditingProperty(createEmptyProperty());
    setFormOpen(true);
  };

  const handleEdit = (p: Property) => {
    setEditingProperty(p);
    setFormOpen(true);
  };

  const handleSelectProperty = async (id: string) => {
    const prop = await getProperty(id);
    if (prop) {
      setSelectedProperty(prop);
      setView('detail');
      setSidebarOpen(false);
    }
  };

  const handleNavigate = (v: ViewName) => {
    setView(v);
    setSidebarOpen(false);
  };

  const renderView = () => {
    switch (view) {
      case 'dashboard':
        return <Dashboard properties={topProperties} refreshKey={propertyListRefresh} onNavigate={handleNavigate} onAdd={handleAdd} onSelectProperty={handleSelectProperty} loading={loading} />;
      case 'properties':
        return <PropertyList refreshKey={propertyListRefresh} onAdd={handleAdd} onEdit={handleEdit} onDelete={handleDelete} onSelect={handleSelectProperty} />;
      case 'analytics':
        return <Analytics properties={topProperties} />;
      case 'prediction':
        return <PricePrediction properties={topProperties} refreshKey={propertyListRefresh} />;
      case 'insights':
        return <MongoDBInsights properties={topProperties} refreshKey={propertyListRefresh} />;
      case 'detail':
        if (!selectedProperty) {
          return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Home className="h-12 w-12 text-slate-300" />
              <p className="mt-4 text-sm text-slate-500">Select a property from the Properties page to view its details.</p>
              <button onClick={() => handleNavigate('properties')} className="mt-4 text-sm font-medium text-slate-900 underline">
                Go to Properties
              </button>
            </div>
          );
        }
        return <PropertyDetail property={selectedProperty} allProperties={topProperties} onBack={() => handleNavigate('properties')} onEdit={() => handleEdit(selectedProperty)} onSelectProperty={handleSelectProperty} />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
          <p className="text-sm text-slate-500">Loading Gurugram property data...</p>
          <p className="text-xs text-slate-400">Fetching live properties from MongoDB...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-slate-900/30 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-slate-200 bg-white transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-6 py-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
                <Home className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Gurugram Analyzer</p>
                <p className="text-xs text-slate-400">Real Estate Tools</p>
              </div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-400">
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 space-y-1 px-3">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  view === item.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>

          <div className="border-t border-slate-200 p-4">
            <div className="rounded-xl bg-slate-50 p-3">
              {dataError ? (
                <>
                  <p className="text-xs font-medium text-rose-700">MongoDB unavailable</p>
                  <p className="mt-0.5 text-xs text-slate-500">Property count could not be loaded.</p>
                </>
              ) : (
                <>
                  <p className="text-xs font-medium text-slate-500">{totalCount.toLocaleString('en-IN')} Properties</p>
                  <p className="mt-0.5 text-xs text-slate-400">Gurugram dataset loaded</p>
                </>
              )}
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <Home className="h-5 w-5 text-slate-900" />
            <span className="font-semibold text-slate-900">Gurugram Analyzer</span>
          </div>
          <div className="w-9" />
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {renderView()}
        </main>
      </div>

      {formOpen && editingProperty && (
        <PropertyForm
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditingProperty(null); }}
          onSave={handleSave}
          initial={editingProperty}
        />
      )}
    </div>
  );
}

export default App;
