import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Plus, Upload, Edit, Trash2, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getCompanies, createCompany, updateCompany, deleteCompany } from '../api/companyApi';

interface Company {
  _id: string;
  name: string;
  logo?: string;
  address: string;
  phone: string;
  email: string;
  gst: string;
  createdAt: string;
}

const CompanySelection: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    gst: '',
    logo: ''
  });
  const navigate = useNavigate();
  const { setSelectedCompany, hasPermission, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const canManage = hasPermission('MANAGE_COMPANIES');

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const res = await getCompanies();
      setCompanies(res.data);
    } catch (err) {
      console.error('Error fetching companies:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createCompany(formData);
      await fetchCompanies();
      setShowCreateForm(false);
      resetForm();
    } catch (err) {
      console.error('Error creating company:', err);
    }
  };

  const handleEditCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompany) return;
    try {
      await updateCompany(editingCompany._id, formData);
      await fetchCompanies();
      setEditingCompany(null);
      setShowCreateForm(false);
      resetForm();
    } catch (err) {
      console.error('Error updating company:', err);
    }
  };

  const handleDeleteCompany = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this company?')) {
      try {
        await deleteCompany(id);
        await fetchCompanies();
      } catch (err) {
        console.error('Error deleting company:', err);
      }
    }
  };

  const selectCompany = (company: Company) => {
    setSelectedCompany(company);
    navigate('/dashboard');
  };

  const resetForm = () => {
    setFormData({ name: '', address: '', phone: '', email: '', gst: '', logo: '' });
  };

  const startEdit = (company: Company) => {
    setEditingCompany(company);
    setFormData({
      name: company.name,
      address: company.address,
      phone: company.phone,
      email: company.email,
      gst: company.gst,
      logo: company.logo || ''
    });
    setShowCreateForm(true);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFormData(prev => ({ ...prev, logo: event.target?.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100*var(--vh,1vh))] bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100*var(--vh,1vh))] bg-white p-4 md:p-8 font-sans text-gray-800">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Select Company</h1>
            <p className="text-[0.875rem] text-gray-500">Choose a company to continue{canManage ? ' or create a new one' : ''}.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canManage && (
              <button
                onClick={() => { resetForm(); setEditingCompany(null); setShowCreateForm(true); }}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[0.875rem] font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>New Company</span>
              </button>
            )}
            <button
              onClick={handleLogout}
              className="px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-[0.875rem] font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-gray-500" />
              <span>Logout</span>
            </button>
          </div>
        </div>

        {/* Company cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((company) => (
            <div
              key={company._id}
              onClick={() => selectCompany(company)}
              className="group bg-gray-50 border border-gray-200 hover:border-blue-300 hover:bg-white rounded-xl p-5 flex flex-col gap-4 cursor-pointer transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {company.logo ? (
                    <img src={company.logo} alt={company.name} className="w-11 h-11 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-11 h-11 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-blue-600" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="text-[0.9375rem] font-semibold text-gray-900 truncate">{company.name}</h3>
                    {company.gst && <p className="text-xs text-gray-500 truncate">GST: {company.gst}</p>}
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => startEdit(company)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                      title="Edit company"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteCompany(company._id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                      title="Delete company"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {(company.address || company.phone || company.email) && (
                <div className="space-y-1 text-[0.875rem] text-gray-500 border-t border-gray-200 pt-3">
                  {company.address && <p className="truncate">{company.address}</p>}
                  {company.phone && <p className="truncate">{company.phone}</p>}
                  {company.email && <p className="truncate">{company.email}</p>}
                </div>
              )}

              <div className="mt-auto flex items-center justify-between text-[0.875rem] font-medium text-blue-600">
                <span>Open company</span>
                <span className="group-hover:translate-x-0.5 transition-transform">→</span>
              </div>
            </div>
          ))}
        </div>

        {companies.length === 0 && (
          <div className="text-center py-12">
            <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-600 mb-2">No Companies Found</h3>
            <p className="text-gray-500">Create a company to get started or run the seed script.</p>
          </div>
        )}

        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[calc(90*var(--vh,1vh))] overflow-y-auto">
              <h2 className="text-2xl font-semibold mb-4">
                {editingCompany ? 'Edit Company' : 'Create New Company'}
              </h2>
              
              <form onSubmit={editingCompany ? handleEditCompany : handleCreateCompany} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Company Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Company Logo</label>
                  <div className="flex items-center space-x-4">
                    {formData.logo && (
                      <img src={formData.logo} alt="Logo preview" className="w-16 h-16 rounded-full object-cover" />
                    )}
                    <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors">
                      <Upload className="w-4 h-4" />
                      <span>Upload Logo</span>
                      <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Address *</label>
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number *</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email Address *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">GST Number *</label>
                  <input
                    type="text"
                    value={formData.gst}
                    onChange={(e) => setFormData(prev => ({ ...prev, gst: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                <div className="flex space-x-4 pt-4">
                  <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors">
                    {editingCompany ? 'Update Company' : 'Create Company'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowCreateForm(false); setEditingCompany(null); resetForm(); }}
                    className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 px-4 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Logout Confirmation Modal */}
        {showLogoutConfirm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[100] animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl border border-gray-150 animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3.5 mb-4">
                <div className="p-3 bg-red-50 text-red-600 rounded-xl">
                  <LogOut className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Confirm Logout</h3>
                  <p className="text-[0.6875rem] text-gray-500 mt-0.5">Are you sure you want to log out of your session?</p>
                </div>
              </div>
              <div className="flex gap-2.5 mt-5">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowLogoutConfirm(false);
                    logout();
                    navigate('/login');
                  }}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] shadow-md shadow-red-200 cursor-pointer"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanySelection;