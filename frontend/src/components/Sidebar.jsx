import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Settings, LogOut } from "lucide-react";
import { motion } from "framer-motion";

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const menu = [
    { name: "Dashboard", path: "/", icon: <LayoutDashboard size={20} /> },
    { name: "Settings", path: "/settings", icon: <Settings size={20} /> },
  ];

  return (
    <motion.div
      animate={{ width: collapsed ? "4rem" : "14rem" }}
      className="bg-white dark:bg-gray-800 shadow-md h-full flex flex-col"
    >
      <button
        className="p-3 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
        onClick={() => setCollapsed(!collapsed)}
      >
        ☰
      </button>

      <nav className="flex-1 px-2 space-y-2">
        {menu.map((item) => (
          <Link
            key={item.name}
            to={item.path}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition ${
              location.pathname === item.path
                ? "bg-blue-500 text-white"
                : "text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {item.icon}
            {!collapsed && <span>{item.name}</span>}
          </Link>
        ))}
      </nav>

      <div className="p-3 border-t dark:border-gray-700">
        <button className="flex items-center gap-2 w-full text-red-500 hover:bg-red-50 dark:hover:bg-red-900 px-2 py-2 rounded-lg">
          <LogOut size={20} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </motion.div>
  );
}
