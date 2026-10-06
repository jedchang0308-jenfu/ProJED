import React, { useEffect, useState } from 'react';
import { Check, CircleUserRound, Mail, Save } from 'lucide-react';
import useAuthStore from '../store/useAuthStore';

const MAX_DISPLAY_NAME_LENGTH = 50;

const AccountProfileSettings: React.FC = () => {
  const user = useAuthStore(state => state.user);
  const updateDisplayName = useAuthStore(state => state.updateDisplayName);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setDisplayName(user?.displayName ?? '');
    setErrorMessage('');
    setIsSaved(false);
  }, [user?.uid, user?.displayName]);

  if (!user) {
    return (
      <section className="border border-slate-200 bg-white p-6" data-account-profile-settings="true">
        <p className="text-sm text-slate-500">目前沒有可編輯的登入帳號。</p>
      </section>
    );
  }

  const trimmedDisplayName = displayName.trim();
  const savedDisplayName = user.displayName?.trim() ?? '';
  const hasChanges = trimmedDisplayName !== savedDisplayName;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaved(false);
    setErrorMessage('');

    if (!trimmedDisplayName) {
      setErrorMessage('請輸入顯示名稱。');
      return;
    }
    if (trimmedDisplayName.length > MAX_DISPLAY_NAME_LENGTH) {
      setErrorMessage(`顯示名稱最多 ${MAX_DISPLAY_NAME_LENGTH} 個字元。`);
      return;
    }
    if (!hasChanges) return;

    setIsSaving(true);
    try {
      await updateDisplayName(trimmedDisplayName);
      setDisplayName(trimmedDisplayName);
      setIsSaved(true);
    } catch (error: any) {
      setErrorMessage(error?.message || '顯示名稱儲存失敗，請稍後再試。');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="space-y-3" data-account-profile-settings="true">
      <div className="flex items-center gap-2 border border-slate-200 bg-white px-3 py-2" data-account-profile-scope="account">
        <span className="text-xs font-bold text-slate-400">設定範圍</span>
        <span className="text-sm font-bold text-slate-800">目前帳號</span>
      </div>

      <form onSubmit={handleSubmit} className="border border-slate-200 bg-white p-4 sm:p-6">
        <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white">
            <CircleUserRound size={21} />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-900">個人資料</h3>
            <p className="mt-1 text-sm leading-5 text-slate-500">
              自訂在側欄、任務指派、紀錄與協作者清單中顯示的名稱。
            </p>
          </div>
        </div>

        <div className="mt-5 grid max-w-2xl gap-4">
          <div>
            <label htmlFor="account-display-name" className="mb-1.5 block text-sm font-semibold text-slate-700">
              顯示名稱
            </label>
            <input
              id="account-display-name"
              value={displayName}
              onChange={event => {
                setDisplayName(event.target.value);
                setErrorMessage('');
                setIsSaved(false);
              }}
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              autoComplete="name"
              placeholder="請輸入顯示名稱"
              aria-invalid={Boolean(errorMessage)}
              aria-describedby={errorMessage ? 'account-display-name-error' : 'account-display-name-help'}
              data-account-profile-display-name="true"
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <div id="account-display-name-help" className="mt-1 flex justify-between gap-3 text-xs text-slate-400">
              <span>最多 {MAX_DISPLAY_NAME_LENGTH} 個字元</span>
              <span>{displayName.length}/{MAX_DISPLAY_NAME_LENGTH}</span>
            </div>
            {errorMessage && (
              <p id="account-display-name-error" className="mt-1.5 text-sm text-red-600" role="alert" data-account-profile-error="true">
                {errorMessage}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="account-email" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Email
            </label>
            <div className="relative">
              <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="account-email"
                value={user.email ?? ''}
                readOnly
                type="email"
                autoComplete="email"
                data-account-profile-email="true"
                className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-500 outline-none"
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">Email 由登入帳號自動帶入，無法在此修改。</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          <button
            type="submit"
            disabled={isSaving || !hasChanges}
            data-account-profile-save="true"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-white shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={15} />
            {isSaving ? '儲存中...' : '儲存變更'}
          </button>
          {isSaved && (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600" role="status" data-account-profile-saved="true">
              <Check size={16} />
              已儲存
            </span>
          )}
        </div>
      </form>
    </section>
  );
};

export default AccountProfileSettings;
