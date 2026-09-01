const FEED_URL = 'https://blog.aolia.ai/feed'
const POST_COUNT = 3
const REVALIDATE_SECONDS = 600

type Post = {
  title: string
  url: string
  date: string
  image: string
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function tagValue(block: string, tag: string) {
  const cdata = block.match(
    new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i'),
  )
  if (cdata) return decodeXml(cdata[1])
  const plain = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))
  return plain ? decodeXml(plain[1]) : ''
}

function enclosureUrl(block: string) {
  const enclosure = block.match(/<enclosure[^>]+url="([^"]+)"/i)
  if (enclosure) return decodeXml(enclosure[1])
  const media = block.match(/<media:content[^>]+url="([^"]+)"/i)
  if (media) return decodeXml(media[1])
  const img = block.match(/<img[^>]+src="([^"]+)"/i)
  return img ? decodeXml(img[1]) : ''
}

function formatDate(pubDate: string) {
  const parsed = new Date(pubDate)
  if (Number.isNaN(parsed.getTime())) return pubDate
  return parsed.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function parseFeed(xml: string): Post[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .map((match) => {
      const block = match[1]
      const url = tagValue(block, 'link')
      const title = tagValue(block, 'title')
      if (!url || !title) return null
      return {
        title,
        url,
        date: formatDate(tagValue(block, 'pubDate')),
        image: enclosureUrl(block),
      }
    })
    .filter((post): post is Post => post !== null)
    .slice(0, POST_COUNT)
}

export async function GET() {
  try {
    const response = await fetch(FEED_URL, {
      next: { revalidate: REVALIDATE_SECONDS },
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml',
        'User-Agent': 'AoliaLanding/1.0 (+https://aolia.ai)',
      },
    })

    if (!response.ok) {
      throw new Error(`Feed responded ${response.status}`)
    }

    const posts = parseFeed(await response.text())

    return Response.json(
      { posts },
      {
        headers: {
          'Cache-Control': `public, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=86400`,
        },
      },
    )
  } catch (error) {
    console.error('Failed to load Aolia RSS feed', error)
    return Response.json({ posts: [] }, { status: 502 })
  }
}
