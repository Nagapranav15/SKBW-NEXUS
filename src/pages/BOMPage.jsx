import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import {
  Button,
  Input,
  Table,
  Checkbox,
  Drawer,
  Tag,
  Space,
  message,
  Modal,
} from "antd";
import {
  SaveOutlined,
  DeleteOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  DownloadOutlined,
  EyeOutlined,
} from "@ant-design/icons";

const STORAGE_KEY = "bom_data";
const HISTORY_KEY = "bom_history";
const initialCols = [
  "gsm",
  "grade",
  "printedBoard",
  "laminationCost",
  "printedYield",
  "indexSheets",
  "rulingSheets",
  "stitchingCost",
];

export default function BOMPage() {
  const [data, setData] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [bulkEdits, setBulkEdits] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const hist = localStorage.getItem(HISTORY_KEY);
    if (stored) setData(JSON.parse(stored));
    if (hist) setHistory(JSON.parse(hist));
  }, []);

  const saveHistory = (action, skus) => {
    const entry = {
      timestamp: new Date().toLocaleString(),
      user: "Admin",
      action,
      skus,
      count: skus.length,
    };
    const newHist = [entry, ...history];
    setHistory(newHist);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(newHist));
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: "binary" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const imported = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const normalized = imported.map((r) => {
        const sku = r["SKU Name"]?.toUpperCase()?.trim();
        const obj = { key: sku };
        initialCols.forEach((c) => {
          const excelHeader = c.charAt(0).toUpperCase() + c.slice(1);
          obj[c] = r[excelHeader] || "";
        });
        obj.updated = new Date().toLocaleString();
        return obj;
      });
      setData(normalized);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      saveHistory("Imported", normalized.map((r) => r.key));
      message.success("BOM imported and saved");
    };
    reader.readAsBinaryString(file);
  };

  const handleSave = () => {
    const updatedData = data.map((item) =>
      selectedKeys.includes(item.key)
        ? { ...item, ...bulkEdits, updated: new Date().toLocaleString() }
        : item
    );
    setData(updatedData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedData));
    saveHistory("Edited", selectedKeys);
    setSelectedKeys([]);
    setBulkEdits({});
    setShowEditDrawer(false);
    message.success("Changes saved");
  };

  const handleDelete = () => {
    Modal.confirm({
      title: "Confirm delete?",
      content: `Are you sure you want to delete ${selectedKeys.length} SKUs?`,
      onOk: () => {
        const remaining = data.filter((d) => !selectedKeys.includes(d.key));
        setData(remaining);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
        saveHistory("Deleted", selectedKeys);
        setSelectedKeys([]);
        message.success("Deleted successfully");
      },
    });
  };

  const handleExport = () => {
    const rows = data
      .filter((d) => selectedKeys.includes(d.key))
      .map((r) => {
        const row = { "SKU Name": r.key };
        initialCols.forEach((c) => {
          row[c.charAt(0).toUpperCase() + c.slice(1)] = r[c];
        });
        return row;
      });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BOM");
    XLSX.writeFile(wb, "bom_export.xlsx");
    saveHistory("Exported", selectedKeys);
  };

  const exportHistoryExcel = () => {
    const rows = history.map((h) => ({
      Timestamp: h.timestamp,
      User: h.user,
      Action: h.action,
      "Total SKUs": h.count,
      "SKU List": h.skus.join(", "),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "History");
    XLSX.writeFile(wb, "bom_history.xlsx");
  };

  const exportHistoryPDF = () => {
    const doc = new jsPDF();
    doc.autoTable({
      head: [["Timestamp", "User", "Action", "Count", "SKUs"]],
      body: history.map((h) => [
        h.timestamp,
        h.user,
        h.action,
        h.count,
        h.skus.join(", "),
      ]),
    });
    doc.save("bom_history.pdf");
  };

  const columns = [
    {
      title: <Checkbox
        checked={selectedKeys.length === data.length}
        onChange={(e) => {
          setSelectedKeys(e.target.checked ? data.map((r) => r.key) : []);
        }}
      />,
      dataIndex: "select",
      render: (_, record) => (
        <Checkbox
          checked={selectedKeys.includes(record.key)}
          onChange={(e) => {
            const updated = [...selectedKeys];
            if (e.target.checked) updated.push(record.key);
            else updated.splice(updated.indexOf(record.key), 1);
            setSelectedKeys(updated);
          }}
        />
      ),
      width: 40,
    },
    {
      title: "SKU Name",
      dataIndex: "key",
      sorter: (a, b) => a.key.localeCompare(b.key),
      render: (text) => <b>{text}</b>,
    },
    ...initialCols.map((col) => ({
      title: col.charAt(0).toUpperCase() + col.slice(1),
      dataIndex: col,
    })),
    {
      title: "Last Updated",
      dataIndex: "updated",
      width: 160,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h1>BOM (Bill of Materials)</h1>
      <Space style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <input type="file" accept=".xlsx" onChange={handleImport} />
        <Button
          icon={<SaveOutlined />}
          disabled={!selectedKeys.length}
          onClick={() => setShowEditDrawer(true)}
        >
          Edit Selected
        </Button>
        <Button
          icon={<DeleteOutlined />}
          danger
          disabled={!selectedKeys.length}
          onClick={handleDelete}
        >
          Delete
        </Button>
        <Button
          icon={<FileExcelOutlined />}
          disabled={!selectedKeys.length}
          onClick={handleExport}
        >
          Export
        </Button>
        <Button
          icon={<DownloadOutlined />}
          onClick={() =>
            window.open("/sample_bom.xlsx", "_blank")
          }
        >
          Download Sample
        </Button>
        <Button
          icon={<EyeOutlined />}
          onClick={() => setShowHistoryModal(true)}
        >
          View History
        </Button>
        <Input.Search
          placeholder="Search SKU..."
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: 300 }}
        />
      </Space>

      <Table
        rowKey="key"
        columns={columns}
        dataSource={data.filter((item) =>
          item.key.toLowerCase().includes(searchTerm.toLowerCase())
        )}
        pagination={{ pageSize: 25 }}
        scroll={{ x: "max-content" }}
      />

      <Drawer
        title="Bulk Edit Selected SKUs"
        open={showEditDrawer}
        onClose={() => setShowEditDrawer(false)}
        width={400}
        footer={
          <Space style={{ float: "right" }}>
            <Button onClick={() => setShowEditDrawer(false)}>Cancel</Button>
            <Button type="primary" onClick={handleSave}>
              Save Changes
            </Button>
          </Space>
        }
      >
        {initialCols.map((col) => (
          <div key={col} style={{ marginBottom: 16 }}>
            <label style={{ fontWeight: 600 }}>
              {col.charAt(0).toUpperCase() + col.slice(1)}:
            </label>
            <Input
              placeholder="(leave blank to skip)"
              value={bulkEdits[col] || ""}
              onChange={(e) =>
                setBulkEdits((prev) => ({
                  ...prev,
                  [col]: e.target.value,
                }))
              }
            />
          </div>
        ))}
        <Tag color="blue">Leave fields blank to skip them</Tag>
      </Drawer>

      <Modal
        open={showHistoryModal}
        onCancel={() => setShowHistoryModal(false)}
        title="BOM History Logs"
        width="80%"
        footer={[
          <Button key="excel" icon={<FileExcelOutlined />} onClick={exportHistoryExcel}>
            Export Excel
          </Button>,
          <Button key="pdf" icon={<FileTextOutlined />} onClick={exportHistoryPDF}>
            Export PDF
          </Button>,
          <Button key="close" onClick={() => setShowHistoryModal(false)}>
            Close
          </Button>,
        ]}
      >
        <Table
          dataSource={history}
          rowKey={(_, i) => i}
          columns={[
            { title: "Timestamp", dataIndex: "timestamp" },
            { title: "User", dataIndex: "user" },
            { title: "Action", dataIndex: "action" },
            { title: "# SKUs", dataIndex: "count" },
            {
              title: "SKU List",
              dataIndex: "skus",
              render: (skus) =>
                skus.length > 5
                  ? `${skus.slice(0, 5).join(", ")}... (${skus.length} total)`
                  : skus.join(", "),
              ellipsis: true,
            },
          ]}
          pagination={{ pageSize: 10 }}
        />
      </Modal>
    </div>
  );
}