import { Link, useLocation } from "react-router-dom";
import { LuCoffee } from "react-icons/lu";

const navLinks = [
  { to: "/shops", label: "Shops" },
  { to: "/tea-qualities", label: "Qualities" },
  { to: "/teas", label: "Teas" },
  { to: "/ingredients", label: "Ingredients" },
];

const Header = () => {
  const location = useLocation();

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto flex items-center gap-10 px-6 py-3">
        {/* Brand/Logo */}
        <Link to="/" className="flex items-center gap-2 font-bold text-xl text-primary-dark tracking-tight">
          <LuCoffee className="w-6 h-6" />
          Herbatka
        </Link>

        {/* Navigation */}
        <nav>
          <ul className="flex items-center gap-6">
            {navLinks.map((link) => {
              const isActive = location.pathname.startsWith(link.to);

              return (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className={
                      `transition-colors px-2 py-1 font-medium ` +
                      (isActive
                        ? "text-primary-dark"
                        : "text-gray-600 hover:text-primary-dark")
                    }
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
};

export default Header;
