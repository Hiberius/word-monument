import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'
import { listNotes } from '@/lib/notes'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const routes: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number }> = [
    { path: '/', changeFrequency: 'hourly', priority: 1 },
    { path: '/monument', changeFrequency: 'always', priority: 0.9 },
    { path: '/about', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/notes', changeFrequency: 'weekly', priority: 0.7 },
    { path: '/content-policy', changeFrequency: 'yearly', priority: 0.3 },
    { path: '/terms', changeFrequency: 'yearly', priority: 0.2 },
    { path: '/privacy', changeFrequency: 'yearly', priority: 0.2 },
  ]

  const staticEntries = routes.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))

  // Notes are the only pages here meant to be found by search rather than by
  // someone already looking for the monument, so they carry their own real
  // publication date instead of the build clock.
  const noteEntries = listNotes().map((note) => ({
    url: `${SITE_URL}/notes/${note.slug}`,
    lastModified: new Date(`${note.published}T00:00:00Z`),
    changeFrequency: 'yearly' as const,
    priority: 0.8,
  }))

  return [...staticEntries, ...noteEntries]
}
