// Stands in for @backtrace/react, so the app reports errors to no one: the benchmark makes no request outside
// localhost. ErrorBoundary keeps the real one's behavior of rendering `fallback` once a child throws.
import { Component } from "react";

export const BacktraceClient = {
  initialize() {},
  instance: { send() {} },
};

export class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
