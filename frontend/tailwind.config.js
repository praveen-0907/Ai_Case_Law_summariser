/* tailwind.config.js */
/* This file tells Tailwind CSS where to look for our React component files */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}", // Scan all JS/JSX files inside src folder
  ],
  theme: {
    extend: {}, // You can add custom colors or fonts here later
  },
  plugins: [],
}
