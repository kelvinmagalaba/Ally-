import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, ChevronDown, Flame, X } from 'lucide-react';
import gasPointImage from '@/assets/onb-gas-point.jpg';
import cylinderImage from '@/assets/onboarding-cylinders.jpg';
import quoteImage from '@/assets/cylinder-12kg.png';
import riderImage from '@/assets/onboarding-delivery.jpg';
import deliveryImage from '@/assets/cgd-delivery-illustration.webp';
import handoverImage from '@/assets/onb-handover.jpg';
import './CylinderArchiveHero.css';

type Scene = {
  label: string;
  title: string;
  short: string;
  description: string;
  image: string;
  imageAlt: string;
  imageStyle?: 'product' | 'art';
  color: string;
};

const scenes: Scene[] = [
  {
    label: 'Discover',
    title: 'Find your seller',
    short: 'Start with a shop near your delivery point.',
    description: 'Choose your delivery point, then explore approved cooking gas sellers with saved shop locations and available products.',
    image: gasPointImage,
    imageAlt: 'Cooking gas seller shop',
    color: '#5c7d61',
  },
  {
    label: 'Choose',
    title: 'Choose your cylinder',
    short: 'Pick the size that fits your kitchen.',
    description: 'Browse cylinder sizes and brands offered by sellers in your area. Stock and prices are shown in the app before you order.',
    image: cylinderImage,
    imageAlt: 'Cooking gas cylinders ready for delivery',
    color: '#c6653d',
  },
  {
    label: 'Quote',
    title: 'See the full price',
    short: 'Know the cost before you confirm.',
    description: 'Review the cylinder subtotal, delivery fee and total together. The order flow calculates the quote before you place an order.',
    image: quoteImage,
    imageAlt: 'Cooking gas cylinder',
    imageStyle: 'product',
    color: '#d96d21',
  },
  {
    label: 'Track',
    title: 'Follow your rider',
    short: 'Stay in the loop as your order moves.',
    description: 'When a rider accepts an active delivery and shares GPS, your order screen shows progress and the latest location update.',
    image: riderImage,
    imageAlt: 'Cooking gas delivery rider on the road',
    color: '#557e8a',
  },
  {
    label: 'Delivery',
    title: 'At your doorstep',
    short: 'A simpler way to keep your kitchen moving.',
    description: 'CGD brings customers, local cooking gas sellers and delivery riders together so the order can travel from shop to doorstep.',
    image: deliveryImage,
    imageAlt: 'Illustration of a rider handing a cooking gas cylinder to a customer',
    imageStyle: 'art',
    color: '#e66a23',
  },
  {
    label: 'Handover',
    title: 'Confirm the handover',
    short: 'Close the order with a private code.',
    description: 'At handover, the assigned rider submits the single-use verification code supplied by the customer to complete the right order.',
    image: handoverImage,
    imageAlt: 'Cooking gas cylinder being handed to a customer',
    color: '#697845',
  },
];

const offsets = [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7];
const wrap = (value: number) => (value + scenes.length * 10) % scenes.length;

type Props = {
  onOrder: () => void;
};

