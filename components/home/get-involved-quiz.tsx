'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  HandHeart,
  Heart,
  RotateCcw,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

type PathId = 'directory' | 'social' | 'connectors' | 'donate';

interface InvolvementPath {
  id: PathId;
  title: string;
  description: string;
  resultDescription: string;
  href: string;
  cta: string;
  icon: LucideIcon;
}

interface QuizAnswer {
  id: string;
  label: string;
  description: string;
  scores: Partial<Record<PathId, number>>;
}

interface QuizQuestion {
  id: string;
  eyebrow: string;
  question: string;
  answers: QuizAnswer[];
}

const pathDefinitions: Array<Pick<InvolvementPath, 'id' | 'href' | 'icon'>> = [
  {
    id: 'directory',
    href: '/form/get-listed',
    icon: Building2,
  },
  {
    id: 'social',
    href: '/social',
    icon: Users,
  },
  {
    id: 'connectors',
    href: '/connectors/join',
    icon: HandHeart,
  },
  {
    id: 'donate',
    href: '/support-pana',
    icon: Heart,
  },
];

const questionDefinitions = [
  {
    id: 'goal',
    answers: [
      { id: 'visibility', scores: { directory: 4 } },
      { id: 'connection', scores: { social: 4, connectors: 1 } },
      { id: 'volunteer', scores: { connectors: 4 } },
      { id: 'fund', scores: { donate: 4 } },
    ],
  },
  {
    id: 'participation',
    answers: [
      { id: 'once', scores: { directory: 3, donate: 2 } },
      { id: 'casual', scores: { social: 4 } },
      { id: 'handsOn', scores: { connectors: 4, social: 1 } },
      {
        id: 'flexible',
        scores: { directory: 1, social: 1, connectors: 1, donate: 1 },
      },
    ],
  },
  {
    id: 'bringing',
    answers: [
      { id: 'organization', scores: { directory: 4, social: 1 } },
      { id: 'curiosity', scores: { social: 4 } },
      { id: 'skills', scores: { connectors: 4 } },
      { id: 'financial', scores: { donate: 4 } },
    ],
  },
] satisfies Array<{
  id: string;
  answers: Array<{
    id: string;
    scores: Partial<Record<PathId, number>>;
  }>;
}>;

type QuizState =
  | { screen: 'choices' }
  | { screen: 'quiz'; step: number; answers: QuizAnswer[] }
  | { screen: 'result'; answers: QuizAnswer[] };

