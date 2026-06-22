import React, { useState, useEffect } from 'react';
import { Search, Package, CheckCircle, Truck, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getDispatchCards, updateDispatchCard } from '../../api/dispatchCardApi';

const DigitalDispatch: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [cards, setCards] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (selectedCompany?._id) {
      fetchCards();
    }
  }, [selectedCompany]);

  const fetchCards = async () => {
    if (!selectedCompany?._id) return;
    try {
      setLoading(true);
      const res = await getDispatchCards(selectedCompany._id);
      setCards(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleScanItem = async (cardId: string, itemIndex: number) => {
    const card = cards.find(c => c._id === cardId);
    if (!card) return;
    const updatedItems = [...card.items];
    if (updatedItems[itemIndex].scannedQty < updatedItems[itemIndex].quantity) {
      updatedItems[itemIndex].scannedQty += 1;
      if (updatedItems[itemIndex].scannedQty >= updatedItems[itemIndex].quantity) {
        updatedItems[itemIndex].status = 'completed';
      } else {
        updatedItems[itemIndex].status = 'scanning';
      }
    }
    const allCompleted = updatedItems.every((i: any) => i.status === 'completed');
    try {
      await updateDispatchCard(cardId, { items: updatedItems, status: allCompleted ? 'completed' : 'in_progress' });
      await fetchCards();
    } catch (err) { console.error(err); }
  };

  const getStatusColor = (s: string) => {
    const m: any = { ready: 'bg-yellow-100 text-yellow-800', in_progress: 'bg-blue-100 text-blue-800', completed: 'bg-green-100 text-green-800' };
    return m[s] || 'bg-gray-100 text-gray-800';
  };

  const filtered = cards.filter(c => c.dcNumber?.toLowerCase().includes(searchTerm.toLowerCase()) || c.customerName?.toLowerCase().includes(searchTerm.toLowerCase()));

  if (loading) return <div className="p-6 flex justify-center"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="p-6">
      <div className="mb-6"><h1 className="text-3xl font-bold text-gray-900 mb-2">Digital Dispatch</h1><p className="text-gray-600">Scan and track dispatch items</p></div>

      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex items-center space-x-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input type="text" placeholder="Search dispatch cards..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg" />
          </div>
          <button onClick={fetchCards} className="p-2 text-gray-600 hover:bg-gray-100 border border-gray-300 rounded-lg transition-colors bg-white shadow-sm" title="Refresh page"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="space-y-6">
        {filtered.map((card) => (
          <div key={card._id} className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Truck className="w-6 h-6 text-blue-600" />
                  <div>
                    <h3 className="font-semibold text-gray-900">{card.dcNumber}</h3>
                    <p className="text-sm text-gray-500">{card.customerName}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(card.status)}`}>{card.status?.replace('_', ' ')}</span>
                  {card.vehicleNumber && <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">{card.vehicleNumber}</span>}
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-3">
                {card.items?.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Package className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="font-medium text-gray-900">{item.itemName}</p>
                        <p className="text-sm text-gray-500">Qty: {item.scannedQty || 0} / {item.quantity}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${((item.scannedQty || 0) / item.quantity) * 100}%` }}></div>
                      </div>
                      {item.status === 'completed' ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <button onClick={() => handleScanItem(card._id, idx)}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
                          disabled={card.status === 'completed'}>
                          Scan
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-center py-12 text-gray-500"><Package className="w-12 h-12 mx-auto mb-4 text-gray-300" /><p>No dispatch cards found</p></div>}
      </div>
    </div>
  );
};

export default DigitalDispatch;