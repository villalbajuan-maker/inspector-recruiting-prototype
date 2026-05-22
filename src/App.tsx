import { useState } from 'react';
import { Briefcase, FileText, Shield, Ban, TrendingUp, Shuffle, ShieldCheck, AlertCircle, MessageCircle } from 'lucide-react';
import ConversionModal from './components/ConversionModal';
import { useScrollReveal } from './hooks/useScrollReveal';

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const section1 = useScrollReveal();
  const section2 = useScrollReveal();
  const section3 = useScrollReveal();
  const section4 = useScrollReveal();
  const section5 = useScrollReveal();
  const section6 = useScrollReveal();
  const section7 = useScrollReveal();
  const section8 = useScrollReveal();

  return (
    <div className="min-h-screen bg-white">
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-40"
        >
          <source src="/hero-background.mp4" type="video/mp4" />
        </video>

        <div className="absolute inset-0 bg-black/10" />

        <div className="relative z-10 text-center px-4 max-w-3xl mx-auto">
          <h1 className="text-[2.5rem] md:text-[2.75rem] font-semibold text-[#475569] mb-6 leading-[1.2] tracking-[-0.01em]">
            Get Paid to Inspect Homes Before the Storm Hits
          </h1>

          <p className="text-base md:text-lg text-[#475569] mb-10 leading-relaxed">
            Paid preparedness inspections. Consistent work. Real impact.
          </p>

          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-[#475569] text-white text-base px-10 py-4 rounded-lg font-semibold hover:bg-[#334155] transition-all transform hover:scale-105 shadow-xl"
          >
            Start Interview
          </button>

          <p className="text-[#475569] text-sm mt-4 opacity-90">
            Takes about 5 minutes
          </p>

          <button
            onClick={() => setIsModalOpen(true)}
            className="text-[#475569] text-sm underline mt-4 hover:text-[#334155] transition-colors"
          >
            Schedule a call instead
          </button>

          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-[#475569]">
            <MessageCircle size={16} strokeWidth={1.75} />
            <a
              href="https://wa.me/573143449324"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-[#334155] transition-colors"
            >
              Try the WhatsApp operator: +57 314 344 9324
            </a>
          </div>
        </div>
      </section>

      <section ref={section1.ref as React.RefObject<HTMLElement>} className={`py-20 px-4 bg-white reveal ${section1.isVisible ? 'is-visible' : ''}`}>
        <div className="max-w-6xl mx-auto">
          <h2 className="text-[1.75rem] md:text-[1.875rem] font-semibold text-gray-900 text-center mb-3 leading-[1.3]">
            This is a professional inspection role
          </h2>
          <p className="text-base md:text-lg text-gray-600 text-center mb-16 leading-relaxed">
            Not a job. Not sales. Not guesswork
          </p>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <div className="bg-gray-50 rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow duration-300">
              <h3 className="text-lg font-semibold text-gray-900 mb-8">This is</h3>
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <Briefcase className="text-gray-700 flex-shrink-0 mt-1" size={24} strokeWidth={1.5} />
                  <span className="text-base text-gray-800 leading-[1.6]">Paid, professional inspections</span>
                </div>
                <div className="flex items-start gap-4">
                  <FileText className="text-gray-700 flex-shrink-0 mt-1" size={24} strokeWidth={1.5} />
                  <span className="text-base text-gray-800 leading-[1.6]">Defined protocols and clear scope</span>
                </div>
                <div className="flex items-start gap-4">
                  <Shield className="text-gray-700 flex-shrink-0 mt-1" size={24} strokeWidth={1.5} />
                  <span className="text-base text-gray-800 leading-[1.6]">Independent, neutral field work</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow duration-300">
              <h3 className="text-lg font-semibold text-gray-900 mb-8">This is not</h3>
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <Ban className="text-gray-600 flex-shrink-0 mt-1" size={24} strokeWidth={1.5} />
                  <span className="text-base text-gray-700 leading-[1.6]">Door-to-door or commission sales</span>
                </div>
                <div className="flex items-start gap-4">
                  <TrendingUp className="text-gray-600 flex-shrink-0 mt-1" size={24} strokeWidth={1.5} />
                  <span className="text-base text-gray-700 leading-[1.6]">Pressure to upsell or persuade</span>
                </div>
                <div className="flex items-start gap-4">
                  <Shuffle className="text-gray-600 flex-shrink-0 mt-1" size={24} strokeWidth={1.5} />
                  <span className="text-base text-gray-700 leading-[1.6]">Guesswork or improvisation</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section ref={section2.ref as React.RefObject<HTMLElement>} className={`relative py-24 px-4 bg-gray-50 overflow-hidden reveal ${section2.isVisible ? 'is-visible' : ''}`}>
        <div className="absolute inset-0 textured-section"></div>
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <h2 className="text-[1.75rem] md:text-[1.875rem] font-semibold text-gray-900 mb-3 leading-[1.3]">
            Work that respects your experience
          </h2>
          <p className="text-base text-gray-600 leading-[1.6] max-w-2xl mx-auto">
            This role is designed for professionals who understand the value of structured, paid work with clear expectations and defined scope.
          </p>
        </div>
      </section>

      <section ref={section3.ref as React.RefObject<HTMLElement>} className="py-20 px-4 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12">
            {[
              { icon: '/consistent-paid-icon.png', title: 'Paid Inspections', desc: 'Each inspection is paid. Clear, per-inspection compensation.' },
              { icon: '/professional-neutral-icon.png', title: 'Professional & Neutral', desc: 'Inspection-only role. No sales, no pressure.' },
              { icon: '/local-coverage-icon.png', title: 'Defined Coverage Area', desc: 'Work within assigned local or regional zones.' },
              { icon: '/field-first-icon.png', title: 'Independent Field Work', desc: 'Autonomous, professional field inspections.' },
            ].map((feature, idx) => (
              <article
                key={idx}
                className={`text-center reveal stagger-${idx + 1} ${section3.isVisible ? 'is-visible' : ''}`}
              >
                <figure className="mb-4">
                  <img
                    src={feature.icon}
                    alt={feature.title}
                    className="w-12 h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 mx-auto transition-opacity hover:opacity-80"
                  />
                </figure>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-[0.9375rem] text-gray-600 leading-[1.6]">
                  {feature.desc}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section ref={section4.ref as React.RefObject<HTMLElement>} className={`py-16 px-4 bg-gray-100 reveal ${section4.isVisible ? 'is-visible' : ''}`}>
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-[1.75rem] md:text-[1.875rem] font-semibold text-gray-900 mb-3 leading-[1.3]">
            If this sounds like how you already work…
          </h2>
          <p className="text-base text-gray-600 leading-[1.6]">
            The process is simple, fast, and built for professionals.
          </p>
        </div>
      </section>

      <section ref={section5.ref as React.RefObject<HTMLElement>} className="py-20 px-4 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="hidden md:flex justify-between items-start relative">
            <div className="absolute top-12 left-0 right-0 h-0.5 bg-gray-300" />

            {[
              { icon: '/apply-icon.png', title: 'Apply', desc: 'Start interview now or schedule it' },
              { icon: '/interview-icon.png', title: 'Interview', desc: 'Short, structured call about your experience' },
              { icon: '/approved-icon.png', title: 'Get Approved', desc: 'Based on fit, coverage, and readiness' },
              { icon: '/assigned.icon.png', title: 'Get Assigned', desc: 'Paid inspections in your area' },
            ].map((step, idx) => (
              <div
                key={idx}
                className={`relative flex flex-col items-center w-1/4 reveal stagger-${idx + 1} ${section5.isVisible ? 'is-visible' : ''}`}
              >
                <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-4 relative z-10 shadow-md transition-all hover:shadow-lg hover:scale-105">
                  <img
                    src={step.icon}
                    alt={step.title}
                    className="w-16 h-16 object-contain"
                  />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2 text-center">{step.title}</h3>
                <p className="text-gray-600 text-center text-sm leading-[1.5]">{step.desc}</p>
              </div>
            ))}
          </div>

          <div className="md:hidden space-y-8">
            {[
              { icon: '/apply-icon.png', title: 'Apply', desc: 'Start interview now or schedule it' },
              { icon: '/interview-icon.png', title: 'Interview', desc: 'Short, structured call about your experience' },
              { icon: '/approved-icon.png', title: 'Get Approved', desc: 'Based on fit, coverage, and readiness' },
              { icon: '/assigned.icon.png', title: 'Get Assigned', desc: 'Paid inspections in your area' },
            ].map((step, idx) => (
              <div
                key={idx}
                className={`flex gap-4 items-start reveal stagger-${idx + 1} ${section5.isVisible ? 'is-visible' : ''}`}
              >
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center flex-shrink-0 shadow-md">
                  <img
                    src={step.icon}
                    alt={step.title}
                    className="w-12 h-12 object-contain"
                  />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">{step.title}</h3>
                  <p className="text-[0.9375rem] text-gray-600 leading-[1.6]">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section ref={section6.ref as React.RefObject<HTMLElement>} className={`py-20 px-4 bg-white reveal ${section6.isVisible ? 'is-visible' : ''}`}>
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12">
            <div className="bg-gray-50 p-8 md:p-10 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-8">
                <ShieldCheck className="text-gray-700" size={32} strokeWidth={1.5} />
                <h2 className="text-lg font-semibold text-gray-900">Strong fit if you…</h2>
              </div>
              <ul className="space-y-4">
                <li className="text-base text-gray-700 leading-[1.6] pl-4 border-l-2 border-gray-300">
                  You have inspection, construction, or restoration experience
                </li>
                <li className="text-base text-gray-700 leading-[1.6] pl-4 border-l-2 border-gray-300">
                  You value accuracy, documentation, and professionalism
                </li>
                <li className="text-base text-gray-700 leading-[1.6] pl-4 border-l-2 border-gray-300">
                  You prefer paid, structured work with clear scope
                </li>
                <li className="text-base text-gray-700 leading-[1.6] pl-4 border-l-2 border-gray-300">
                  You are comfortable working independently in the field
                </li>
              </ul>
            </div>

            <div className="bg-gray-100 p-8 md:p-10 rounded-xl shadow-sm border border-gray-300 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-8">
                <AlertCircle className="text-gray-600" size={32} strokeWidth={1.5} />
                <h2 className="text-lg font-semibold text-gray-900">Not a fit if you're looking for…</h2>
              </div>
              <ul className="space-y-4">
                <li className="text-base text-gray-600 leading-[1.6] pl-4 border-l-2 border-gray-400">
                  A traditional W-2 job
                </li>
                <li className="text-base text-gray-600 leading-[1.6] pl-4 border-l-2 border-gray-400">
                  Sales commissions or upselling
                </li>
                <li className="text-base text-gray-600 leading-[1.6] pl-4 border-l-2 border-gray-400">
                  Unstructured or informal work
                </li>
                <li className="text-base text-gray-600 leading-[1.6] pl-4 border-l-2 border-gray-400">
                  Short-term or one-off gigs
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section ref={section7.ref as React.RefObject<HTMLElement>} className={`py-24 px-4 bg-gray-50 reveal ${section7.isVisible ? 'is-visible' : ''}`}>
        <div className="max-w-6xl mx-auto">
          <p className="text-center text-sm text-gray-500 mb-10 leading-[1.5]">
            Disaster Shield coordinates preparedness inspections in partnership with restoration and construction operators across Florida.
          </p>

          <div className="logo-banner-container">
            <div className="logo-banner-track">
              <div className="logo-banner-content">
                <div className="logo-banner-wrapper">
                  <img src="/rehabs-logo.png" alt="" className="logo-banner-item" />
                </div>
                <div className="logo-banner-wrapper">
                  <img src="/disaster-logo.png" alt="" className="logo-banner-item" />
                </div>
                <div className="logo-banner-wrapper">
                  <img src="/jupiter-logo.png" alt="" className="logo-banner-item" />
                </div>
                <div className="logo-banner-wrapper">
                  <img src="/atlas-logo.png" alt="" className="logo-banner-item" />
                </div>
                <div className="logo-banner-wrapper">
                  <img src="/harbor-logo.png" alt="" className="logo-banner-item" />
                </div>
              </div>
              <div className="logo-banner-content" aria-hidden="true">
                <div className="logo-banner-wrapper">
                  <img src="/rehabs-logo.png" alt="" className="logo-banner-item" />
                </div>
                <div className="logo-banner-wrapper">
                  <img src="/disaster-logo.png" alt="" className="logo-banner-item" />
                </div>
                <div className="logo-banner-wrapper">
                  <img src="/jupiter-logo.png" alt="" className="logo-banner-item" />
                </div>
                <div className="logo-banner-wrapper">
                  <img src="/atlas-logo.png" alt="" className="logo-banner-item" />
                </div>
                <div className="logo-banner-wrapper">
                  <img src="/harbor-logo.png" alt="" className="logo-banner-item" />
                </div>
              </div>
              <div className="logo-banner-content" aria-hidden="true">
                <div className="logo-banner-wrapper">
                  <img src="/rehabs-logo.png" alt="" className="logo-banner-item" />
                </div>
                <div className="logo-banner-wrapper">
                  <img src="/disaster-logo.png" alt="" className="logo-banner-item" />
                </div>
                <div className="logo-banner-wrapper">
                  <img src="/jupiter-logo.png" alt="" className="logo-banner-item" />
                </div>
                <div className="logo-banner-wrapper">
                  <img src="/atlas-logo.png" alt="" className="logo-banner-item" />
                </div>
                <div className="logo-banner-wrapper">
                  <img src="/harbor-logo.png" alt="" className="logo-banner-item" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section ref={section8.ref as React.RefObject<HTMLElement>} className="py-20 px-4 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <div className={`bg-white rounded-2xl shadow-lg border border-gray-200 p-8 md:p-12 text-center reveal-scale ${section8.isVisible ? 'is-visible' : ''}`}>
            <h2 className="text-[1.75rem] md:text-[1.875rem] font-semibold text-gray-900 mb-3 leading-[1.3]">
              Ready to take inspections in your area?
            </h2>

            <p className="text-base text-gray-600 mb-8 leading-[1.6]">
              Paid inspections. Professional process. No sales.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-4">
              <button
                onClick={() => setIsModalOpen(true)}
                className="w-full sm:w-64 bg-[#475569] text-white text-base px-8 py-4 rounded-lg font-semibold hover:bg-[#334155] transition-colors"
              >
                Start Interview Now
              </button>

              <button
                onClick={() => setIsModalOpen(true)}
                className="w-full sm:w-64 bg-transparent text-gray-700 text-base px-8 py-4 rounded-lg font-semibold border-2 border-gray-300 hover:border-gray-400 hover:bg-gray-50 transition-colors"
              >
                Schedule a Call
              </button>
            </div>

            <p className="text-sm text-gray-500 mt-4 leading-[1.5]">
              Takes about 5 minutes. No obligation.
            </p>
          </div>
        </div>
      </section>

      <ConversionModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}

export default App;
