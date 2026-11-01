import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./shared/auth/AuthContext";
import { ScreenshotGuard } from "./shared/components/ScreenshotGuard";
import { ToastProvider } from "./shared/components/Toast";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <App />
          <ScreenshotGuard />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
