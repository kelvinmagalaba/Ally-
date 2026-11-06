const fs = require('fs');
const file = 'src/pages/LandingPage.tsx';
let source = fs.readFileSync(file, 'utf8');
const replacements = [
  [`<h4>Cooking gas near you</h4>`, `<TypewriterHeading tag="h4" lines={['Cooking gas near you']} />`],
  [`<h4>Everything in view.</h4>`, `<TypewriterHeading tag="h4" lines={['Everything in view.']} />`],
  [`<h4>On its way.</h4>`, `<TypewriterHeading tag="h4" lines={['On its way.']} />`],
  [`<h1 id="cinema-hero-title"><span className="cinema-hero-title-line"><span>Your cooking gas.</span></span><span className="cinema-hero-title-line cinema-hero-title-orange"><span>On its way.</span></span></h1>`, `<TypewriterHeading tag="h1" id="cinema-hero-title" lines={['Your cooking gas.', { text: 'On its way.', accent: true }]} />`],
  [`<h2 className="cinema-sr-only" id="cinema-story-title">The CGD delivery journey</h2>`, ``],
  [`<h3>{scene.title}</h3>`, `<TypewriterHeading tag="h3" lines={[scene.title]} />`],
  [`<h2 id="cinema-products-title">Choose your<br /><em>cylinder.</em></h2>`, `<TypewriterHeading tag="h2" id="cinema-products-title" lines={['Choose your', { text: 'cylinder.', accent: true }]} />`],
  [`<h2 id="cinema-steps-title">Four steps.<br /><em>One easy experience.</em></h2>`, `<TypewriterHeading tag="h2" id="cinema-steps-title" lines={['Four steps.', { text: 'One easy experience.', accent: true }]} />`],
  [`<h3>{step.title}</h3>`, `<TypewriterHeading tag="h3" lines={[step.title]} />`],
  [`<h2 id="cinema-tracking-title">See the journey.<br /><em>Feel in control.</em></h2>`, `<TypewriterHeading tag="h2" id="cinema-tracking-title" lines={['See the journey.', { text: 'Feel in control.', accent: true }]} />`],
  [`<h2 id="cinema-promise-title">The details make<br /><em>the difference.</em></h2>`, `<TypewriterHeading tag="h2" id="cinema-promise-title" lines={['The details make', { text: 'the difference.', accent: true }]} />`],
  [`<h3>From seller to doorstep, with clarity.</h3>`, `<TypewriterHeading tag="h3" lines={['From seller to doorstep, with clarity.']} />`],
  [`<h2 id="cinema-partners-title">Be part of<br /><em>the journey.</em></h2>`, `<TypewriterHeading tag="h2" id="cinema-partners-title" lines={['Be part of', { text: 'the journey.', accent: true }]} />`],
  [`<h3>Bring essentials closer.</h3>`, `<TypewriterHeading tag="h3" lines={['Bring essentials closer.']} />`],
  [`<h3>Grow your local reach.</h3>`, `<TypewriterHeading tag="h3" lines={['Grow your local reach.']} />`],
  [`<h2 id="cinema-faq-title">Your questions,<br /><em>answered.</em></h2>`, `<TypewriterHeading tag="h2" id="cinema-faq-title" lines={['Your questions,', { text: 'answered.', accent: true }]} />`],
  [`<h2 id="cinema-final-title">Running low on<br />cooking gas?<em> We've got you.</em></h2>`, `<TypewriterHeading tag="h2" id="cinema-final-title" lines={['Running low on', 'cooking gas?', { text: "We've got you.", accent: true }]} />`],
];
for (const [before, after] of replacements) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`Expected one match, got ${count}: ${before.slice(0, 80)}`);
  source = source.replace(before, after);
}
source = source.replace('aria-labelledby="cinema-story-title"', 'aria-label="The CGD delivery journey"');
fs.writeFileSync(file, source);
console.log(`Replaced ${replacements.length} heading patterns`);
