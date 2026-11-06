import { useState, useRef, useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import cylinderImg from '@/assets/onb-cylinder.jpg';
import gasPointImg from '@/assets/onb-gas-point.jpg';
import orderPhoneImg from '@/assets/onb-order-phone.jpg';
import handoverImg from '@/assets/onb-handover.jpg';
import riderImg from '@/assets/onb-rider.jpg';

/** Three explainer screens: what it is, how ordering works, how delivery works */
const slides = [
  {
    images: [cylinderImg, gasPointImg],
    title: 'CGD — Cooking Gas Delivery',
    subtitle: 'What is this system?',
    description:
      'A connected platform for Tanzania: customers order cooking gas, sellers manage stock and prices, and delivery riders fulfill orders â all in one place with live status updates.',
  },
  {
    images: [orderPhoneImg],
    title: 'Order from trusted sellers',
    subtitle: 'How ordering works',
    description:
      'Pick a nearby supplier, choose brand and cylinder size, and pay when the seller accepts your order. Your receipt is saved and you can download it as a PDF anytime.',
  },
  {
    images: [riderImg, handoverImg],
    title: 'Live delivery tracking',
    subtitle: 'How delivery works',
    description:
      'When a rider is assigned, they share live GPS location. You follow their movement on the map until delivery is completed â similar to ride-hailing apps you already use.',
  },
];

const OnboardingPage = () => {
  const [current, setCurrent] = useState(0);
  const setPage = useAppStore((s) => s.setPage);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);

  const goTo = useCallback((idx: number) => {
    setCurrent(Math.max(0, Math.min(idx, slides.length - 1)));
  }, []);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      goTo(current + (diff > 0 ? 1 : -1));
    }
  };

  const isLast = current === slides.length - 1;
  const slide = slides[current];

  return (
    <div
      className="min-h-screen bg-primary flex flex-col items-center justify-between overflow-hidden relative"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      ref={containerRef}
    >
      <div className="flex gap-2 pt-12 z-10">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
              i === current ? 'bg-primary-foreground w-6' : 'bg-primary-foreground/40'
            }`}
          />
        ))}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center animate-fade-in" key={current}>
        <div className="flex items-center justify-center gap-3 mb-6 w-full max-w-sm">
          {slide.images.map((src, i) => (
            <img
              key={src}
              src={src}
              alt={`${slide.title} ${i + 1}`}
              className={`object-cover rounded-2xl bg-white shadow-lg ${
                slide.images.length === 1 ? 'w-full h-52' : 'w-1/2 h-44'
              }`}
            />
          ))}
        </div>
        <p className="text-primary-foreground/80 text-sm mb-2 font-medium">{slide.subtitle}</p>
        <h1 className="text-2xl font-bold text-primary-foreground mb-3">{slide.title}</h1>
        <p className="text-primary-foreground/80 text-sm leading-relaxed max-w-sm">{slide.description}</p>
      </div>

      <div className="w-full px-8 pb-10 space-y-3 safe-bottom">
        <button
          type="button"
          onClick={() => (isLast ? setPage('role-select') : goTo(current + 1))}
          className="w-full py-4 rounded-full bg-accent text-accent-foreground font-bold text-lg tracking-wide transition-transform active:scale-95"
        >
          {isLast ? 'Get Started' : 'Continue'}
        </button>
        {current > 0 && !isLast && (
          <button
            type="button"
            onClick={() => setPage('role-select')}
            className="w-full py-2 text-primary-foreground/70 font-medium text-sm"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
};

export default OnboardingPage;
