import TextEngine from 'spring-text-engine';

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
type HeadingLine = string | { text: string; accent?: boolean };

type Props = {
  tag: HeadingTag;
  id?: string;
  className?: string;
  lines: HeadingLine[];
};

export default function TypewriterHeading({ tag: Tag, id, className, lines }: Props) {
  const normalized = lines.map((line) => typeof line === 'string' ? { text: line, accent: false } : line);
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let precedingLetters = 0;

  return (
    <Tag id={id} className={className}>
      <span className="cinema-sr-only">{normalized.map((line) => line.text).join(' ')}</span>
      {normalized.map((line, index) => {
        const delayIn = precedingLetters * 45;
        precedingLetters += line.text.replace(/\s/g, '').length;
        return (
          <TextEngine
            key={`${index}-${line.text}`}
            tag="span"
            className={`cinema-type-line${line.accent ? ' is-accent' : ''}`}
            mode="once"
            enabled={!reducedMotion}
            seo={false}
            aria-hidden="true"
            letterOut={{ opacity: 0 }}
            letterIn={{ opacity: 1 }}
            letterConfig={{ tension: 600, friction: 30 }}
            letterStagger={45}
            delayIn={delayIn}
          >
            {line.text}
          </TextEngine>
        );
      })}
    </Tag>
  );
}
