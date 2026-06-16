import React, { useState, useRef, useEffect } from 'react';
import { Download, Upload, Database, FileText, AlertCircle, CheckCircle, X } from 'lucide-react';
import { exportDataAsJSON, exportDataAsExcel, importDataFromJSON, getDataSummary, saveExportTimestamp } from '../utils/dataExport';
import { useAuth } from '../context/AuthContext';

interface DataManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DataSummaryState {
  companies: number;
  customers: number;
  vendors: number;
  staff: number;
  finishedGoods: number;
  rawMaterials: number;
  semiFinished: number;
  quotes: number;
  orders: number;
  deliveryChallans: number;
  dispatchCards: number;
  lastExport: string;
}

const DataManager: React.FC<DataManagerProps> = ({ isOpen, onClose }) => {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const [importError, setImportError] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [dataSummary, setDataSummary] = useState<DataSummaryState>({
    companies: 0, customers: 0, vendors: 0, staff: 0,
    finishedGoods: 0, rawMaterials: 0, semiFinished: 0,
    quotes: 0, orders: 0, deliveryChallans: 0, dispatchCards: 0,
    lastExport: 'Never'
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { selectedCompany } = useAuth();

  useEffect(() => {
    if (isOpen) {
      fetchSummary();
    }
  }, [isOpen, selectedCompany]);

  const fetchSummary = async () => {
    setSummaryLoading(true);
    try {
      const summary = await getDataSummary(selectedCompany?._id);
      setDataSummary(summary);
    } catch (err) {
      console.error('Error fetching data summary:', err);
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleExportJSON = async () => {
    setExporting(true);
    try {
      await exportDataAsJSON(selectedCompany?._id);
      saveExportTimestamp();
      await fetchSummary();
      alert('Data exported successfully as JSON!');
    } catch (error) {
      alert('Error exporting data. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      await exportDataAsExcel(selectedCompany?._id);
      saveExportTimestamp();
      await fetchSummary();
      alert('Data exported successfully as Excel!');
    } catch (error) {
      alert('Error exporting data. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      setImportError('Please select a JSON file');
      return;
    }

    setImporting(true);
    setImportError('');
    setImportSuccess(false);

    try {
      await importDataFromJSON(file);
      setImportSuccess(true);
      await fetchSummary();
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error) {
      setImportError('Failed to import data. Please check the file format.');
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Data Management</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Data Summary */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Database className="w-5 h-5 mr-2" />
            Current Data Summary
          </h3>
          
          {summaryLoading ? (
            <div className="flex justify-center py-4">
              <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{dataSummary.companies}</div>
                  <div className="text-sm text-gray-600">Companies</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{dataSummary.customers}</div>
                  <div className="text-sm text-gray-600">Customers</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{dataSummary.vendors}</div>
                  <div className="text-sm text-gray-600">Vendors</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{dataSummary.finishedGoods}</div>
                  <div className="text-sm text-gray-600">Finished Goods</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{dataSummary.rawMaterials}</div>
                  <div className="text-sm text-gray-600">Raw Materials</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-indigo-600">{dataSummary.orders}</div>
                  <div className="text-sm text-gray-600">Sales Orders</div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-600">
                  Last Export: {dataSummary.lastExport === 'Never' ? 'Never' : new Date(dataSummary.lastExport).toLocaleString()}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Export Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Export Data</h3>
          <p className="text-sm text-gray-600 mb-4">
            Export all your real data including companies, customers, items, orders, and more. 
            Data is fetched from the server database.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={handleExportJSON}
              disabled={exporting}
              className="flex items-center justify-center space-x-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <Download className="w-5 h-5" />
              <span>{exporting ? 'Exporting...' : 'Export as JSON'}</span>
            </button>
            
            <button
              onClick={handleExportExcel}
              disabled={exporting}
              className="flex items-center justify-center space-x-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <FileText className="w-5 h-5" />
              <span>{exporting ? 'Exporting...' : 'Export as Excel'}</span>
            </button>
          </div>
        </div>

        {/* Import Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Import Data</h3>
          <p className="text-sm text-gray-600 mb-4">
            Import data from a previously exported JSON file. Data will be added to the database.
          </p>

          {importSuccess && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center">
              <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
              <span className="text-green-700">Data imported successfully! Page will refresh in 2 seconds...</span>
            </div>
          )}

          {importError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center">
              <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
              <span className="text-red-700">{importError}</span>
            </div>
          )}

          <button
            onClick={handleImportClick}
            disabled={importing}
            className="flex items-center justify-center space-x-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 w-full"
          >
            <Upload className="w-5 h-5" />
            <span>{importing ? 'Importing...' : 'Import JSON Data'}</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileImport}
            className="hidden"
          />
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 mb-2">How to Share Data with Testing Teams:</h4>
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>Export your real data using the buttons above</li>
            <li>Send the exported file along with the project</li>
            <li>Testing team can import the data in one click</li>
            <li>They'll have access to all your real business data for testing</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default DataManager;