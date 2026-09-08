import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true }; }
  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "20px", color: "red", backgroundColor: "black", minHeight: "100vh" }}>
          <h2>Something went wrong.</h2>
          <details style={{ whiteSpace: "pre-wrap" }}>
            <summary>Stack Trace</summary>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

import { Analytics } from "@vercel/analytics/react";

function VersionChecker() {
  React.useEffect(() => {
    // Only poll in production/when running built app
    if (import.meta.env.DEV) return;
    
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/version.txt?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const version = await res.text();
        const cleanVersion = version.trim();
        
        const localVersion = localStorage.getItem('appVersion');
        if (localVersion && localVersion !== cleanVersion) {
          localStorage.setItem('appVersion', cleanVersion);
          window.location.reload(true);
        } else if (!localVersion) {
          localStorage.setItem('appVersion', cleanVersion);
        }
      } catch (e) {
        // Ignore fetch errors
      }
    }, 60000); // Check every 60 seconds
    
    return () => clearInterval(interval);
  }, []);
  
  return null;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <VersionChecker />
      <App />
      <Analytics />
    </ErrorBoundary>
  </React.StrictMode>
);
