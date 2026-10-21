import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Edit3, Trash2, Search, ShieldCheck, Building2, UserCog } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getCompanies } from '../../api/companyApi';
import { ManagedUser, UserPayload, getUsers, createUser, updateUser, deleteUser } from '../../api/userApi';
import Modal from '../ui/Modal';
import { ConfirmActionModal } from '../common/ConfirmActionModal';
import { showToast } from '../ui/Toast';

interface CompanyLite { _id: string; name: string }

const ROLES = ['admin', 'manager', 'sales'];

interface FormState {
  username: string;
  fullName: string;
  email: string;
  password: string;
  roleName: string;
  companies: string[];
  status: 'active' | 'inactive';
}

const emptyForm: FormState = { username: '', fullName: '', email: '', password: '', roleName: 'sales', companies: [], status: 'active' };

const UsersManagement: React.FC = () => {
  const { user: me, hasPermission } = useAuth();
  const isSuperAdmin = me?.role === 'admin';
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [companies, setCompanies] = useState<CompanyLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);

  const companyName = (id: string) => companies.find(c => c._id === id)?.name || 'Unknown company';

  const load = async () => {
    setLoading(true);
    try {
      const [u, c] = await Promise.all([getUsers(), getCompanies()]);
      setUsers(u.data);
      setCompanies(c.data);
    } catch (err: any) {
      showToast(err.response?.data?.msg || 'Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const q = search.toLowerCase().trim();
    return users.filter(u => !q || [u.username, u.fullName, u.email, u.role].some(v => (v || '').toLowerCase().includes(q)));
  }, [users, search]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (u: ManagedUser) => {
    setEditing(u);
    setForm({ username: u.username, fullName: u.fullName, email: u.email, password: '', roleName: u.role, companies: u.companies || [], status: u.status });
    setShowForm(true);
  };

  const toggleCompany = (id: string) =>
    setForm(f => ({ ...f, companies: f.companies.includes(id) ? f.companies.filter(x => x !== id) : [...f.companies, id] }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.email.trim()) return showToast('Name and email are required', 'error');
    if (!editing && (!form.username.trim() || form.password.length < 8)) return showToast('Username and a password of at least 8 characters are required', 'error');
    if (editing && form.password && form.password.length < 8) return showToast('Password must be at least 8 characters', 'error');
    if (isSuperAdmin && form.roleName !== 'admin' && form.companies.length === 0) {
      return showToast('Assign at least one company, otherwise this user cannot access anything', 'error');
    }

    setSaving(true);
    try {
      const payload: UserPayload = { fullName: form.fullName.trim(), email: form.email.trim(), roleName: form.roleName, status: form.status };
      if (isSuperAdmin) payload.companies = form.roleName === 'admin' ? [] : form.companies;
      if (form.password) payload.password = form.password;
      if (editing) {
        await updateUser(editing._id, payload);
        showToast('User updated', 'success');
      } else {
        await createUser({ ...payload, username: form.username.trim() });
        showToast('User created', 'success');
      }
      setShowForm(false);
      load();
    } catch (err: any) {
      showToast(err.response?.data?.msg || 'Failed to save user', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u: ManagedUser) => {
    try {
      await deleteUser(u._id);
      showToast('User deleted', 'success');
      load();
    } catch (err: any) {
      showToast(err.response?.data?.msg || 'Failed to delete user', 'error');
    }
  };

  if (!hasPermission('MANAGE_USERS')) {
    return <div className="p-6 text-gray-500">You do not have permission to manage users.</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 font-sans text-gray-800">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Users &amp; Company Access</h1>
          <p className="text-[0.875rem] text-gray-500">
            The super admin can open every company. All other users can only open the companies assigned to them.
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" />
          <span>New User</span>
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search users..."
          className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-[0.875rem] focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="bg-gray-50 rounded-xl overflow-hidden panel-table p-2">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[0.875rem] border-collapse">
            <thead>
              <tr className="text-xs font-medium uppercase tracking-wider text-gray-500 border-b border-gray-200">
                <th className="py-3 px-3">User</th>
                <th className="py-3 px-3">Email</th>
                <th className="py-3 px-3">Role</th>
                <th className="py-3 px-3">Companies</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="py-10 text-center text-gray-400">Loading users...</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={6} className="py-10 text-center text-gray-400">No users found</td></tr>
              ) : visible.map(u => (
                <tr key={u._id} className="hover:bg-blue-50/30">
                  <td className="py-3 px-3">
                    <div className="font-semibold text-gray-900">{u.fullName}</div>
                    <div className="text-xs text-gray-400 font-mono">{u.username}</div>
                  </td>
                  <td className="py-3 px-3 text-gray-600">{u.email}</td>
                  <td className="py-3 px-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 capitalize">
                      {u.role === 'admin' && <ShieldCheck className="w-3 h-3 text-blue-600" />}
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    {u.role === 'admin' ? (
                      <span className="text-xs font-semibold text-blue-700">All companies (super admin)</span>
                    ) : u.companies.length === 0 ? (
                      <span className="text-xs font-semibold text-rose-600">None assigned, user is blocked</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {u.companies.map(id => (
                          <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            <Building2 className="w-3 h-3" />{companyName(id)}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${u.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <button onClick={() => openEdit(u)} className="icon-btn" title="Edit user"><Edit3 className="w-3.5 h-3.5" /></button>
                      {u._id !== me?._id && (
                        <button onClick={() => setDeleting(u)} className="icon-btn-danger" title="Delete user"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <Modal
          isOpen={showForm}
          onClose={() => setShowForm(false)}
          maxWidth="max-w-lg"
          title={
            <div className="flex items-center gap-2">
              <UserCog className="w-4 h-4 text-blue-600" />
              <span>{editing ? 'Edit User' : 'New User'}</span>
            </div>
          }
        >
          <form onSubmit={handleSave} className="space-y-3 text-[0.875rem]">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs font-semibold text-gray-500">Full name *</span>
                <input value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-xl" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-gray-500">Username *</span>
                <input value={form.username} disabled={!!editing} onChange={e => setForm({ ...form, username: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-xl disabled:bg-gray-50 disabled:text-gray-400" />
              </label>
            </div>
            <label className="space-y-1 block">
              <span className="text-xs font-semibold text-gray-500">Email *</span>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-xl" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs font-semibold text-gray-500">{editing ? 'New password (leave blank to keep)' : 'Password * (min 8)'}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  disabled={!!editing && !isSuperAdmin}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl disabled:bg-gray-50"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-gray-500">Role</span>
                <select value={form.roleName} onChange={e => setForm({ ...form, roleName: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white capitalize">
                  {ROLES.filter(r => r !== 'admin' || isSuperAdmin).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            </div>

            {isSuperAdmin && (
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-gray-500">Company access</span>
                {form.roleName === 'admin' ? (
                  <p className="px-3 py-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-semibold">Admins are super admins and can open every company.</p>
                ) : (
                  <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-44 overflow-y-auto">
                    {companies.map(c => (
                      <label key={c._id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" checked={form.companies.includes(c._id)} onChange={() => toggleCompany(c._id)} className="rounded text-blue-600" />
                        <span className="font-medium text-gray-800">{c.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.status === 'active'} onChange={e => setForm({ ...form, status: e.target.checked ? 'active' : 'inactive' })} className="rounded text-blue-600" />
              <span className="font-medium text-gray-700">Active (inactive users cannot sign in)</span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 cursor-pointer">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : editing ? 'Save Changes' : 'Create User'}</button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <ConfirmActionModal
          isOpen={!!deleting}
          onClose={() => setDeleting(null)}
          onConfirm={() => handleDelete(deleting)}
          title={`Delete user ${deleting.username}`}
          description="This user will no longer be able to sign in. This cannot be undone."
          confirmText="Yes, Delete User"
          variant="danger"
        />
      )}
    </div>
  );
};

export default UsersManagement;
