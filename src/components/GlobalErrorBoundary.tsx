import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // 發生錯誤時更新 state 讓後續 render 可以顯示 fallback UI
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 可以在這裡把錯誤寫入 console 或其他的本地紀錄工具
    console.error('Uncaught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    // 強制清除可能快取並重新載入網頁
    window.location.reload();
  };

  private handleClearData = () => {
    // 預防如果是登入資料錯誤導致無限崩潰，提供強制清空的最後手段
    if (window.confirm('確定要清除所有本地資料並登出嗎？這將會清除您當前裝置上未同步的登入狀態。')) {
      localStorage.clear();
      sessionStorage.clear();
      
      // 徹底解除註冊所有 Service Workers (破除 PWA 舊版快取死鎖)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (let registration of registrations) {
            registration.unregister();
          }
          // 強制重新跳轉，觸發向伺服器拉取最新檔案
          window.location.href = '/';
        });
      } else {
        window.location.href = '/';
      }
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-slate-200">
          <div className="max-w-md w-full bg-slate-800 rounded-2xl shadow-2xl p-8 border border-red-500/30">
            <div className="flex justify-center mb-6">
              <div className="p-4 bg-red-500/20 rounded-full">
                <AlertCircle className="w-12 h-12 text-red-400" />
              </div>
            </div>
            
            <h1 className="text-2xl font-bold text-center text-white mb-2">哎呀！應用程式發生錯誤</h1>
            <p className="text-slate-400 text-center mb-6">
              非常抱歉，應用程式在執行過程中遇到預期外的狀況。<br />這通常是因為版本更新後檔案遺失或資料格式不符所導致。
            </p>

            {this.state.error && (
              <div className="mb-6 p-4 bg-slate-900 rounded-lg border border-slate-700 overflow-auto max-h-32">
                <p className="text-red-400 font-mono text-sm break-words flex flex-col gap-1">
                  <span className="font-bold border-b border-slate-700 pb-1 mb-1 bg-red-950/30 inline-block">錯誤訊息：</span>
                  {this.state.error.toString()}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleReload}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-medium transition-colors"
              >
                <RefreshCw className="w-5 h-5" />
                重新載入應用程式
              </button>
              
              <button
                onClick={this.handleClearData}
                className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-300 py-3 rounded-lg font-medium transition-colors"
              >
                <Home className="w-5 h-5" />
                清除本地快取並回首頁
              </button>
            </div>
            
            <p className="text-xs text-slate-500 text-center mt-6">
              如果您重複遇到此問題，請截圖此畫面並通知開發團隊。
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
