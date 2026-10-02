'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parseAppError } from '@/lib/error-handler';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled UI Exception caught by AppErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleGoHome = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const parsed = parseAppError(this.state.error);

      return (
        <div className="min-h-[400px] flex items-center justify-center p-6 bg-background">
          <div className="max-w-md w-full bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-xl text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-black text-white flex items-center justify-center shadow-md">
              <AlertCircle className="h-6 w-6 text-white" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-xl font-bold font-headline text-foreground">
                {parsed.title || 'Something went wrong'}
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                {parsed.message || 'An unexpected error interrupted this view. Your saved records remain secure.'}
              </p>
            </div>

            {this.state.error?.message && (
              <div className="p-3 bg-muted rounded-xl text-[11px] font-mono text-foreground text-left overflow-x-auto max-h-24">
                {this.state.error.message}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                onClick={this.handleReset}
                className="flex-1 rounded-xl font-bold text-xs h-10 gap-1.5 bg-primary hover:bg-primary/90 text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Try Again
              </Button>
              <Button
                variant="outline"
                onClick={this.handleGoHome}
                className="flex-1 rounded-xl font-bold text-xs h-10 gap-1.5 border-border"
              >
                <Home className="h-3.5 w-3.5" /> Return Home
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
