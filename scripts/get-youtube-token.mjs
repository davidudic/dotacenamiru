// One-shot helper to obtain a YouTube OAuth refresh token for local dev.
//
// Prereq: a Google Cloud OAuth client of type "Desktop app" (loopback redirect
// is allowed automatically). YouTube Data API v3 enabled. The signed-in Google
// account must own the dummy channel.
//
// Usage:
//   node scripts/get-youtube-token.mjs <CLIENT_ID> <CLIENT_SECRET>
//   # or put YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET in .dev.vars and run:
//   npm run oauth:youtube
//
// It prints a ready-to-paste block for .dev.vars.

import http from 'node:http'
import { existsSync, readFileSync } from 'node:fs'

const PORT = 5179
const REDIRECT = `http://localhost:${PORT}/callback`
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ')

function readDevVars() {
  const out = {}
  if (existsSync('.dev.vars')) {
    for (const line of readFileSync('.dev.vars', 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m && m[2]) out[m[1]] = m[2]
    }
  }
  return out
}

const env = { ...readDevVars(), ...process.env }
const clientId = process.argv[2] || env.YOUTUBE_CLIENT_ID
const clientSecret = process.argv[3] || env.YOUTUBE_CLIENT_SECRET

if (!clientId || !clientSecret) {
  console.error('Missing client id/secret.')
  console.error('Usage: node scripts/get-youtube-token.mjs <CLIENT_ID> <CLIENT_SECRET>')
  console.error('   or set YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET in .dev.vars')
  process.exit(1)
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.searchParams.set('client_id', clientId)
authUrl.searchParams.set('redirect_uri', REDIRECT)
authUrl.searchParams.set('response_type', 'code')
authUrl.searchParams.set('scope', SCOPES)
authUrl.searchParams.set('access_type', 'offline')
authUrl.searchParams.set('prompt', 'consent') // force a refresh_token every time

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (url.pathname !== '/callback') {
    res.writeHead(404)
    res.end()
    return
  }
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  if (error || !code) {
    res.end(`Authorization failed: ${error || 'no code'}`)
    console.error('Authorization failed:', error || 'no code')
    server.close()
    process.exit(1)
  }
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT,
        grant_type: 'authorization_code',
      }),
    })
    const json = await tokenRes.json()
    if (!json.refresh_token) {
      res.end('No refresh_token returned — revoke prior access at https://myaccount.google.com/permissions and retry.')
      console.error('Token response:', json)
      server.close()
      process.exit(1)
    }
    res.end('Success! Refresh token captured. You can close this tab and return to the terminal.')
    console.log('\n✅ Done. Paste this into .dev.vars:\n')
    console.log(`YOUTUBE_CLIENT_ID=${clientId}`)
    console.log(`YOUTUBE_CLIENT_SECRET=${clientSecret}`)
    console.log(`YOUTUBE_REFRESH_TOKEN=${json.refresh_token}\n`)
  } catch (e) {
    res.end(`Token exchange failed: ${e.message}`)
    console.error(e)
  } finally {
    server.close()
    setTimeout(() => process.exit(0), 100)
  }
})

server.listen(PORT, () => {
  console.log('\nOpen this URL, sign in with your DUMMY Google account, and consent:\n')
  console.log(`${authUrl.toString()}\n`)
  console.log(`Waiting for the redirect on ${REDIRECT} …`)
})
