import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownRight, ArrowRight, ArrowUpLeft, Check, ChevronDown, Flame, LockKeyhole,
  MapPin, Menu, Navigation, PackageCheck, Route, ShieldCheck, Store,
  Truck, Wallet, X,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import TypewriterHeading from '@/components/TypewriterHeading';
import ColumnSpreadShowcase from '@/components/ColumnSpreadShowcase';
import heroImage from '@/assets/cgd-cinematic-hero.webp';
import mobileHeroImage from '@/assets/cgd-cinematic-mobile.webp';
import studioCylinder from '@/assets/cgd-studio-cylinder.webp';
import cityRider from '@/assets/cgd-city-rider.webp';
import doorstepImage from '@/assets/cgd-delivery-handover.webp';
import sellerImage from '@/assets/cgd-seller-portrait.webp';
import magalaiRider from '@/assets/cgd-rider-cutout.webp';
import cylinder3 from '@/assets/cgd-cylinder-3kg.webp';
import cylinder6 from '@/assets/cgd-cylinder-6kg.webp';
import cylinder15 from '@/assets/cgd-cylinder-15kg.webp';
import cylinder38 from '@/assets/cgd-cylinder-38kg.webp';
import './LandingPage.css';

const navigation = [
  { label: 'Home', href: '#top' },
  { label: 'Products', href: '#products' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Tracking', href: '#tracking' },
  { label: 'Partners', href: '#partners' },
  { label: 'Contact', href: '#contact' },
];

const story = [
  { number: '01', label: 'THE PRODUCT', title: 'Ready for the moments that matter.', copy: 'Browse cooking gas cylinders offered by local sellers and choose the option that fits your home.', image: studioCylinder, alt: 'Orange cooking gas cylinder in a warm studio' },
  { number: '02', label: 'THE RIDER', title: 'A delivery made around your day.', copy: 'A registered delivery rider takes the order from the seller once a delivery offer is accepted.', image: heroImage, alt: 'Cooking gas delivery rider with a cylinder secured on a motorcycle' },
  { number: '03', label: 'THE JOURNEY', title: 'Your order is on its way.', copy: 'Follow the order and see fresh location updates while the assigned rider shares GPS.', image: cityRider, alt: 'Cooking gas delivery rider travelling through a city street' },
  { number: '04', label: 'THE ARRIVAL', title: 'Cooking gas at your doorstep.', copy: 'Meet the rider at your chosen delivery point and check your cylinder before handover.', image: doorstepImage, alt: 'Cooking gas cylinder handed to a customer at home' },
  { number: '05', label: 'THE HANDOVER', title: 'Finish with confidence.', copy: 'A private single-use code helps confirm the correct delivery with the assigned rider.', image: studioCylinder, alt: 'Cooking gas cylinder ready for home use' },
];

const products = [
  { size: '3 kg', image: cylinder3, note: 'Compact everyday cooking' },
  { size: '6 kg', image: cylinder6, note: 'A versatile home option' },
  { size: '15 kg', image: cylinder15, note: 'For kitchens that cook more' },
  { size: '38 kg', image: cylinder38, note: 'Higher-capacity needs' },
];

const steps = [
  { number: '01', title: 'Choose your cooking gas', copy: 'Set a delivery point and browse cylinders from approved nearby sellers.', icon: Store },
  { number: '02', title: 'Review your order', copy: 'See the item price, delivery fee and full total before confirming.', icon: Wallet },
  { number: '03', title: 'Follow the delivery', copy: 'Watch the order status and latest shared rider location on an active job.', icon: Navigation },
  { number: '04', title: 'Confirm at the door', copy: 'Give the rider your private verification code after a successful handover.', icon: PackageCheck },
];

const faqs = [
  { question: 'How do I see the delivery price?', answer: 'Choose a delivery point and seller, then review the itemized quote before placing your order. The final fee depends on the available route and the seller you select.' },
  { question: 'Does CGD use my location automatically?', answer: 'No. Your device location is requested only after you choose to use it. You can also select a delivery point manually.' },
  { question: 'Can I follow my rider?', answer: 'You can follow the progress of an active order. The latest rider position appears while the assigned rider is sharing location, with stale updates marked clearly.' },
  { question: 'How is a delivery completed?', answer: 'At handover, you give the assigned rider the private, single-use delivery code shown in your protected order view.' },
  { question: 'Can I join as a seller or rider?', answer: 'Yes. Use the partner links below to start registration for your cooking gas shop or delivery role.' },
];

function PreviewPhone({ variant }: { variant: 'browse' | 'quote' | 'track' }) {
  return (
    <div className={`cinema-phone cinema-phone-${variant}`} aria-label={`${variant} app preview`}>
      <div className="cinema-phone-top"><span>CGD</span><span>●●●</span></div>
      {variant === 'browse' && <div className="cinema-phone-content">
        <span className="cinema-phone-kicker">BROWSE</span><TypewriterHeading tag="h4" lines={['Cooking gas near you']} />
        <div className="cinema-phone-search">⌕ &nbsp; Search sellers or cylinders</div>
        <div className="cinema-phone-product"><img src={cylinder6} alt="" /><span><strong>6 kg cylinder</strong><small>See nearby sellers</small></span><ArrowRight size={14} /></div>
        <div className="cinema-phone-product"><img src={cylinder15} alt="" /><span><strong>15 kg cylinder</strong><small>Check availability</small></span><ArrowRight size={14} /></div>
      </div>}
      {variant === 'quote' && <div className="cinema-phone-content">
        <span className="cinema-phone-kicker">YOUR ORDER</span><TypewriterHeading tag="h4" lines={['Everything in view.']} />
        <div className="cinema-phone-quote-row"><span>Cylinder subtotal</span><span>Shown in app</span></div>
        <div className="cinema-phone-quote-row"><span>Road delivery fee</span><span>Calculated</span></div>
        <div className="cinema-phone-quote-total"><span>Your total</span><strong>Before you confirm</strong></div>
        <div className="cinema-phone-action">Review order <ArrowRight size={13} /></div>
      </div>}
      {variant === 'track' && <div className="cinema-phone-content">
        <span className="cinema-phone-kicker">ACTIVE DELIVERY</span><TypewriterHeading tag="h4" lines={['On its way.']} />
        <div className="cinema-phone-map"><span className="cinema-phone-map-road road-one" /><span className="cinema-phone-map-road road-two" /><svg viewBox="0 0 200 150" aria-hidden="true"><path d="M 22 116 C 55 105 47 74 85 83 S 132 64 176 28" /></svg><span className="cinema-phone-map-start"><Store size={11} /></span><span className="cinema-phone-map-rider"><Truck size={13} /></span><span className="cinema-phone-map-end"><MapPin size={12} /></span></div>
        <div className="cinema-phone-quote-row"><span>Latest location</span><strong>Shown in app</strong></div>
      </div>}
      <div className="cinema-phone-home" />
    </div>
  );
}

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showQuickOrder, setShowQuickOrder] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(2);
  const [activatedStories, setActivatedStories] = useState<Set<number>>(() => new Set([0]));
  const [motionPreferences, setMotionPreferences] = useState(() => ({
    desktop: typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches,
    reduced: typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  }));
  const { setPage, setUser } = useAppStore();

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const target = document.getElementById(decodeURIComponent(hash));
    if (!target || !rootRef.current?.contains(target)) return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => target.scrollIntoView({ block: 'start', behavior: 'auto' }));
    });
    return () => { window.cancelAnimationFrame(firstFrame); window.cancelAnimationFrame(secondFrame); };
  }, []);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 900px)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setMotionPreferences({ desktop: desktop.matches, reduced: reduced.matches });
    desktop.addEventListener('change', update);
    reduced.addEventListener('change', update);
    return () => {
      desktop.removeEventListener('change', update);
      reduced.removeEventListener('change', update);
    };
  }, []);

  useEffect(() => {
    let pendingFrame = 0;
    const update = () => {
      if (pendingFrame) return;
      pendingFrame = window.requestAnimationFrame(() => {
        pendingFrame = 0;
        const magalaiTop = rootRef.current?.querySelector('#mikoani')?.getBoundingClientRect().top ?? Infinity;
        setScrolled(window.scrollY > 32);
        setShowQuickOrder(window.scrollY > Math.max(620, window.innerHeight * .75) && magalaiTop > window.innerHeight * .55);
      });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => { window.removeEventListener('scroll', update); window.cancelAnimationFrame(pendingFrame); };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || motionPreferences.reduced) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const [{ default: gsap }, { ScrollTrigger }, { default: Lenis }] = await Promise.all([
        import('gsap'), import('gsap/ScrollTrigger'), import('lenis'),
      ]);
      if (disposed) return;
      gsap.registerPlugin(ScrollTrigger);
      const desktop = motionPreferences.desktop;
      const context = gsap.context(() => {
        gsap.from('.cinema-hero-image', { xPercent: 6, scale: 1.05, duration: 1.5, ease: 'power3.out' });
        gsap.fromTo('.cinema-track-route path', { strokeDashoffset: 400 }, { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: '#tracking', start: 'top 75%', end: 'bottom 35%', scrub: 1 } });

        const storySection = root.querySelector<HTMLElement>('.cinema-story');
        const storyPin = root.querySelector<HTMLElement>('.cinema-story-pin');
        const panels = Array.from(root.querySelectorAll<HTMLElement>('.cinema-story-panel'));
        if (desktop && storySection && storyPin && panels.length > 1) {
          storySection.classList.add('is-enhanced');
          gsap.set(panels.slice(1), { autoAlpha: 0 });
          const sequence = gsap.timeline({ scrollTrigger: { trigger: storySection, pin: storyPin, start: 'top top', end: () => `+=${window.innerHeight * 4}`, scrub: .7, invalidateOnRefresh: true, onUpdate: (self) => {
            const sceneIndex = Math.min(4, Math.max(0, Math.floor(self.progress * 5 + .3)));
            setActivatedStories((current) => current.has(sceneIndex) ? current : new Set(current).add(sceneIndex));
          } } });
          panels.slice(1).forEach((panel, index) => {
            sequence.to(panels[index], { autoAlpha: 0, scale: 1.035, duration: .34 }, index + .7)
              .fromTo(panel, { autoAlpha: 0, scale: 1.06 }, { autoAlpha: 1, scale: 1, duration: .34 }, index + .7);
          });
          sequence.fromTo('.cinema-story-progress span', { scaleX: 0 }, { scaleX: 1, duration: panels.length, ease: 'none' }, 0);
        }
      }, root);

      let lenis: InstanceType<typeof Lenis> | undefined;
      let ticker: ((time: number) => void) | undefined;
      if (desktop) {
        lenis = new Lenis({ duration: 1.08, smoothWheel: true });
        lenis.on('scroll', ScrollTrigger.update);
        ticker = (time: number) => lenis?.raf(time * 1000);
        gsap.ticker.add(ticker);
        gsap.ticker.lagSmoothing(0);
      }
      ScrollTrigger.refresh();
      cleanup = () => {
        if (ticker) gsap.ticker.remove(ticker);
        lenis?.destroy();
        context.revert();
        root.querySelector('.cinema-story')?.classList.remove('is-enhanced');
      };
    })().catch((error) => { if (import.meta.env.DEV) console.error('Landing motion unavailable', error); });

    return () => { disposed = true; cleanup?.(); };
  }, [motionPreferences.desktop, motionPreferences.reduced]);

  const openAuth = (role: 'customer' | 'supplier' | 'driver', login = false) => {
    setUser({ role });
    if (login) sessionStorage.setItem('cgd_auth_mode', 'login');
    setPage('auth');
  };

  const chosen = products[selectedProduct];

  return <div className="cgd-cinema" id="top" ref={rootRef}>
    <a className="cinema-skip" href="#main-content">Skip to content</a>
    <header className={`cinema-header ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="cinema-nav-shell">
        <a href="#top" className="cinema-brand" aria-label="CGD Cooking Gas Delivery home" onClick={() => setMenuOpen(false)}><span className="cinema-brand-mark"><Flame size={20} aria-hidden="true" /></span><span><strong>CGD</strong><small>COOKING GAS DELIVERY</small></span></a>
        <nav className={menuOpen ? 'cinema-nav is-open' : 'cinema-nav'} aria-label="Main navigation">{navigation.map((item) => <a key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>{item.label}</a>)}</nav>
        <div className="cinema-nav-actions"><button type="button" className="cinema-login" onClick={() => openAuth('customer', true)}>Log in</button><button type="button" className="cinema-nav-order" onClick={() => openAuth('customer')}>Order now <ArrowRight size={15} aria-hidden="true" /></button></div>
        <button type="button" className="cinema-menu" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
      </div>
    </header>

    <main id="main-content">
      <section className="cinema-hero" aria-labelledby="cinema-hero-title">
        <picture className="cinema-hero-picture"><source media="(max-width: 620px)" srcSet={mobileHeroImage} /><img className="cinema-hero-image" src={heroImage} alt="CGD rider on a motorcycle with a cooking gas cylinder safely secured behind the seat" fetchPriority="high" width="1600" height="900" /></picture>
        <div className="cinema-hero-shade" aria-hidden="true" />
        <div className="cinema-hero-content">
          <span className="cinema-overline">COOKING GAS DELIVERY · TANZANIA</span>
          <TypewriterHeading tag="h1" id="cinema-hero-title" lines={['Your cooking gas.', { text: 'On its way.', accent: true }]} />
          <p className="cinema-hero-sub">Order from nearby sellers, see the full price before you confirm, and follow delivery to your doorstep.</p>
          <div className="cinema-hero-actions"><button type="button" className="cinema-button cinema-button-primary" onClick={() => openAuth('customer')}>Order cooking gas <ArrowRight size={19} aria-hidden="true" /></button><a className="cinema-button cinema-button-ghost" href="#journey">Discover the journey <ArrowDownRight size={18} aria-hidden="true" /></a></div>
          <p className="cinema-hero-permission">Location is requested only after you choose to use it.</p>
        </div>
        <div className="cinema-hero-index"><span>01 / 05</span><span>FROM SHOP TO DOORSTEP</span><a href="#journey">SCROLL TO EXPLORE <ChevronDown size={16} aria-hidden="true" /></a></div>
      </section>

      <div className="cinema-marquee" aria-hidden="true"><div>LOCAL SELLERS <span>✦</span> CLEAR PRICES <span>✦</span> COOKING GAS DELIVERED <span>✦</span> LOCAL SELLERS <span>✦</span> CLEAR PRICES <span>✦</span> COOKING GAS DELIVERED <span>✦</span></div></div>

      <section className="cinema-story" id="journey" aria-label="The CGD delivery journey">
        
        <div className="cinema-story-pin">
          {story.map((scene, index) => <article className="cinema-story-panel" key={scene.number}>
            <img src={scene.image} alt={scene.alt} loading="lazy" />
            <div className="cinema-story-shade" aria-hidden="true" />
            <div className="cinema-story-content"><span className="cinema-overline">{scene.number} / 05 — {scene.label}</span><TypewriterHeading key={`${scene.number}-${motionPreferences.desktop ? activatedStories.has(index) ? 'seen' : 'unseen' : 'mobile'}`} tag="h3" lines={[scene.title]} /><p>{scene.copy}</p></div>
            <a className="cinema-story-back" href="#top"><ArrowUpLeft size={16} aria-hidden="true" /> Back to start</a>
            <span className="cinema-story-side-label">CGD · THE DELIVERY JOURNEY</span>
          </article>)}
          <div className="cinema-story-progress" aria-hidden="true"><span /></div>
        </div>
      </section>

      <section className="cinema-products" id="products" aria-labelledby="cinema-products-title">
        <div className="cinema-section-intro cinema-reveal"><span className="cinema-overline">THE ESSENTIALS, BEAUTIFULLY SIMPLE</span><TypewriterHeading tag="h2" id="cinema-products-title" lines={['Choose your', { text: 'cylinder.', accent: true }]} /><p>Explore sizes offered by sellers near you. Current brands, prices and stock appear in the app once you choose a seller.</p></div>
        <div className="cinema-product-editorial cinema-reveal">
          <div className="cinema-product-side"><span className="cinema-product-label">01 — SELECT A SIZE</span><div className="cinema-size-list" role="group" aria-label="Cooking gas cylinder size">{products.map((product, index) => <button key={product.size} type="button" className={index === selectedProduct ? 'is-active' : ''} aria-pressed={index === selectedProduct} onClick={() => setSelectedProduct(index)}><span>{product.size}</span><ArrowRight size={20} aria-hidden="true" /></button>)}</div><p>{chosen.note}</p><button type="button" className="cinema-text-link" onClick={() => openAuth('customer')}>Find this size near me <ArrowRight size={18} aria-hidden="true" /></button></div>
          <div className="cinema-product-stage"><div className="cinema-product-stage-glow" aria-hidden="true" /><img key={chosen.size} src={chosen.image} alt={`${chosen.size} cooking gas cylinder`} width="512" height="512" /><span className="cinema-product-stage-size">{chosen.size}</span><span className="cinema-product-stage-note">PRODUCT OPTIONS VARY BY SELLER</span></div>
        </div>
        <div className="cinema-product-bottom cinema-reveal"><span>NO GUESSWORK AT CHECKOUT</span><p>See the cylinder subtotal, road delivery fee and total before placing an order.</p><button type="button" className="cinema-button cinema-button-dark" onClick={() => openAuth('customer')}>Browse nearby sellers <ArrowRight size={18} aria-hidden="true" /></button></div>
      </section>

      <section className="cinema-steps" id="how-it-works" aria-labelledby="cinema-steps-title"><div className="cinema-steps-head cinema-reveal"><span className="cinema-overline">HOW CGD WORKS</span><TypewriterHeading tag="h2" id="cinema-steps-title" lines={['Four steps.', { text: 'One easy experience.', accent: true }]} /></div><div className="cinema-steps-list">{steps.map((step) => <div className="cinema-step cinema-reveal" key={step.number}><span className="cinema-step-number">{step.number}</span><div><TypewriterHeading tag="h3" lines={[step.title]} /><p>{step.copy}</p></div><span className="cinema-step-icon"><step.icon size={27} aria-hidden="true" /></span></div>)}</div></section>

      <section className="cinema-tracking" id="tracking" aria-labelledby="cinema-tracking-title"><div className="cinema-tracking-copy cinema-reveal"><span className="cinema-overline">YOUR DELIVERY, IN VIEW</span><TypewriterHeading tag="h2" id="cinema-tracking-title" lines={['See the journey.', { text: 'Feel in control.', accent: true }]} /><p>Browse, review your quote and follow an active delivery from the CGD app. Location updates appear only while the assigned rider shares GPS.</p><ul><li><Check size={17} aria-hidden="true" /> Order progress in one place</li><li><Check size={17} aria-hidden="true" /> Latest shared rider location</li><li><Check size={17} aria-hidden="true" /> Private handover verification</li></ul><span className="cinema-preview-label">ILLUSTRATIVE APP PREVIEW</span></div><div className="cinema-phone-stack cinema-reveal"><PreviewPhone variant="browse" /><PreviewPhone variant="quote" /><PreviewPhone variant="track" /><svg className="cinema-track-route" viewBox="0 0 400 200" aria-hidden="true"><path d="M20 160C100 135 110 70 200 96S295 60 380 22" /></svg></div></section>

      <section className="cinema-promise" aria-labelledby="cinema-promise-title"><div className="cinema-promise-heading cinema-reveal"><span className="cinema-overline">WHY CGD</span><TypewriterHeading tag="h2" id="cinema-promise-title" lines={['The details make', { text: 'the difference.', accent: true }]} /></div><div className="cinema-promise-grid"><article className="cinema-promise-large cinema-reveal"><ShieldCheck size={33} aria-hidden="true" /><TypewriterHeading tag="h3" lines={['From seller to doorstep, with clarity.']} /><p>Know who you ordered from, what you chose and how the delivery is progressing.</p></article><div className="cinema-promise-list cinema-reveal"><div><Route size={23} aria-hidden="true" /><span><strong>Transparent pricing</strong><small>Review the full quote before you order.</small></span></div><div><LockKeyhole size={23} aria-hidden="true" /><span><strong>Protected handover</strong><small>A private code confirms completion.</small></span></div><div><Store size={23} aria-hidden="true" /><span><strong>Local seller choice</strong><small>Compare registered shops near your selected point.</small></span></div></div></div></section>

      <section className="cinema-partners" id="partners" aria-labelledby="cinema-partners-title"><div className="cinema-partners-head cinema-reveal"><span className="cinema-overline">GROW WITH CGD</span><TypewriterHeading tag="h2" id="cinema-partners-title" lines={['Be part of', { text: 'the journey.', accent: true }]} /></div><div className="cinema-partner-panels"><article className="cinema-partner cinema-partner-rider cinema-reveal"><img src={cityRider} alt="Cooking gas delivery rider on the road" loading="lazy" /><div><span>01 / DELIVERY PARTNERS</span><TypewriterHeading tag="h3" lines={['Bring essentials closer.']} /><p>Go online when you're ready and review delivery offers.</p><button type="button" onClick={() => openAuth('driver')}>Join as a rider <ArrowRight size={19} aria-hidden="true" /></button></div></article><article className="cinema-partner cinema-partner-seller cinema-reveal"><img src={sellerImage} alt="Cooking gas seller shop" loading="lazy" /><div><span>02 / COOKING GAS SELLERS</span><TypewriterHeading tag="h3" lines={['Grow your local reach.']} /><p>Manage your shop, cylinders and incoming orders.</p><button type="button" onClick={() => openAuth('supplier')}>Become a seller <ArrowRight size={19} aria-hidden="true" /></button></div></article></div></section>

      <section className="cinema-magalai" id="mikoani" aria-labelledby="cinema-magalai-title">
        <div className="cinema-magalai-copy">
          <span className="cinema-overline">MAGALAI / REGIONAL DELIVERY</span>
          <TypewriterHeading tag="h2" id="cinema-magalai-title" lines={['We deliver cooking gas', { text: 'across Tanzania.', accent: true }]} />
          <p>From city streets to mikoani, Magalai brings the regional delivery story into the CGD experience. Each order depends on a registered seller and an available rider in your area.</p>
          <div className="cinema-magalai-actions"><button type="button" className="cinema-button cinema-button-dark" onClick={() => openAuth('customer')}>Order cooking gas <ArrowRight size={18} aria-hidden="true" /></button><a href="#partners">Join the journey <ArrowRight size={17} aria-hidden="true" /></a></div>
        </div>
        <div className="cinema-magalai-art"><span>MAGALAI</span><img src={magalaiRider} alt="Smiling Magalai cooking gas delivery rider on a motorcycle with a secured cylinder" loading="lazy" width="1240" height="1269" /></div>
      </section>

      <section className="cinema-showcase" aria-label="Moments in the CGD delivery journey">
        <div className="cinema-showcase-caption"><span>THE JOURNEY, IN MOTION</span><p>People, places and cooking gas on the move.</p></div>
        <ColumnSpreadShowcase />
      </section>

      <section className="cinema-voices" id="stories" aria-labelledby="cinema-voices-title">
        <div className="cinema-voices-copy"><span className="cinema-overline">COMMUNITY VOICES</span><TypewriterHeading tag="h2" id="cinema-voices-title" lines={['What our', { text: 'customers say.', accent: true }]} /><p>Every delivery has a story. We will share verified customer experiences here when people choose to tell us about them.</p><button type="button" className="cinema-text-link" onClick={() => openAuth('customer')}>Start your own CGD journey <ArrowRight size={18} aria-hidden="true" /></button></div>
        <div className="cinema-voices-feature"><img src={doorstepImage} alt="Cooking gas delivery handover at a customer's doorstep" loading="lazy" /><div><span>REAL STORIES, SHARED WITH PERMISSION</span><p>Customer stories are coming soon.</p><small>No testimonials have been published yet.</small></div></div>
      </section>

      <section className="cinema-faq" aria-labelledby="cinema-faq-title"><div className="cinema-faq-head cinema-reveal"><span className="cinema-overline">GOOD TO KNOW</span><TypewriterHeading tag="h2" id="cinema-faq-title" lines={['Your questions,', { text: 'answered.', accent: true }]} /><p>Simple answers before your first order.</p></div><div className="cinema-faq-list">{faqs.map((faq) => <details key={faq.question} className="cinema-faq-item cinema-reveal"><summary>{faq.question}<span><ChevronDown size={19} aria-hidden="true" /></span></summary><p>{faq.answer}</p></details>)}</div></section>

      <section className="cinema-final" id="contact" aria-labelledby="cinema-final-title"><img src={studioCylinder} alt="Orange cooking gas cylinder on a studio plinth" loading="lazy" /><div className="cinema-final-shade" aria-hidden="true" /><div className="cinema-final-content cinema-reveal"><span className="cinema-overline">READY WHEN YOU ARE</span><TypewriterHeading tag="h2" id="cinema-final-title" lines={['Running low on', 'cooking gas?', { text: "We've got you.", accent: true }]} /><p>Find a nearby seller, review your full quote and start your order with CGD.</p><div><button type="button" className="cinema-button cinema-button-primary" onClick={() => openAuth('customer')}>Start your order <ArrowRight size={19} aria-hidden="true" /></button><button type="button" className="cinema-final-login" onClick={() => openAuth('customer', true)}>Already have an account? Log in</button></div></div></section>
    </main>

    {showQuickOrder && <button type="button" className="cinema-quick-order" onClick={() => openAuth('customer')}>Quick order <ArrowRight size={18} aria-hidden="true" /></button>}

    <footer className="cinema-footer"><div className="cinema-footer-main"><div><a href="#top" className="cinema-brand cinema-footer-brand"><span className="cinema-brand-mark"><Flame size={20} aria-hidden="true" /></span><span><strong>CGD</strong><small>COOKING GAS DELIVERY</small></span></a><p>Cooking gas ordering and delivery for everyday life in Tanzania.</p></div><div><span>EXPLORE</span><a href="#products">Products</a><a href="#how-it-works">How it works</a><a href="#tracking">Tracking</a></div><div><span>JOIN CGD</span><a href="#partners">Partners</a><button type="button" onClick={() => openAuth('supplier')}>Sell cooking gas</button><button type="button" onClick={() => openAuth('driver')}>Deliver with CGD</button></div><div><span>YOUR ACCOUNT</span><button type="button" onClick={() => openAuth('customer', true)}>Log in</button><button type="button" onClick={() => setPage('role-select')}>Get started</button><button type="button" onClick={() => setPage('onboarding-slides')}>App tour</button></div></div><div className="cinema-footer-bottom"><span>© {new Date().getFullYear()} CGD — Cooking Gas Delivery.</span><span>Designed for the journey from shop to doorstep.</span></div></footer>
  </div>;
}
