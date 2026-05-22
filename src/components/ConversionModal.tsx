import { X, Phone, Calendar, Check, AlertCircle } from 'lucide-react';
import { useState, FormEvent, useEffect } from 'react';

interface ConversionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Intent = 'call_now' | 'schedule_call';
type Step = 'form' | 'schedule' | 'confirmation';

interface FormData {
  full_name: string;
  phone: string;
  email: string;
  base_zip: string;
}

interface SubmissionPayload extends FormData {
  intent: Intent;
  scheduled_at: string | null;
}

const INTAKE_ENDPOINT =
  import.meta.env.VITE_INTAKE_ENDPOINT ||
  'https://qiyczncddtiypngpiswz.supabase.co/functions/v1/intake-inspection';
const ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpeWN6bmNkZHRpeXBuZ3Bpc3d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5MjY4OTIsImV4cCI6MjA4NDUwMjg5Mn0.-kVHKkCeA3E59pf2Cn0UdRowJ1EihxBZ0OVu8ODMn20';

export default function ConversionModal({ isOpen, onClose }: ConversionModalProps) {
  const [intent, setIntent] = useState<Intent>('call_now');
  const [step, setStep] = useState<Step>('form');
  const [formData, setFormData] = useState<FormData>({
    full_name: '',
    phone: '',
    email: '',
    base_zip: '',
  });
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [showCloseButton, setShowCloseButton] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (step === 'confirmation' && intent === 'call_now') {
      const timer = setTimeout(() => {
        setShowCloseButton(true);
      }, 3000);
      return () => clearTimeout(timer);
    } else if (step === 'confirmation' && intent === 'schedule_call') {
      setShowCloseButton(true);
    }
  }, [step, intent]);

  if (!isOpen) return null;

  const validateForm = (): boolean => {
    const newErrors: Partial<FormData> = {};

    if (!formData.full_name.trim()) {
      newErrors.full_name = 'Name is required';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!/^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/.test(formData.phone)) {
      newErrors.phone = 'Invalid phone number';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email address';
    }

    if (!formData.base_zip.trim()) {
      newErrors.base_zip = 'ZIP code is required';
    } else if (!/^\d{5}$/.test(formData.base_zip)) {
      newErrors.base_zip = 'Invalid ZIP code';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const submitIntake = async (payload: SubmissionPayload) => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch(INTAKE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorResult = await response.json().catch(() => null);
        throw new Error(errorResult?.error || 'Failed to submit intake');
      }

      await response.json();
      setStep('confirmation');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const isRetellNumberError =
        message.includes('phone-number') ||
        message.includes('from_number') ||
        message.includes('RETELL_FROM_NUMBER');

      setSubmitError(
        isRetellNumberError
          ? 'The outbound calling number is not configured correctly. Please check the Retell phone number.'
          : 'Something went wrong. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    if (intent === 'call_now') {
      const payload: SubmissionPayload = {
        ...formData,
        intent: 'call_now',
        scheduled_at: null,
      };
      await submitIntake(payload);
    } else {
      setStep('schedule');
    }
  };

  const handleScheduleSubmit = async () => {
    if (!selectedDate || !selectedTime) return;

    const scheduledAt = new Date(`${selectedDate}T${convertTo24Hour(selectedTime)}`).toISOString();
    const payload: SubmissionPayload = {
      ...formData,
      intent: 'schedule_call',
      scheduled_at: scheduledAt,
    };
    await submitIntake(payload);
  };

  const convertTo24Hour = (time12h: string): string => {
    const [time, modifier] = time12h.split(' ');
    const [rawHours, minutes] = time.split(':');
    let hours = rawHours;
    if (hours === '12') {
      hours = modifier === 'AM' ? '00' : '12';
    } else if (modifier === 'PM') {
      hours = String(parseInt(hours, 10) + 12);
    }
    return `${hours.padStart(2, '0')}:${minutes}:00`;
  };

  const handleClose = () => {
    setStep('form');
    setFormData({ full_name: '', phone: '', email: '', base_zip: '' });
    setSelectedDate('');
    setSelectedTime('');
    setErrors({});
    setShowCloseButton(false);
    setIsSubmitting(false);
    setSubmitError(null);
    onClose();
  };

  const today = new Date().toISOString().split('T')[0];
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 14);
  const maxDateStr = maxDate.toISOString().split('T')[0];

  const timeSlots = [
    '09:00 AM',
    '10:00 AM',
    '11:00 AM',
    '12:00 PM',
    '01:00 PM',
    '02:00 PM',
    '03:00 PM',
    '04:00 PM',
    '05:00 PM',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl">
        {step !== 'confirmation' && (
          <button
            onClick={handleClose}
            className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close modal"
          >
            <X size={24} />
          </button>
        )}

        {step === 'confirmation' && showCloseButton && (
          <button
            onClick={handleClose}
            className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close modal"
          >
            <X size={24} />
          </button>
        )}

        <div className="p-8 md:p-10">
          {step === 'form' && (
            <>
              <div className="flex gap-3 mb-8 bg-gray-100 p-1.5 rounded-xl">
                <button
                  onClick={() => setIntent('call_now')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
                    intent === 'call_now'
                      ? 'bg-white text-[#475569] shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Phone size={16} />
                  Call me now
                </button>
                <button
                  onClick={() => setIntent('schedule_call')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
                    intent === 'schedule_call'
                      ? 'bg-white text-[#475569] shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Calendar size={16} />
                  Schedule a call
                </button>
              </div>

              <h2 className="text-[1.5rem] font-semibold text-gray-900 mb-6 leading-[1.3]">
                {intent === 'call_now' ? 'Start your interview now' : 'Schedule your interview'}
              </h2>

              <form onSubmit={handleFormSubmit} className="space-y-5">
                <div>
                  <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    id="full_name"
                    value={formData.full_name}
                    onChange={(e) => {
                      setFormData({ ...formData, full_name: e.target.value });
                      if (errors.full_name) setErrors({ ...errors, full_name: undefined });
                    }}
                    className={`w-full px-4 py-3 text-base border-2 rounded-lg focus:ring-2 focus:ring-[#475569] focus:border-transparent transition-all ${
                      errors.full_name ? 'border-red-500' : 'border-gray-200'
                    }`}
                    placeholder="John Smith"
                  />
                  {errors.full_name && (
                    <p className="text-sm text-red-600 mt-1">{errors.full_name}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => {
                      setFormData({ ...formData, phone: e.target.value });
                      if (errors.phone) setErrors({ ...errors, phone: undefined });
                    }}
                    className={`w-full px-4 py-3 text-base border-2 rounded-lg focus:ring-2 focus:ring-[#475569] focus:border-transparent transition-all ${
                      errors.phone ? 'border-red-500' : 'border-gray-200'
                    }`}
                    placeholder="(555) 123-4567"
                  />
                  {errors.phone && (
                    <p className="text-sm text-red-600 mt-1">{errors.phone}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={formData.email}
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value });
                      if (errors.email) setErrors({ ...errors, email: undefined });
                    }}
                    className={`w-full px-4 py-3 text-base border-2 rounded-lg focus:ring-2 focus:ring-[#475569] focus:border-transparent transition-all ${
                      errors.email ? 'border-red-500' : 'border-gray-200'
                    }`}
                    placeholder="john@example.com"
                  />
                  {errors.email && (
                    <p className="text-sm text-red-600 mt-1">{errors.email}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="base_zip" className="block text-sm font-medium text-gray-700 mb-2">
                    ZIP Code
                  </label>
                  <input
                    type="text"
                    id="base_zip"
                    value={formData.base_zip}
                    onChange={(e) => {
                      setFormData({ ...formData, base_zip: e.target.value });
                      if (errors.base_zip) setErrors({ ...errors, base_zip: undefined });
                    }}
                    className={`w-full px-4 py-3 text-base border-2 rounded-lg focus:ring-2 focus:ring-[#475569] focus:border-transparent transition-all ${
                      errors.base_zip ? 'border-red-500' : 'border-gray-200'
                    }`}
                    placeholder="12345"
                    maxLength={5}
                  />
                  {errors.base_zip && (
                    <p className="text-sm text-red-600 mt-1">{errors.base_zip}</p>
                  )}
                </div>

                {submitError && (
                  <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <AlertCircle size={20} className="text-red-600 flex-shrink-0" />
                    <p className="text-sm text-red-800">{submitError}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[#475569] text-white text-base py-3.5 px-6 rounded-lg font-semibold hover:bg-[#334155] transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#475569]"
                >
                  {isSubmitting ? 'Submitting...' : intent === 'call_now' ? 'Submit' : 'Continue'}
                </button>
              </form>
            </>
          )}

          {step === 'schedule' && (
            <>
              <h2 className="text-[1.5rem] font-semibold text-gray-900 mb-6 leading-[1.3]">
                Choose date and time
              </h2>

              <div className="space-y-5">
                <div>
                  <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
                    Date
                  </label>
                  <input
                    type="date"
                    id="date"
                    min={today}
                    max={maxDateStr}
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-[#475569] focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="time" className="block text-sm font-medium text-gray-700 mb-2">
                    Time
                  </label>
                  <select
                    id="time"
                    value={selectedTime}
                    onChange={(e) => setSelectedTime(e.target.value)}
                    className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-[#475569] focus:border-transparent transition-all appearance-none bg-white cursor-pointer"
                  >
                    <option value="">Choose a time</option>
                    {timeSlots.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {submitError && (
                <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg mt-5">
                  <AlertCircle size={20} className="text-red-600 flex-shrink-0" />
                  <p className="text-sm text-red-800">{submitError}</p>
                </div>
              )}

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setStep('form')}
                  disabled={isSubmitting}
                  className="flex-1 bg-gray-100 text-gray-700 text-base py-3.5 px-6 rounded-lg font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Back
                </button>
                <button
                  onClick={handleScheduleSubmit}
                  disabled={!selectedDate || !selectedTime || isSubmitting}
                  className="flex-1 bg-[#475569] text-white text-base py-3.5 px-6 rounded-lg font-semibold hover:bg-[#334155] transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#475569]"
                >
                  {isSubmitting ? 'Submitting...' : 'Confirm'}
                </button>
              </div>
            </>
          )}

          {step === 'confirmation' && (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check size={32} className="text-green-600" strokeWidth={2.5} />
              </div>

              {intent === 'call_now' ? (
                <p className="text-base text-gray-900 leading-[1.6]">
                  You're all set. Please keep your phone nearby — you'll receive a call shortly.
                </p>
              ) : (
                <p className="text-base text-gray-900 leading-[1.6]">
                  Your call has been scheduled. Please be available at the selected time.
                </p>
              )}

              {showCloseButton && (
                <button
                  onClick={handleClose}
                  className="mt-8 bg-gray-100 text-gray-700 text-base py-3.5 px-8 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
                >
                  Close
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
