import React from "react";

interface TagProps {
  children: React.ReactNode;
  color?: React.CSSProperties["color"];
}

const Tag = ({ children, color = "#f3f4f6" }: TagProps) => {
  return (
    <div
      className="text-sm py-1 px-2 rounded-md bg-[var(--tag-color)] inline-flex"
      style={{ "--tag-color": color } as React.CSSProperties}
    >
      {children}
    </div>
  );
};

export default Tag;
