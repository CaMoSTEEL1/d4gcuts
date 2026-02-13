import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import OwnerGate from "./OwnerGate.jsx";

const isOwnerPage = window.location.pathname === "/owner";

const hideBootstrapFallback = () => {
  const fallback = document.getElementById("bootstrap-fallback");
  if (fallback) fallback.style.display = "none";
};

hideBootstrapFallback();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {isOwnerPage ? <OwnerGate /> : <App />}
  </StrictMode>
);
