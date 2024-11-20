import { Link } from "react-router-dom";
import React from "react";

const Header = () => {
  return (
    <header className="border-b border-gray-200 py-4 px-10">
      <nav>
        <ul className="flex items-center gap-4">
          <li className="text-gray-600 hover:text-primary-dark hover:underline">
            <Link to="/shops">Shops</Link>
          </li>
          <li className="text-gray-600 hover:text-primary-dark hover:underline">
            <Link to="/contact">Contact</Link>
          </li>
        </ul>
      </nav>
    </header>
  );
};

export default Header;
