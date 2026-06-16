import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import './CustomersPage.css';

function CustomersPage() {
  const [customers, setCustomers] = useState(() => {
    const saved = localStorage.getItem('customers');
    return saved ? JSON.parse(saved) : [];
  });
  const [visibleCols, setVisibleCols] = useState(() => {
    const keys = customers[0] ? Object.keys(customers[0]) : ['firm', 'contact', 'phone', 'door', 'street', 'address1', 'landmark', 'area', 'city', 'district', 'state', 'status'];
    return Object.fromEntries(keys.map(k => [k, true]));
  });
  const [selected, setSelected] = useState([]);
  const [globalSearch, setGlobalSearch] = useState('');
  const [editModal, setEditModal] = useState(false);
  const [editData, setEditData] = useState({});
  const [editIndex, setEditIndex] = useState(null);

  useEffect(() => {
    localStorage.setItem('customers', JSON.stringify(customers));
  }, [customers]);

  const filtered = customers.filter(c =>
    Object.values(c).some(val => val?.toString().toLowerCase().includes(globalSearch.toLowerCase()))
  );

  const toggleColumn = key => {
    setVisibleCols(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const exportToExcel = () => {
    const data = selected.length ? selected.map(i => customers[i]) : filtered;
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Customers');
    XLSX.writeFile(wb, 'customers.xlsx');
  };

  const downloadSample = () => {
    const sample = [{
      firm: '', contact: '', phone: '', door: '', street: '', address1: '', landmark: '', area: '',
      city: '', district: '', state: '', status: 'Active'
    }];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sample);
    XLSX.utils.book_append_sheet(wb, ws, 'Sample');
    XLSX.writeFile(wb, 'sample_customers.xlsx');
  };

  const importExcel = e => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = evt => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      setCustomers(data);
      const keys = Object.keys(data[0] || {});
      setVisibleCols(Object.fromEntries(keys.map(k => [k, true])));
    };
    reader.readAsBinaryString(file);
  };

  const handleEdit = (i) => {
    setEditData(customers[i]);
    setEditIndex(i);
    setEditModal(true);
  };

  const saveEdit = () => {
    const updated = [...customers];
    updated[editIndex] = editData;
    setCustomers(updated);
    setEditModal(false);
  };

  return (
    <div className="customers-page">
      <div className="toolbar">
        <input type="text" placeholder="Search..." value={globalSearch} onChange={e => setGlobalSearch(e.target.value)} />
        <button onClick={exportToExcel}>Export</button>
        <button onClick={downloadSample}>Download Sample</button>
        <label className="import-btn">
          Import
          <input type="file" accept=".xlsx, .xls" onChange={importExcel} hidden />
        </label>
      </div>

      <div className="column-toggle">
        {Object.keys(visibleCols).map(key => (
          <label key={key}>
            <input type="checkbox" checked={visibleCols[key]} onChange={() => toggleColumn(key)} />
            {key}
          </label>
        ))}
      </div>

      <div className="summary">
        Total: {customers.length} | Active: {customers.filter(c => c.status?.toLowerCase() === 'active').length} | Inactive: {customers.filter(c => c.status?.toLowerCase() !== 'active').length}
      </div>

      <table>
        <thead>
          <tr>
            <th></th>
            {Object.keys(visibleCols).map(key => visibleCols[key] && <th key={key}>{key.toUpperCase()}</th>)}
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((cust, i) => (
            <tr key={i} className={selected.includes(i) ? 'selected-row' : ''}>
              <td>
                <input
                  type="checkbox"
                  checked={selected.includes(i)}
                  onChange={() => {
                    setSelected(prev =>
                      prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
                    );
                  }}
                />
              </td>
              {Object.keys(visibleCols).map(key => visibleCols[key] && <td key={key}>{cust[key]}</td>)}
              <td>
                <button onClick={() => handleEdit(i)}>✏️</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editModal && (
        <div className="modal">
          <div className="modal-content">
            <h3>Edit Customer</h3>
            {Object.keys(visibleCols).map(key => (
              <input
                key={key}
                value={editData[key] || ''}
                onChange={e => setEditData(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={key}
              />
            ))}
            <button onClick={saveEdit}>Save</button>
            <button onClick={() => setEditModal(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CustomersPage;