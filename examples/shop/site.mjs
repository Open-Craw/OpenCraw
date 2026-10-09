// The shop the recipes crawl: three catalog pages of two products each, a product page per product, a login
// form that sets a session cookie, and a JSON API behind that cookie that pages with `nextPage`. The web
// recipe and the api recipe reach the same six products by different routes.
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

/** The recipes' start URLs name this port: start URLs are not templated. */
export const PORT = 4580
export const BASE = `http://127.0.0.1:${PORT}`
const PAGES = 3
const NAMES = ['Trail runner', 'Rain shell', 'Wool beanie', 'Down vest', 'Hiking pole', 'Dry bag']

/**
 * @param {number} id - 11, 12, 21, 22, 31 or 32: catalog page, then position.
 * @returns {{ id: number, name: string, priceInt: number, priceCents: string, inStock: boolean, images: string[], variants: { size: string, price: string }[], seller: string }} The product.
 */
function product (id) {
  const index = (Math.floor(id / 10) - 1) * 2 + (id % 10) - 1

  return {
    id,
    name:       NAMES[index],
    priceInt:   40 + index * 15,
    priceCents: index % 2 === 0 ? '00' : '50',
    inStock:    index % 3 !== 2,
    images:     [`${BASE}/img/${id}-1.jpg`, `https://cdn.example/${id}-2.jpg`],
    variants:   [{ size: 'M', price: `${40 + index * 15}.00` }, { size: 'L', price: `${45 + index * 15}.50` }],
    seller:     ['Northwind', 'Contoso', 'Fabrikam'][index % 3],
  }
}

const idsOn = page => [page * 10 + 1, page * 10 + 2]
const money = (integer, cents) => `${integer.toLocaleString('de-DE')},${cents} €`

function catalogHtml (page) {
  const links = idsOn(page).map(id => `<li><a class="product" href="/product/${id}">${product(id).name}</a></li>`).join('')
  const next = page < PAGES ? `<a class="next" href="/catalog?page=${page + 1}">Next page</a>` : ''

  return `<!doctype html><html lang="en"><head><title>Catalog, page ${page}</title></head>
<body><h1>Catalog, page ${page}</h1><ul>${links}</ul>${next}</body></html>`
}

function productHtml (item) {
  const rows = item.variants.map(({ size, price }) => {
    const [integer, cents] = price.split('.', 2)

    return `<tr><td class="size">${size}</td><td class="price">${money(Number(integer), cents)}</td></tr>`
  }).join('')
  const images = item.images.map(source => `<img class="gallery" src="${source.replace(BASE, '')}" alt="">`).join('')

  return `<!doctype html><html lang="en"><head><title>${item.name}</title></head><body>
<h1>  ${item.name}  </h1><p class="price">Price: ${money(item.priceInt, item.priceCents)}</p>${images}
${item.inStock ? '<p class="stock">In stock</p>' : ''}<table class="variants">${rows}</table><p class="seller"> ${item.seller} </p></body></html>`
}

const LOGIN = `<!doctype html><html lang="en"><head><title>Log in</title></head><body><form method="post" action="/login">
<label>User <input id="user" name="user"></label><label>Password <input id="pass" name="pass" type="password"></label>
<button type="submit">Log in</button></form></body></html>`
const ACCOUNT = '<!doctype html><html lang="en"><head><title>Account</title></head><body><p id="logged-in">Welcome back</p></body></html>'

/**
 * Starts the shop on 127.0.0.1:4580.
 *
 * @returns {Promise<{ url: string, close: () => Promise<void> }>} Its base URL and a way to stop it.
 */
export async function startShop () {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', BASE)
    const page = Number(url.searchParams.get('page') ?? '1')
    const send = (status, type, body, headers = {}) => {
      response.writeHead(status, { 'content-type': type, ...headers })
      response.end(body)
    }
    const html = (body, status = 200) => send(status, 'text/html; charset=utf-8', body)

    if (url.pathname === '/catalog') return page >= 1 && page <= PAGES ? html(catalogHtml(page)) : html('Not found', 404)
    if (url.pathname.startsWith('/product/')) {
      const item = product(Number(url.pathname.slice('/product/'.length)))

      return html(productHtml(item))
    }
    if (url.pathname === '/login' && request.method === 'GET') return html(LOGIN)
    if (url.pathname === '/login' && request.method === 'POST') {
      let body = ''
      request.on('data', (chunk) => { body += chunk })
      request.on('end', () => {
        const form = new URLSearchParams(body)
        if (form.get('user') === 'demo' && form.get('pass') === 'demo') send(302, 'text/plain', '', { 'set-cookie': 'session=ok; Path=/; HttpOnly', 'location': '/account' })
        else html(LOGIN, 401)
      })

      return
    }
    if (url.pathname === '/account') return html(ACCOUNT)
    if (url.pathname === '/api/products') {
      if (!(request.headers.cookie ?? '').includes('session=ok')) return send(401, 'application/json', '{"error":"log in first"}')
      const items = idsOn(page).map((id) => {
        const item = product(id)

        return { url: `${BASE}/product/${id}`, name: item.name, priceInt: item.priceInt, priceCents: item.priceCents, stock: item.inStock ? 3 : 0, images: item.images, variants: item.variants, seller: item.seller }
      })

      return send(200, 'application/json', JSON.stringify({ items, nextPage: page < PAGES ? `/api/products?page=${page + 1}` : null }))
    }

    return html('Not found', 404)
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(PORT, '127.0.0.1', resolve)
  })

  return { url: BASE, close: () => new Promise(resolve => server.close(() => resolve())) }
}

// `node site.mjs` keeps the shop running, to open it in a browser or probe it.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { url } = await startShop()
  console.log(`Shop running at ${url}/catalog (log in at ${url}/login as demo / demo). Ctrl+C to stop.`)
}
