import React, { useState } from 'react';
import {
  Bell,
  Plus,
  Trash2,
  Edit2,
  Power,
  Upload,
  Image as ImageIcon,
  Clock,
  Sparkles,
  Link,
  Users,
  CheckCircle2,
  AlertCircle,
  X,
  Play,
  Pause,
} from 'lucide-react';
import {
  NotificationDocument,
  NotificationType,
  ScheduleType,
  NotificationStatus,
  ThemeMode,
} from '../types';

interface NotificationsTabProps {
  notifications: NotificationDocument[];
  onSaveNotification: (data: Omit<NotificationDocument, 'id'> & { id?: string }) => Promise<void>;
  onDeleteNotification: (id: string) => Promise<void>;
  onToggleNotificationStatus: (id: string, currentStatus: NotificationStatus) => Promise<void>;
  theme: ThemeMode;
}

export const NotificationsTab: React.FC<NotificationsTabProps> = ({
  notifications,
  onSaveNotification,
  onDeleteNotification,
  onToggleNotificationStatus,
  theme,
}) => {
  const isDark = theme === 'dark';

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notificationType, setNotificationType] = useState<NotificationType>('instant');
  const [template, setTemplate] = useState<string>('[photo] {name} just posted a video, checkout now');
  const [namesInput, setNamesInput] = useState<string>('Ashley, Emily, Brianna, Megan');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [targetUrl, setTargetUrl] = useState<string>('index.html');
  const [scheduleType, setScheduleType] = useState<ScheduleType>('fixed');
  const [intervalHours, setIntervalHours] = useState<number>(2);
  const [status, setStatus] = useState<NotificationStatus>('active');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Parse comma-separated names list
  const parsedNamesList = namesInput
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  // Reset form to defaults
  const resetForm = () => {
    setEditingId(null);
    setNotificationType('instant');
    setTemplate('[photo] {name} just posted a video, checkout now');
    setNamesInput('Ashley, Emily, Brianna, Megan');
    setImageUrl('');
    setTargetUrl('index.html');
    setScheduleType('fixed');
    setIntervalHours(2);
    setStatus('active');
    setFeedback(null);
  };

  // Populate form for editing
  const handleEdit = (item: NotificationDocument) => {
    setEditingId(item.id);
    setNotificationType(item.type);
    setTemplate(item.template);
    setNamesInput(item.namesList ? item.namesList.join(', ') : '');
    setImageUrl(item.imageUrl || '');
    setTargetUrl(item.targetUrl || 'index.html');
    if (item.scheduleType) setScheduleType(item.scheduleType);
    if (item.intervalHours) setIntervalHours(item.intervalHours);
    setStatus(item.status);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Image Upload Handler (reads PNG/JPG file to Base64)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setFeedback({ type: 'error', message: 'Image size exceeds 2MB limit. Please upload a smaller file.' });
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setImageUrl(reader.result as string);
        setFeedback({ type: 'success', message: 'Image loaded successfully.' });
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!template.trim()) {
      setFeedback({ type: 'error', message: 'Please provide a message template text.' });
      return;
    }

    if (parsedNamesList.length === 0) {
      setFeedback({ type: 'error', message: 'Please enter at least one name in the names list.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      await onSaveNotification({
        id: editingId || undefined,
        type: notificationType,
        template: template.trim(),
        namesList: parsedNamesList,
        imageUrl: imageUrl.trim(),
        targetUrl: targetUrl.trim() || 'index.html',
        scheduleType: notificationType === 'daily' ? scheduleType : undefined,
        intervalHours: notificationType === 'daily' ? Number(intervalHours) : undefined,
        status,
        createdAt: new Date(),
      });

      setFeedback({
        type: 'success',
        message: editingId
          ? 'Notification template updated successfully!'
          : 'New notification created & published successfully!',
      });

      resetForm();
    } catch (err) {
      console.error('Save notification error:', err);
      setFeedback({ type: 'error', message: 'Failed to save notification. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* SECTION A: CREATE / EDIT NOTIFICATION FORM */}
      <div
        className={`border rounded-2xl p-5 sm:p-6 shadow-sm transition-all ${
          isDark ? 'bg-zinc-900/90 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/60">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-red-600/10 text-red-500 border border-red-600/20">
                <Bell className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight">
                {editingId ? 'Edit Notification Template' : 'Create Notification'}
              </h2>
            </div>
            <p className={`text-xs mt-1 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Publish instant push events or schedule automated daily periodic push templates.
            </p>
          </div>

          {editingId && (
            <button
              onClick={resetForm}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all flex items-center gap-1.5 ${
                isDark
                  ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                  : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-300'
              }`}
            >
              <X className="w-3.5 h-3.5 text-red-500" />
              <span>Cancel Edit</span>
            </button>
          )}
        </div>

        {/* Feedback Alert Banner */}
        {feedback && (
          <div
            className={`mt-4 p-3.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                : 'bg-red-950/60 text-red-400 border-red-800'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* 1. Notification Type Selector */}
          <div>
            <label className={`block text-xs font-extrabold uppercase tracking-wider mb-2 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              Notification Type
            </label>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <button
                type="button"
                onClick={() => setNotificationType('instant')}
                className={`py-3 px-4 rounded-xl text-xs font-black border transition-all flex items-center justify-center gap-2 ${
                  notificationType === 'instant'
                    ? 'bg-red-600 text-white border-red-600 shadow-md shadow-red-600/20'
                    : isDark
                    ? 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                    : 'bg-zinc-50 text-zinc-600 border-zinc-300 hover:text-zinc-900'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>Instant Notification</span>
              </button>

              <button
                type="button"
                onClick={() => setNotificationType('daily')}
                className={`py-3 px-4 rounded-xl text-xs font-black border transition-all flex items-center justify-center gap-2 ${
                  notificationType === 'daily'
                    ? 'bg-red-600 text-white border-red-600 shadow-md shadow-red-600/20'
                    : isDark
                    ? 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                    : 'bg-zinc-50 text-zinc-600 border-zinc-300 hover:text-zinc-900'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>Daily Scheduled</span>
              </button>
            </div>
          </div>

          {/* 2. Notification Message Template Input */}
          <div>
            <label className={`block text-xs font-extrabold uppercase tracking-wider mb-1.5 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              Notification Message Template
            </label>
            <input
              type="text"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="[photo] {name} just posted a video, checkout now"
              className={`w-full px-4 py-2.5 rounded-xl border text-xs font-medium focus:outline-none focus:border-red-600 font-mono ${
                isDark
                  ? 'bg-zinc-950 text-white border-zinc-800 placeholder-zinc-600'
                  : 'bg-zinc-50 text-zinc-900 border-zinc-300 placeholder-zinc-400'
              }`}
            />
            <p className={`text-[11px] mt-1 ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
              Supported placeholders: <code className="text-red-500 font-bold">{'{name}'}</code> (replaces with dynamic name), <code className="text-red-500 font-bold">[photo]</code>
            </p>
          </div>

          {/* 3. Comma-Separated Names List Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={`block text-xs font-extrabold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                Target Names List (Comma Separated)
              </label>
              <span className="text-[11px] font-bold text-red-500">
                {parsedNamesList.length} Names parsed
              </span>
            </div>
            <textarea
              rows={3}
              value={namesInput}
              onChange={(e) => setNamesInput(e.target.value)}
              placeholder="Ashley, Emily, Brianna, Megan"
              className={`w-full px-4 py-2.5 rounded-xl border text-xs font-mono font-medium focus:outline-none focus:border-red-600 ${
                isDark
                  ? 'bg-zinc-950 text-white border-zinc-800 placeholder-zinc-600'
                  : 'bg-zinc-50 text-zinc-900 border-zinc-300 placeholder-zinc-400'
              }`}
            />
            {parsedNamesList.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {parsedNamesList.map((name, idx) => (
                  <span
                    key={idx}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                      isDark
                        ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                        : 'bg-zinc-200 text-zinc-800 border-zinc-300'
                    }`}
                  >
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 4. Photo / Image Upload */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={`block text-xs font-extrabold uppercase tracking-wider mb-1.5 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                Notification Image / Thumbnail
              </label>
              <div className="flex items-center gap-2">
                <label
                  className={`flex-1 py-2.5 px-3 rounded-xl border border-dashed cursor-pointer text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    isDark
                      ? 'bg-zinc-950 border-zinc-700 hover:border-red-500 text-zinc-300'
                      : 'bg-zinc-50 border-zinc-300 hover:border-red-500 text-zinc-700'
                  }`}
                >
                  <Upload className="w-4 h-4 text-red-500" />
                  <span>Choose PNG/JPG File</span>
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/webp"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="mt-2">
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="Or paste image URL (Base64 or HTTPS)..."
                  className={`w-full px-3 py-2 rounded-xl border text-[11px] font-mono focus:outline-none focus:border-red-600 ${
                    isDark
                      ? 'bg-zinc-950 text-white border-zinc-800 placeholder-zinc-600'
                      : 'bg-zinc-50 text-zinc-900 border-zinc-300 placeholder-zinc-400'
                  }`}
                />
              </div>
            </div>

            {/* Image Preview Box */}
            <div>
              <label className={`block text-xs font-extrabold uppercase tracking-wider mb-1.5 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                Thumbnail Preview
              </label>
              <div
                className={`h-24 rounded-xl border flex items-center justify-center overflow-hidden relative ${
                  isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-100 border-zinc-200'
                }`}
              >
                {imageUrl ? (
                  <>
                    <img src={imageUrl} alt="Notification preview" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="absolute top-1 right-1 p-1 rounded-lg bg-black/80 text-white hover:text-red-400 transition-colors"
                      title="Remove image"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <div className="text-center p-3 text-zinc-500">
                    <ImageIcon className="w-6 h-6 mx-auto mb-1 text-zinc-600" />
                    <span className="text-[11px]">No thumbnail selected</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 5. Schedule Options (Visible ONLY when "daily" selected) */}
          {notificationType === 'daily' && (
            <div
              className={`p-4 rounded-xl border space-y-4 animate-in fade-in duration-200 ${
                isDark ? 'bg-zinc-950/80 border-red-950/60' : 'bg-red-50/50 border-red-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-red-500" />
                <h3 className="text-xs font-black uppercase tracking-wider text-red-500">
                  Daily Schedule Configuration
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    Interval Schedule Type
                  </label>
                  <select
                    value={scheduleType}
                    onChange={(e) => setScheduleType(e.target.value as ScheduleType)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-bold focus:outline-none focus:border-red-600 ${
                      isDark ? 'bg-zinc-900 text-white border-zinc-800' : 'bg-white text-zinc-900 border-zinc-300'
                    }`}
                  >
                    <option value="fixed">Fixed Interval (Exact Hours)</option>
                    <option value="random">Random Interval (Variable Offset)</option>
                  </select>
                </div>

                <div>
                  <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    Interval Frequency (Hours)
                  </label>
                  <select
                    value={intervalHours}
                    onChange={(e) => setIntervalHours(Number(e.target.value))}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-bold focus:outline-none focus:border-red-600 ${
                      isDark ? 'bg-zinc-900 text-white border-zinc-800' : 'bg-white text-zinc-900 border-zinc-300'
                    }`}
                  >
                    <option value={1}>Every 1 Hour</option>
                    <option value={2}>Every 2 Hours</option>
                    <option value={4}>Every 4 Hours</option>
                    <option value={6}>Every 6 Hours</option>
                    <option value={12}>Every 12 Hours</option>
                    <option value={24}>Every 24 Hours (Daily)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Target URL Field */}
          <div>
            <label className={`block text-xs font-extrabold uppercase tracking-wider mb-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              Target Click Action URL
            </label>
            <div className="relative">
              <Link className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="index.html"
                className={`w-full pl-9 pr-3 py-2 rounded-xl border text-xs font-mono font-medium focus:outline-none focus:border-red-600 ${
                  isDark
                    ? 'bg-zinc-950 text-white border-zinc-800 placeholder-zinc-600'
                    : 'bg-zinc-50 text-zinc-900 border-zinc-300 placeholder-zinc-400'
                }`}
              />
            </div>
          </div>

          {/* Submit Action Button */}
          <div className="pt-2 flex items-center justify-end gap-3">
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className={`px-4 py-2.5 rounded-xl text-xs font-extrabold border transition-all ${
                  isDark
                    ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                    : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-300'
                }`}
              >
                Cancel
              </button>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold flex items-center gap-2 shadow-lg shadow-red-600/30 transition-all active:scale-95 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving...' : editingId ? 'Update Notification' : 'Publish / Schedule Notification'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* SECTION B: MANAGING CREATED NOTIFICATIONS (TABLE LIST) */}
      <div
        className={`border rounded-2xl shadow-sm overflow-hidden ${
          isDark ? 'bg-zinc-900/90 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
        }`}
      >
        <div className="p-4 sm:p-5 border-b border-zinc-800/60 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black flex items-center gap-2">
              <Bell className="w-5 h-5 text-red-600" />
              <span>Published Notifications</span>
            </h2>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Manage active push event templates in Firestore
            </p>
          </div>

          <span
            className={`px-3 py-1 rounded-lg text-xs font-extrabold border ${
              isDark
                ? 'bg-red-950 text-red-400 border-red-900'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}
          >
            {notifications.length} Templates
          </span>
        </div>

        {/* Notifications Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr
                className={`border-b text-[11px] font-black uppercase tracking-wider ${
                  isDark
                    ? 'bg-zinc-950 border-zinc-800 text-zinc-400'
                    : 'bg-zinc-100 border-zinc-200 text-zinc-600'
                }`}
              >
                <th className="py-3.5 px-4">Thumbnail</th>
                <th className="py-3.5 px-4">Type</th>
                <th className="py-3.5 px-4">Template Text</th>
                <th className="py-3.5 px-4">Names Count</th>
                <th className="py-3.5 px-4">Schedule Interval</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-zinc-800/60' : 'divide-zinc-100'}`}>
              {notifications.length === 0 ? (
                <tr>
                  <td colSpan={7} className={`py-12 text-center ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    <Bell className="w-8 h-8 mx-auto mb-2 text-zinc-600 opacity-60" />
                    <p className="font-bold text-sm">No notification templates published yet.</p>
                    <p className="text-xs mt-1">Use the form above to create your first notification.</p>
                  </td>
                </tr>
              ) : (
                notifications.map((item) => (
                  <tr
                    key={item.id}
                    className={`transition-colors ${isDark ? 'hover:bg-zinc-800/50' : 'hover:bg-zinc-50'}`}
                  >
                    {/* Thumbnail Preview */}
                    <td className="py-3 px-4">
                      <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700/80 overflow-hidden flex items-center justify-center flex-shrink-0">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-zinc-500" />
                        )}
                      </div>
                    </td>

                    {/* Type */}
                    <td className="py-3 px-4">
                      {item.type === 'instant' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-600/10 text-emerald-500 border border-emerald-500/20">
                          <Sparkles className="w-3 h-3" />
                          Instant
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-red-600/10 text-red-500 border border-red-500/20">
                          <Clock className="w-3 h-3" />
                          Daily
                        </span>
                      )}
                    </td>

                    {/* Template Text */}
                    <td className="py-3 px-4 font-mono font-medium max-w-xs truncate">
                      <span className={isDark ? 'text-zinc-200' : 'text-zinc-800'}>
                        {item.template}
                      </span>
                    </td>

                    {/* Names Count */}
                    <td className="py-3 px-4 font-bold">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300">
                        <Users className="w-3 h-3 text-red-500" />
                        {item.namesList ? item.namesList.length : 0} Names
                      </span>
                    </td>

                    {/* Schedule Interval */}
                    <td className="py-3 px-4 font-mono text-[11px] text-zinc-400">
                      {item.type === 'daily' ? (
                        <span>
                          {item.scheduleType === 'random' ? 'Random' : 'Fixed'} (Every {item.intervalHours || 2}h)
                        </span>
                      ) : (
                        <span className="text-zinc-500">Immediate</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      {item.status === 'active' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white shadow-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-zinc-600 text-white">
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-300" />
                          Paused
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Edit Button */}
                        <button
                          onClick={() => handleEdit(item)}
                          title="Edit Notification"
                          className={`p-1.5 rounded-lg transition-all ${
                            isDark
                              ? 'bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700'
                              : 'bg-zinc-100 text-zinc-700 hover:text-zinc-900 hover:bg-zinc-200'
                          }`}
                        >
                          <Edit2 className="w-3.5 h-3.5 text-red-500" />
                        </button>

                        {/* Toggle Status */}
                        <button
                          onClick={() => onToggleNotificationStatus(item.id, item.status)}
                          title={item.status === 'active' ? 'Pause Notification' : 'Activate Notification'}
                          className={`p-1.5 rounded-lg transition-all ${
                            item.status === 'active'
                              ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/40 hover:bg-emerald-900/60'
                              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                          }`}
                        >
                          {item.status === 'active' ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5 text-emerald-500" />
                          )}
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => onDeleteNotification(item.id)}
                          title="Delete Notification"
                          className="p-1.5 rounded-lg bg-red-950/40 text-red-500 hover:bg-red-900/60 border border-red-900/40 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
