import React, { Component } from "react";
import {
  recordDiagnosticError,
  sanitizeDiagnosticText,
} from "@/components/mg/diagnostics";

export default class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      message: "",
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || "This screen could not be opened.",
    };
  }

  componentDidCatch(error, info) {
    recordDiagnosticError(
      error,
      `screen:${String(this.props.label || "unknown")}`
    );

    console.error(
      "Media God page error:",
      sanitizeDiagnosticText(error?.message || error),
      sanitizeDiagnosticText(info?.componentStack || "")
    );
  }

  componentDidUpdate(prevProps) {
    if (
      prevProps.resetKey !== this.props.resetKey &&
      this.state.hasError
    ) {
      this.setState({
        hasError: false,
        message: "",
      });
    }
  }

  retry = () => {
    this.setState({
      hasError: false,
      message: "",
    });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const label = String(this.props.label || "screen");

    return (
      <div className="flex min-h-[40vh] w-full items-center justify-center p-4 md:p-6">
        <div
          role="alert"
          className="w-full max-w-lg rounded-xl border border-red-500/30 bg-mg-surface p-5 text-white shadow-2xl"
        >
          <h2 className="text-lg font-bold">Could not open {label}</h2>
          <p className="mt-2 text-sm text-white/60">
            Media God contained the problem to this screen instead of letting it blank the whole app.
          </p>
          <p className="mt-3 break-words rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-red-300">
            {sanitizeDiagnosticText(this.state.message)}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={this.retry}
              className="min-h-11 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-mg-green"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => this.props.onHome?.()}
              className="min-h-11 rounded-lg bg-mg-green px-4 py-2 text-sm font-semibold text-black focus:outline-none focus:ring-2 focus:ring-mg-green"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