export default function CylinderArchiveHero({ onOrder }: Props) {
  const [active, setActive] = useState(4);
  const [detailOpen, setDetailOpen] = useState(false);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClickUntil = useRef(0);
  const coverRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const detailOrderRef = useRef<HTMLButtonElement>(null);
  const scene = scenes[active];

  useEffect(() => {
    if (!detailOpen) return;
    const previousOverflow = document.body.style.overflow;
    const coverButton = coverRef.current;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetailOpen(false);
      if (event.key === 'Tab') {
        const first = closeRef.current;
        const last = detailOrderRef.current;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onEscape);
      coverButton?.focus();
    };
  }, [detailOpen]);

  const move = (direction: number) => setActive((current) => wrap(current + direction));

  const onShelfPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pointerStart.current = { x: event.clientX, y: event.clientY };
  };

  const onShelfPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) return;
    const distanceX = event.clientX - start.x;
    const distanceY = event.clientY - start.y;
    if (Math.abs(distanceX) > 42 && Math.abs(distanceX) > Math.abs(distanceY) * 1.3) {
      suppressClickUntil.current = Date.now() + 250;
      move(distanceX < 0 ? 1 : -1);
    }
  };

  const onHeroKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (detailOpen) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
  };

  return (
    <section className="cgd-archive-hero" aria-labelledby="cgd-hero-title" onKeyDown={onHeroKeyDown}>
      <div className="cgd-archive-grain" aria-hidden="true" />
      <span className="cgd-archive-ghost cgd-archive-ghost-left" aria-hidden="true">CGD</span>
      <span className="cgd-archive-ghost cgd-archive-ghost-right" aria-hidden="true">GAS</span>

      <div className="cgd-archive-intro">
        <span className="cgd-archive-eyebrow"><Flame aria-hidden="true" size={15} /> The CGD collection · Tanzania</span>
        <h1 id="cgd-hero-title">Cooking gas,<br /><em>delivered to your door.</em></h1>
        <p>From nearby sellers to a verified handover, explore every step of your delivery.</p>
      </div>

      <div className="cgd-archive-shelf" onPointerDown={onShelfPointerDown} onPointerUp={onShelfPointerUp} onPointerCancel={() => { pointerStart.current = null; }} onDragStart={(event) => event.preventDefault()} aria-label="Explore the cooking gas delivery journey">
        <span className="cgd-archive-floor" aria-hidden="true" />
        <div className="cgd-archive-stage">
          {offsets.map((offset) => {
            const itemIndex = wrap(active + offset);
            const item = scenes[itemIndex];
            const depth = Math.abs(offset);
            const x = offset === 0 ? 0 : Math.sign(offset) * (105 + 68 * depth - 2 * depth * depth);
            const y = offset === 0 ? 0 : 4 * Math.pow(depth, 1.5);
            const style = {
              '--archive-x': `${x}px`,
              '--archive-y': `${y}px`,
              '--archive-z': `${offset === 0 ? 70 : -depth * 24}px`,
              '--archive-turn': `${offset === 0 ? -2 : Math.sign(offset) * Math.min(27, depth * 4)}deg`,
              '--archive-size': offset === 0 ? 1 : Math.max(.48, 1 - depth * .072),
              '--archive-color': item.color,
              zIndex: offset === 0 ? 50 : 30 - depth,
            } as CSSProperties;
            return offset === 0 ? (
              <button
                key={`cover-${active}`}
                ref={coverRef}
                type="button"
                className="cgd-archive-cover"
                style={style}
                aria-label={`Open ${item.title} details`}
                onClick={() => { if (Date.now() > suppressClickUntil.current) setDetailOpen(true); }}
              >
                <span className="cgd-archive-cover-top"><span>CGD / COOKING GAS DELIVERY</span><span>{String(itemIndex + 1).padStart(2, '0')} / 06</span></span>
                <span className="cgd-archive-cover-art"><img className={item.imageStyle === 'product' ? 'cgd-archive-object-image' : ''} src={item.image} alt="" fetchPriority="high" draggable={false} /></span>
                <span className="cgd-archive-cover-bottom"><span>{item.label}</span><strong>{item.title}</strong><small>OPEN THE STORY ↗</small></span>
              </button>
            ) : (
              <button
                key={`spine-${offset}`}
                type="button"
                tabIndex={-1}
                className="cgd-archive-spine"
                style={style}
                aria-label={`Show ${item.title}`}
                onClick={() => { if (Date.now() > suppressClickUntil.current) setActive(itemIndex); }}
              >
                <span className="cgd-archive-spine-photo"><img src={item.image} alt="" loading="lazy" draggable={false} /></span>
                <span className="cgd-archive-spine-title">{item.title}</span>
                <span className="cgd-archive-spine-brand">CGD</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="cgd-archive-caption">
        <button type="button" className="cgd-archive-arrow" aria-label="Previous story" onClick={() => move(-1)}><ArrowLeft size={23} aria-hidden="true" /></button>
        <div className="cgd-archive-caption-mask" aria-live="polite" aria-atomic="true" key={active}>
          <span>{scene.label} / {String(active + 1).padStart(2, '0')}</span>
          <h2>{scene.title}</h2>
          <p>{scene.short}</p>
        </div>
        <button type="button" className="cgd-archive-arrow" aria-label="Next story" onClick={() => move(1)}><ArrowRight size={23} aria-hidden="true" /></button>
      </div>

      <div className="cgd-archive-timeline" role="group" aria-label="Delivery journey chapters">
        {scenes.map((item, index) => (
          <button key={item.label} type="button" className={index === active ? 'cgd-archive-tick cgd-archive-tick-active' : 'cgd-archive-tick'} aria-label={`Chapter ${index + 1}: ${item.label}`} aria-current={index === active ? 'step' : undefined} onClick={() => setActive(index)}>
            <span className="cgd-archive-tick-mark" /><span>{item.label}</span>
          </button>
        ))}
      </div>

      <div className="cgd-archive-actions">
        <button type="button" className="cgd-button" onClick={onOrder}>Order cooking gas <ArrowRight aria-hidden="true" size={18} /></button>
        <a href="#how-it-works" className="cgd-archive-scroll">See how it works <ChevronDown aria-hidden="true" size={17} /></a>
      </div>
      <p className="cgd-archive-location-note">Your location is requested only when you choose to use it.</p>

      {detailOpen && createPortal(
        <div className="cgd-archive-detail" role="dialog" aria-modal="true" aria-labelledby="cgd-archive-detail-title">
          <div className="cgd-archive-detail-top"><span><Flame aria-hidden="true" size={18} /> CGD / THE DELIVERY JOURNEY</span><button ref={closeRef} type="button" onClick={() => setDetailOpen(false)}>Close <X aria-hidden="true" size={19} /></button></div>
          <div className="cgd-archive-detail-inner">
            <div className="cgd-archive-detail-copy"><span className="cgd-archive-detail-kicker">{String(active + 1).padStart(2, '0')} / 06 · {scene.label}</span><h2 id="cgd-archive-detail-title">{scene.title}</h2><p>{scene.description}</p><button ref={detailOrderRef} type="button" className="cgd-button" onClick={() => { setDetailOpen(false); onOrder(); }}>Start your order <ArrowRight aria-hidden="true" size={18} /></button></div>
            <div className={`cgd-archive-detail-image ${scene.imageStyle === 'product' ? 'cgd-archive-detail-product' : ''}`}><img src={scene.image} alt={scene.imageAlt} /></div>
          </div>
        </div>, document.body
      )}
    </section>
  );
}
