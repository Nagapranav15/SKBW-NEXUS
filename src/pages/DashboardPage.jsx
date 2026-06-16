import React from "react";
import { FaUsers, FaBoxes, FaCogs, FaFileInvoice, FaShoppingCart } from "react-icons/fa";
import "./DashboardPage.css";

const cards = [
  { title: "Users", icon: <FaUsers />, link: "/users" },
  { title: "Stock", icon: <FaBoxes />, link: "/stocks" },
  { title: "Products", icon: <FaCogs />, link: "/products" },
  { title: "Invoices", icon: <FaFileInvoice />, link: "/invoices" },
  { title: "Orders", icon: <FaShoppingCart />, link: "/orders" },
];

export default function DashboardPage() {
  return (
    <div className="dashboard">
      <h2 className="dashboard-title">Welcome to SKBW ERP</h2>
      <div className="dashboard-cards">
        {cards.map((card) => (
          <a className="card" href={card.link} key={card.title}>
            <div className="card-icon">{card.icon}</div>
            <div className="card-title">{card.title}</div>
          </a>
        ))}
      </div>
    </div>
  );
}