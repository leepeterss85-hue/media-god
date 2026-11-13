import { Component, Suspense } from 'react';

// Keep the player provider mounted while the Home chunk loads.
export default class RouteLoader extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div role="alert" className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-6 text-foreground">
          <h1 className="text-xl font-semibold">Media God could not finish loading</h1>
          <p>Check your connection, then try again.</p>
          <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-primary px-5 py-3 text-primary-foreground">Reload Media God</button>
          <a href="/open.html" className="underline">Help opening in your browser</a>
        </div>
      );
    }
    return (
      <Suspense fallback={<div role="status" className="min-h-screen flex items-center justify-center bg-background p-6 text-foreground">Loading Media God…</div>}>
        {this.props.children}
      </Suspense>
    );
  }
}
