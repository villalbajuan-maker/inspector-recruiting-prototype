import { X, Clock } from 'lucide-react';
import { useState } from 'react';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ScheduleModal({ isOpen, onClose }: ScheduleModalProps) {
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');

  if (!isOpen) return null;

  const handleSchedule = () => {
    if (selectedDate && selectedTime) {
      console.log('SignalOS Intent: schedule_call | Hiring Track: inspection', {
        date: selectedDate,
        time: selectedTime,
      });
      onClose();
    }
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
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close modal"
        >
          <X size={24} />
        </button>

        <div className="p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-[#475569]/10 rounded-lg flex items-center justify-center">
              <Clock size={20} className="text-[#475569]" strokeWidth={2} />
            </div>
            <h2 className="text-[1.375rem] font-semibold text-gray-900 leading-[1.3]">
              Schedule your interview
            </h2>
          </div>

          <p className="text-sm text-gray-600 mb-6 leading-[1.6]">
            Select a date and time for your inspection interview call.
          </p>

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

          <button
            onClick={handleSchedule}
            disabled={!selectedDate || !selectedTime}
            className="w-full mt-8 bg-[#475569] text-white text-base py-3.5 px-6 rounded-lg font-semibold hover:bg-[#334155] transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#475569]"
          >
            Confirm Schedule
          </button>

          <p className="text-xs text-gray-500 text-center mt-4 leading-[1.5]">
            You'll receive a confirmation with interview details.
          </p>
        </div>
      </div>
    </div>
  );
}
