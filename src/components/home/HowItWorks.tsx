const STEPS = [
  {
    number: '01',
    title: 'Walk the grid',
    body: 'Open the monument and pan across a million cells. Every open square is yours to claim.',
  },
  {
    number: '02',
    title: 'Spell it out',
    body: 'Select consecutive cells and type your word or line, letter by letter, right on the grid.',
  },
  {
    number: '03',
    title: 'Pay a dollar a letter',
    body: 'One quick, secure checkout. No account, no subscription. Just your word and a dollar each.',
  },
  {
    number: '04',
    title: "It's placed, permanently",
    body: 'Your cells turn from reserved to sold the instant payment clears. They do not come down.',
  },
] as const

export default function HowItWorks() {
  return (
    <section aria-labelledby="how-it-works-heading" className="border-b border-ink">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <h2 id="how-it-works-heading" className="max-w-xl font-headline text-4xl text-ink sm:text-5xl">
          How it works
        </h2>

        <ol className="mt-12 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {STEPS.map((step) => (
            <li key={step.number} className="border-t-2 border-ink pt-5">
              <span className="font-mono-grid text-sm text-ink-60">{step.number}</span>
              <h3 className="mt-2 font-headline text-xl text-ink">{step.title}</h3>
              <p className="mt-2 font-body text-sm leading-relaxed text-ink-60">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
