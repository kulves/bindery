import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BinderyApp } from "@/components/bindery-app";
import "@/styles.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <BinderyApp />
    </StrictMode>,
  );
}
