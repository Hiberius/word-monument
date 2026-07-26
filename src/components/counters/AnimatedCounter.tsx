'use client'

import NumberFlow, { type Format } from '@number-flow/react'

interface AnimatedCounterProps {
  value: number
  format?: Format
  className?: string
}

export default function AnimatedCounter({ value, format, className }: AnimatedCounterProps) {
  return (
    <NumberFlow
      value={value}
      format={format}
      className={className}
      transformTiming={{ duration: 600, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
      willChange
    />
  )
}
