import { Link, useLocation, useNavigate } from "react-router-dom";
import { LuCoffee, LuUser, LuLogOut, LuSettings } from "react-icons/lu";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useState, useRef, useEffect } from "react";
import QuickTeaConsumption from "@/components/QuickTeaConsumption/QuickTeaConsumption";
import { useQuery } from "@tanstack/react-query";
import { teaApi, Tea } from "@/api/tea";

const navLinks = [
  { to: "/shops", label: "Shops" },
  { to: "/tea-qualities", label: "Qualities" },
  { to: "/teas", label: "Teas" },
  { to: "/ingredients", label: "Ingredients" },
  { to: "/ratings", label: "Ratings" },
];

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const { data: teas } = useQuery<Tea[]>({
    queryKey: ['teas'],
    queryFn: teaApi.getTeas,
    enabled: !!user,
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/signin");
  };

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-10 px-6 py-3">
        {/* Brand/Logo */}
        <Link to="/" className="flex items-center gap-2 font-bold text-xl text-primary-dark tracking-tight hover:text-primary transition-colors">
          <LuCoffee className="w-6 h-6" />
          Herbatka
        </Link>

        {/* Navigation */}
        <nav className="flex-1">
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

        {/* Auth Buttons */}
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <QuickTeaConsumption />
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 text-gray-600 hover:text-primary-dark transition-colors"
                >
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.username}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <LuUser className="w-5 h-5" />
                  )}
                  <span className="font-medium">{user.username}</span>
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-1">
                    <Link
                      to="/profile"
                      className="block px-4 py-2 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <LuSettings className="w-4 h-4" />
                      Profile Settings
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <LuLogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link to="/signin">
                <Button variant="ghost">Sign in</Button>
              </Link>
              <Link to="/signup">
                <Button variant="solid">Sign up</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;