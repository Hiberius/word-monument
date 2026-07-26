import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const routes: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number }> = [
    { path: '/', changeFrequency: 'hourly', priority: 1 },
    { path: '/monument', changeFrequency: 'always', priority: 0.9 },
    { path: '/about', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/content-policy', changeFrequency: 'yearly', priority: 0.3 },
    { path: '/terms', changeFrequency: 'yearly', priority: 0.2 },
    { path: '/privacy', changeFrequency: 'yearly', priority: 0.2 },
  ]

  return routes.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))
}
