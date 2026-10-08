import React from 'react';

interface ReceiveQrBoundaryProps {
  children: React.ReactNode;
  fallback: React.ReactNode;
  /** Called after a QR render exception, without exposing the error or payload. */
  onUnavailable?: () => void;
  /** Called after a new QR subtree mounts successfully. */
  onReady?: () => void;
}

interface ReceiveQrBoundaryState {
  unavailable: boolean;
}

/**
 * Keep a failure inside the QR widget from replacing the entire receive screen.
 * Key this boundary by QR payload so a changed request can retry rendering.
 *
 * QR errors can contain user-provided memos or URI details, so deliberately do
 * not log or report raw error objects. The screen still exposes the address.
 */
export class ReceiveQrBoundary extends React.Component<
  ReceiveQrBoundaryProps,
  ReceiveQrBoundaryState
> {
  public state: ReceiveQrBoundaryState = { unavailable: false };

  public static getDerivedStateFromError(): ReceiveQrBoundaryState {
    return { unavailable: true };
  }

  public componentDidCatch(): void {
    this.props.onUnavailable?.();
  }

  public componentDidMount(): void {
    if (!this.state.unavailable) {
      this.props.onReady?.();
    }
  }

  public render(): React.ReactNode {
    return this.state.unavailable ? this.props.fallback : this.props.children;
  }
}
