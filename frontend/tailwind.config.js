/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"], // Ensure all your files are included
  theme: {
    extend: {
      colors: {
        primary: {
          light: "#A6C8E5", // Soft light pastel blue
          DEFAULT: "#7BA7CC", // Muted pastel blue
          dark: "#4F86B3", // Deep pastel blue
        },
        secondary: {
          light: "#C1D9EC", // Light pastel teal
          DEFAULT: "#98BDD4", // Muted teal blue
          dark: "#6A9DB9", // Dark teal blue
        },
        accent: {
          light: "#BDD9F1", // Very soft aqua
          DEFAULT: "#8CBCE0", // Muted aqua
          dark: "#5A9BC8", // Dark aqua
        },
        neutral: {
          light: "#E4EBF3", // Light grayish-blue
          DEFAULT: "#CBD5E0", // Muted gray
          dark: "#9DA8B6", // Dark grayish-blue
        },
        background: {
          light: "#F4F7FB", // Pale blue background
          DEFAULT: "#E2EAF3", // Soft blue-gray
          dark: "#B8C8D9", // Darker muted blue
        },
        text: {
          light: "#8BA5BF", // Light text
          DEFAULT: "#5F7995", // Default dark pastel blue text
          dark: "#3A516A", // Very dark pastel blue
        },
      },
    },
  },
  plugins: [],
};