export function GetInvolvedQuiz() {
  const { t } = useTranslation('home');
  const [state, setState] = useState<QuizState>({ screen: 'choices' });

  const paths = useMemo<InvolvementPath[]>(
    () =>
      pathDefinitions.map((path) => ({
        ...path,
        title: t(`involvement.paths.${path.id}.title`),
        description: t(`involvement.paths.${path.id}.description`),
        resultDescription: t(`involvement.paths.${path.id}.resultDescription`),
        cta: t(`involvement.paths.${path.id}.cta`),
      })),
    [t]
  );

  const questions = useMemo<QuizQuestion[]>(
    () =>
      questionDefinitions.map((question) => ({
        id: question.id,
        eyebrow: t(`involvement.questions.${question.id}.eyebrow`),
        question: t(`involvement.questions.${question.id}.question`),
        answers: question.answers.map((answer) => ({
          ...answer,
          label: t(
            `involvement.questions.${question.id}.answers.${answer.id}.label`
          ),
          description: t(
            `involvement.questions.${question.id}.answers.${answer.id}.description`
          ),
        })),
      })),
    [t]
  );

  const result = useMemo(() => {
    if (state.screen !== 'result') return null;

    const scores: Record<PathId, number> = {
      directory: 0,
      social: 0,
      connectors: 0,
      donate: 0,
    };

    for (const answer of state.answers) {
      for (const [path, score] of Object.entries(answer.scores)) {
        scores[path as PathId] += score;
      }
    }

    const ranked = [...paths].sort((a, b) => scores[b.id] - scores[a.id]);
    return { primary: ranked[0], alternatives: ranked.slice(1, 3) };
  }, [paths, state]);

  function chooseAnswer(answer: QuizAnswer) {
    if (state.screen !== 'quiz') return;

    const answers = [...state.answers, answer];
    if (state.step === questions.length - 1) {
      setState({ screen: 'result', answers });
      return;
    }

    setState({ screen: 'quiz', step: state.step + 1, answers });
  }

  function goBack() {
    if (state.screen === 'result') {
      setState({
        screen: 'quiz',
        step: questions.length - 1,
        answers: state.answers.slice(0, -1),
      });
      return;
    }

    if (state.screen !== 'quiz') return;
    if (state.step === 0) {
      setState({ screen: 'choices' });
      return;
    }

    setState({
      screen: 'quiz',
      step: state.step - 1,
      answers: state.answers.slice(0, -1),
    });
  }

  return (
    <section className="home-section story-point involvement">
      <div className="container mx-auto px-4" data-rv>
        <div className="involvement-layout">
          <div className="involvement-intro">
            <span className="section-eyebrow">{t('involvement.eyebrow')}</span>
            <h2 className="section-statement mt-6">
              {t('involvement.titleBefore')}{' '}
              <em>{t('involvement.titleAccent')}</em>
            </h2>
            <p className="section-lede story-point-body mt-6">
              {t('involvement.lede')}
            </p>

            <div className="involvement-details">
              <span>
                <CalendarDays aria-hidden="true" />
                {t('involvement.duration')}
              </span>
              <span>
                <Sparkles aria-hidden="true" />
                {t('involvement.noSignup')}
              </span>
            </div>
          </div>

          <div className="involvement-card" aria-live="polite">
            {state.screen === 'choices' && (
              <>
                <div className="involvement-cardhead">
                  <div>
                    <span className="involvement-kicker">
                      {t('involvement.choicesEyebrow')}
                    </span>
                    <h3>{t('involvement.choicesTitle')}</h3>
                  </div>
                </div>

                <div className="involvement-path-grid">
                  {paths.map((path) => {
                    const Icon = path.icon;
                    return (
                      <Link
                        key={path.id}
                        href={path.href}
                        className="involvement-path"
                      >
                        <span className="involvement-path-icon">
                          <Icon aria-hidden="true" />
                        </span>
                        <span>
                          <strong>{path.title}</strong>
                          <small>{path.description}</small>
                        </span>
                        <ArrowRight
                          className="involvement-path-arrow"
                          aria-hidden="true"
                        />
                      </Link>
                    );
                  })}
                </div>

                <div className="involvement-quiz-invite">
                  <div>
                    <strong>{t('involvement.quizInviteTitle')}</strong>
                    <span>{t('involvement.quizInviteBody')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setState({ screen: 'quiz', step: 0, answers: [] })
                    }
                    className="involvement-quiz-start"
                  >
                    {t('involvement.quizStart')}
                    <Sparkles aria-hidden="true" />
                  </button>
                </div>
              </>
            )}

            {state.screen === 'quiz' && (
              <QuizStep
                step={state.step}
                questions={questions}
                onAnswer={chooseAnswer}
                onBack={goBack}
              />
            )}

            {state.screen === 'result' && result && (
              <QuizResult
                primary={result.primary}
                alternatives={result.alternatives}
                onBack={goBack}
                onRestart={() =>
                  setState({ screen: 'quiz', step: 0, answers: [] })
                }
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function QuizStep({
  step,
  questions,
  onAnswer,
  onBack,
}: {
  step: number;
  questions: QuizQuestion[];
  onAnswer: (answer: QuizAnswer) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation('home');
  const question = questions[step];
  const progress = ((step + 1) / questions.length) * 100;

  return (
    <>
      <div className="involvement-quiz-nav">
        <button type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          {t('involvement.back')}
        </button>
        <span>
          {t('involvement.questionCounter', {
            current: step + 1,
            total: questions.length,
          })}
        </span>
      </div>
      <div
        className="involvement-quiz-progress"
        role="progressbar"
        aria-label={t('involvement.progressLabel')}
        aria-valuemin={1}
        aria-valuemax={questions.length}
        aria-valuenow={step + 1}
      >
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="involvement-question">
        <span className="involvement-kicker">{question.eyebrow}</span>
        <h3>{question.question}</h3>
        <div className="involvement-answer-list">
          {question.answers.map((answer) => (
            <button
              key={answer.id}
              type="button"
              onClick={() => onAnswer(answer)}
              className="involvement-answer"
            >
              <span>
                <strong>{answer.label}</strong>
                <small>{answer.description}</small>
              </span>
              <ArrowRight aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function QuizResult({
  primary,
  alternatives,
  onBack,
  onRestart,
}: {
  primary: InvolvementPath;
  alternatives: InvolvementPath[];
  onBack: () => void;
  onRestart: () => void;
}) {
  const { t } = useTranslation('home');
  const Icon = primary.icon;

  return (
    <>
      <div className="involvement-quiz-nav">
        <button type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          {t('involvement.back')}
        </button>
        <button type="button" onClick={onRestart}>
          <RotateCcw aria-hidden="true" />
          {t('involvement.restart')}
        </button>
      </div>

      <div className="involvement-result">
        <span className="involvement-result-icon">
          <Icon aria-hidden="true" />
        </span>
        <span className="involvement-kicker">
          {t('involvement.resultEyebrow')}
        </span>
        <h3>{primary.title}</h3>
        <p>{primary.resultDescription}</p>
        <Link href={primary.href} className="involvement-result-cta">
          {primary.cta}
          <ArrowRight aria-hidden="true" />
        </Link>

        <div className="involvement-alternatives">
          <span>{t('involvement.alternatives')}</span>
          <div>
            {alternatives.map((path) => (
              <Link key={path.id} href={path.href}>
                {path.title}
                <ArrowRight aria-hidden="true" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
