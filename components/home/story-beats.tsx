'use client';

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import type { NoteBlock, StoryBeat } from './content';
import { BeatSceneArt } from './beat-scenes';
import { RailNav, useRail } from './rail';

interface StoryBeatsProps {
  beats: StoryBeat[];
}

/**
 * Three places on the street, answering the three questions every new visitor
 * has, in the order they have them.
 *
 * Today this content exists on the homepage, but it is buried in a nine-row
 * FAQ accordion near the bottom — below the directory index, Featured Panas,
 * events, articles and the impact band. Someone who lands on panamia.club not
 * knowing what a pana is has to scroll past everything the site sells before
 * finding out what it is selling.
 *
 * So the answers come up to second position, directly under the search, and
 * all three fit one screen: three shopfronts on a block rather than three
 * full-width stops stacked down the page. Three questions that a visitor is
 * weighing against each other should be visible at the same time — stacked,
 * the third one was 1,700px below the first and most people never learned it
 * was there.
 *
 * Below 60rem the block becomes a horizontal rail with the next card showing
 * at the edge. Nothing here requires a click: the face of each stop answers
 * its question outright, and opening one draws the deck's full text over the
 * shop window. That is a different promise from an accordion, where the click
 * *is* the answer.
 */
export function StoryBeats({ beats }: StoryBeatsProps) {
  const { t } = useTranslation('home');
  // Independent, not one-at-a-time. These are three separate questions, and a
  // visitor comparing "what is a pana" against "why local" should not have to
  // keep closing one to read the other.
  const [open, setOpen] = useState<string[]>([]);

  const { railRef, rail, syncRail, nudge } = useRail<HTMLDivElement>('.beat');
  const hasStructuredBody = beats.some((beat) => beat.body);
  const toggleRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const detailRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const close = (id: string) => {
    setOpen((prev) => prev.filter((item) => item !== id));
    // Back to the control that opened it, rather than dumping focus at the
    // top of the document.
    toggleRefs.current[id]?.focus();
  };

  const toggle = (id: string) => {
    if (open.includes(id)) {
      close(id);
      return;
    }
    setOpen((prev) => [...prev, id]);
    requestAnimationFrame(() => {
      const panel = detailRefs.current[id];
      panel?.focus({ preventScroll: true });
      // Keep the opened answer and close control in view on narrow screens.
      if (hasStructuredBody) {
        panel?.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    });
  };

  const navigate = (direction: 1 | -1) => {
    nudge(direction);
    if (hasStructuredBody) {
      railRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  };

  return (
    <div className="beats-rail" data-card-count={beats.length}>
      <div className="beats" ref={railRef} onScroll={syncRail}>
        {beats.map((beat) => {
          const isOpen = open.includes(beat.id);
          return (
            <section
              key={beat.id}
              id={beat.anchor}
              className="beat"
              data-side={beat.side}
              data-accent={beat.accent}
              aria-labelledby={`beat-sign-${beat.id}`}
            >
              <div className="beat-art" data-rv>
                <BeatSceneArt scene={beat.scene} />
              </div>

              <div className="beat-copy" data-rv>
                {/* The question is hung like a shop sign rather than set as a
                    heading, because on a street that is what it is. It stays a
                    real h3 underneath. */}
                <h3 id={`beat-sign-${beat.id}`} className="beat-sign">
                  {beat.question}
                </h3>

                {beat.aside && <p className="beat-aside">{beat.aside}</p>}
                {beat.body ? (
                  <div className="beat-answer-blocks">
                    {beat.body.map((block, index) => (
                      <BeatBlockView key={index} block={block} />
                    ))}
                  </div>
                ) : (
                  <p className="beat-answer">{beat.answer}</p>
                )}

                <button
                  type="button"
                  className="beat-toggle"
                  ref={(node) => {
                    toggleRefs.current[beat.id] = node;
                  }}
                  aria-expanded={isOpen}
                  aria-controls={`beat-${beat.id}`}
                  onClick={() => toggle(beat.id)}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {beat.more}
                </button>
              </div>

              {/* Drawn over the card rather than pushed under it. The three
                  cards are one row of a grid, so a panel that grows its own
                  card grows all three — open the shortest note and the other
                  two gain a third of a screen of nothing. Over the top, the
                  row never changes size and the section keeps its promise of
                  fitting one screen.

                  `hidden` rather than unmounting, so the id the button points
                  at with aria-controls exists whether or not it is open. */}
              <div
                id={`beat-${beat.id}`}
                className="beat-detail"
                hidden={!isOpen}
                ref={(node) => {
                  detailRefs.current[beat.id] = node;
                }}
                tabIndex={-1}
                role="region"
                aria-labelledby={`beat-sign-${beat.id}`}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    close(beat.id);
                  }
                }}
              >
                <div
                  className="beat-detail-body"
                  tabIndex={isOpen && hasStructuredBody ? 0 : undefined}
                >
                  {beat.detail.map((block, index) => (
                    <BeatBlockView key={index} block={block} />
                  ))}
                </div>

                <button
                  type="button"
                  className="beat-detail-close"
                  onClick={() => close(beat.id)}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">{t('beats.controls.close')}</span>
                </button>
              </div>
            </section>
          );
        })}
      </div>

      <RailNav
        rail={rail}
        nudge={navigate}
        className="beats-nav"
        prevLabel={t('beats.controls.previousQuestion')}
        nextLabel={t('beats.controls.nextQuestion')}
      />
    </div>
  );
}

function BeatBlockView({ block }: { block: NoteBlock }) {
  switch (block.kind) {
    case 'paragraph':
      return (
        <p>
          {block.emphasis === 'strong' ? (
            <strong>{block.text}</strong>
          ) : (
            block.text
          )}
        </p>
      );

    case 'heading':
      return <h4 className="beat-body-question">{block.text}</h4>;

    case 'definition':
      return (
        <dl className="beat-definition">
          <dt className="beat-aside">
            <span className="sr-only">{block.term} </span>
            <strong>{block.pronunciation}</strong>
          </dt>
          <dd>
            <ol className="beat-numbered">
              {block.items.map((item) => (
                <li key={item}>
                  <strong>{item}</strong>
                </li>
              ))}
            </ol>
          </dd>
        </dl>
      );

    case 'example':
      return (
        <p className="beat-example">
          <strong>{block.text}</strong>
        </p>
      );

    case 'numbered':
      return (
        <>
          <h4 className="beat-label">{block.label}</h4>
          <ol className="beat-numbered">
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </>
      );

    case 'list':
      return (
        <>
          <h4 className="beat-label">{block.label}</h4>
          <ul className="beat-list">
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      );

    case 'tags':
      return (
        <>
          <h4 className="beat-label">{block.label}</h4>
          <ul className="beat-tags">
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      );
  }
}
