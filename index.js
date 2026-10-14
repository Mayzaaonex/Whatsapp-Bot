import readline from 'node:readline'
import fs from 'node:fs'
import { ConsoleLogger, createStore, WaClient } from 'zapo-js'
import { createSqliteStore } from '@zapo-js/store-sqlite'
import { formatJidForLog, resolveDisplayNumber } from './system/jid.js'
import { loadConfig, saveConfig, isOwner, normalizeOwnerInput } from './system/config.js'
import { loadPlugins, getButtonHandler, getAutoHandlers } from './system/plugin-loader.js'
import { getCategory, sendMenu, MENU_CATEGORIES } from './command/menu.js'
import { loadRestartState, deleteRestartState } from './system/restart-state.js'
import { startAutoUpdate } from './system/auto-update.js'

// === Konfigurasi ===
const logger = new ConsoleLogger('warn')

process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err)
})
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err)
})

const BOT_START_TIME = Date.now()

// === Cek session ===
const SESSION_DIR = './session'
const SESSION_DB = './session/state.sqlite'
const hasSession = fs.existsSync(SESSION_DIR) && fs.existsSync(SESSION_DB)

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

// === Pilih metode pairing ===
let pairingMethod = null
let botNumber = null

async function choosePairingMethod() {
  if (hasSession) return

  console.log('\n=== PAIRING ===')
  console.log('Belum ada session. Pilih metode pairing:')
  console.log('  1) QR Code')
  console.log('  2) Pairing Code (via nomor)')

  while (!pairingMethod) {
    const ans = await ask('Pilih (1/2): ')
    if (ans === '1') {
      pairingMethod = 'qr'
    } else if (ans === '2') {
      pairingMethod = 'code'
      while (!botNumber) {
        const num = await ask('Masukkan nomor WhatsApp bot (contoh: 6281234567890): ')
        const cleaned = num.replace(/[^0-9]/g, '')
        if (/^[0-9]{8,15}$/.test(cleaned)) {
          botNumber = normalizeOwnerInput(num)
        } else {
          console.log('Nomor tidak valid, coba lagi.')
        }
      }
    } else {
      console.log('Pilihan tidak valid. Masukkan 1 atau 2.')
    }
  }
  console.log('')
}

await choosePairingMethod()

// === Store & client ===
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true })
}

const store = createStore({
  backends: {
    sqlite: createSqliteStore({ path: SESSION_DB, driver: 'node' })
  },
  providers: {
    auth: 'sqlite',
    signal: 'sqlite',
    preKey: 'sqlite',
    session: 'sqlite',
    identity: 'sqlite',
    senderKey: 'sqlite',
    appState: 'sqlite',
    privacyToken: 'sqlite',
    messages: 'none',
    threads: 'none',
    contacts: 'none'
  }
})

const client = new WaClient(
  {
    store,
    sessionId: 'default',
    mediaTimeoutMs: 300000,
    messageAckTimeoutMs: 120000,
    messageMaxAttempts: 5
  },
  logger
)

// === Pairing ===
let pairingRequested = false

async function requestPairingCode() {
  if (pairingRequested) return
  pairingRequested = true
  try {
    const code = await client.auth.requestPairingCode(botNumber)
    const formatted = code.match(/.{1,4}/g)?.join('-') ?? code
    console.log('\n=== PAIRING CODE ===')
    console.log(formatted)
    console.log('Buka WhatsApp di HP -> Perangkat Tertaut -> Tautkan dengan nomor telepon')
    console.log('Masukkan kode di atas.\n')
  } catch (err) {
    console.error('[gagal minta pairing code]', err)
    pairingRequested = false
  }
}

client.on('auth_qr', ({ qr }) => {
  if (pairingMethod === 'qr') {
    console.log('\n=== SCAN QR ===')
    console.log(qr)
    console.log('Buka WhatsApp -> Perangkat Tertaut -> Tautkan perangkat\n')
  }
})

client.on('auth_pairing_required', () => {
  if (pairingMethod === 'code') requestPairingCode()
})

client.on('auth_paired', ({ credentials }) => {
  console.log(`Berhasil pairing sebagai ${credentials.meJid}`)
})

// === Watchdog ===
let connectionOpened = false
let connectionTimeout = null

function startConnectionWatchdog() {
  if (connectionOpened) return
  connectionTimeout = setTimeout(() => {
    if (!connectionOpened) {
      console.error('\n=== SESSION CORRUPT ===')
      console.error('Bot gagal connect dalam 60 detik.')
      console.error('Solusi: hapus folder "session" lalu pairing ulang.\n')
      process.exit(1)
    }
  }, 60_000)
}

client.on('connection', async (event) => {
  if (event.status === 'open') {
    connectionOpened = true
    if (connectionTimeout) clearTimeout(connectionTimeout)
    console.log('Bot online.')

    // === Cek restart state ===
    try {
      const state = loadRestartState()
      if (state?.to) {
        setTimeout(async () => {
          try {
            await client.message.send(state.to, '✅ Bot kembali online!')
            deleteRestartState()
          } catch (err) {
            console.error('[restart-state] gagal kirim notif:', err.message)
            deleteRestartState()
          }
        }, 3000)
      }
    } catch (err) {
      console.error('[restart-state] error:', err.message)
    }
  } else {
    console.log('Koneksi terputus:', event.reason, '| logout?', event.isLogout)
  }
})

// === Load plugins ===
const PLUGINS = await loadPlugins('./_plugins')
const AUTO_HANDLERS = getAutoHandlers()
console.log(`[plugin] total ${PLUGINS.size} command, ${AUTO_HANDLERS.length} auto-handler`)

// === Start auto-update checker ===
const startupConfig = loadConfig()
startAutoUpdate(client, startupConfig)

// === Reaction helper ===
async function react(client, to, event, emoji) {
  try {
    await client.message.send(to, {
      type: 'reaction',
      emoji,
      target: event.key
    })
  } catch (err) {
    console.error('[gagal reaction]', err)
  }
}

// === Extract ID tombol / single-select ===
function extractSelectedId(message) {
  if (!message) return null

  const listId = message.listResponseMessage?.singleSelectReply?.selectedRowId
  if (listId) return listId

  const btnId = message.buttonsResponseMessage?.selectedButtonId
  if (btnId) return btnId

  const nf = message.interactiveResponseMessage?.nativeFlowResponseMessage
  if (nf?.paramsJson) {
    try {
      const parsed = JSON.parse(nf.paramsJson)
      return parsed.id ?? parsed.selectedId ?? null
    } catch {
      return null
    }
  }

  return null
}

function isButtonResponse(message) {
  if (!message) return false
  return !!(message.buttonsResponseMessage || message.listResponseMessage || message.interactiveResponseMessage)
}

// === vCard owner ===
function buildOwnerVCard(number) {
  const normalized = normalizeOwnerInput(number)
  return (
    'BEGIN:VCARD\n' +
    'VERSION:3.0\n' +
    'FN:Bot Owner\n' +
    'ORG:Bot Owner\n' +
    `TEL;type=CELL;type=VOICE;waid=${normalized}:+${normalized}\n` +
    'END:VCARD'
  )
}

async function sendOwnerContact(client, to, config) {
  if (!config.owner?.length) {
    await client.message.send(to, 'Belum ada owner yang terdaftar di config.json')
    return
  }

  if (config.owner.length === 1) {
    await client.message.send(to, {
      contactMessage: {
        displayName: 'Bot Owner',
        vcard: buildOwnerVCard(config.owner[0])
      }
    })
    return
  }

  await client.message.send(to, {
    contactsArrayMessage: {
      displayName: 'Bot Owners',
      contacts: config.owner.map((number) => ({
        displayName: 'Bot Owner',
        vcard: buildOwnerVCard(number)
      }))
    }
  })
}

async function denyOwnerAccess(client, to, event, config) {
  await client.message.send(to, 'Hanya Owner Yang Dapat Menggunakan Command Tersebut')
  await sendOwnerContact(client, to, config)
  await react(client, to, event, '❌')
}

// === Load file menu kategori ===
async function loadCategoryMenu(categoryId, prefix) {
  const short = categoryId.replace('menu.', '')
  const file = `./command/${short}menu.js`
  const mod = await import(file)
  return mod.render(prefix)
}

// === Handler pesan masuk ===
client.on('message', async (event) => {
  const buttonResponse = isButtonResponse(event.message)
  if (event.key.fromMe && !buttonResponse) return

  const config = loadConfig()
  const prefix = config.prefix || '.'

  const to = event.key.remoteJid
  const senderJid = event.key.participant ?? event.key.remoteJid
  const senderAlt = event.key.participantAlt ?? event.key.remoteJidAlt
  const senderNumber = resolveDisplayNumber(senderJid, senderAlt)
  const userIsOwner = isOwner(config, senderNumber)
  const isGroup = to.endsWith('@g.us')

  // === Self mode ===
  const isSelf = isGroup && config.selfGroups?.includes(to)
  if (isSelf && !userIsOwner) return

  // === Response tombol / single-select ===
  const selectedId = extractSelectedId(event.message)
  if (selectedId) {
    try {
      const btnHandler = getButtonHandler(selectedId)
      if (btnHandler) {
        const handled = await btnHandler(client, { to, event, selectedId })
        if (handled) return
      }

      const cat = getCategory(selectedId)
      if (!cat) return

      if (cat.ownerOnly && !userIsOwner) {
        await denyOwnerAccess(client, to, event, config)
        return
      }

      const text = await loadCategoryMenu(selectedId, prefix)
      await client.message.send(to, text)
    } catch (err) {
      console.error('[gagal proses tombol]', err)
    }
    return
  }

  // === Pesan teks (termasuk caption media) ===
  const text =
    event.message?.conversation ??
    event.message?.extendedTextMessage?.text ??
    event.message?.imageMessage?.caption ??
    event.message?.videoMessage?.caption ??
    event.message?.documentMessage?.caption ??
    ''

  if (!text) return

  console.log(`[pesan] ${formatJidForLog(senderJid, senderAlt)}: ${text}`)

  // === Auto-handlers (antilink, mute, dll) ===
  for (const auto of AUTO_HANDLERS) {
    try {
      const consumed = await auto.handler(client, {
        to,
        event,
        senderJid,
        senderNumber,
        text,
        userIsOwner,
        isGroup,
        config
      })
      if (consumed === true) return
    } catch (err) {
      console.error(`[auto:${auto.name}] error:`, err)
    }
  }

  // === Command processing ===
  const trimmed = text.trim()
  if (!trimmed.startsWith(prefix)) return

  const withoutPrefix = trimmed.slice(prefix.length).trim()
  const [cmdRaw, ...args] = withoutPrefix.split(/\s+/)
  const cmd = cmdRaw.toLowerCase()

  const categoryMatch = MENU_CATEGORIES.find(
    (c) => c.id === `menu.${cmd}` && !c.hide && c.id !== 'menu.owner'
  )

  if (categoryMatch) {
    if (categoryMatch.ownerOnly && !userIsOwner) {
      await denyOwnerAccess(client, to, event, config)
      return
    }

    await react(client, to, event, '⏳')

    try {
      const menuText = await loadCategoryMenu(categoryMatch.id, prefix)
      await client.message.send(to, menuText)
      await react(client, to, event, '✅')
    } catch (err) {
      console.error(`[menu:${cmd}]`, err)
      await react(client, to, event, '❌')
    }
    return
  }

  const plugin = PLUGINS.get(cmd)
  if (!plugin) return

  if (plugin.ownerOnly && !userIsOwner && !plugin.special) {
    await denyOwnerAccess(client, to, event, config)
    return
  }

  if (plugin.onlyGroup && !isGroup) return
  if (plugin.onlyPrivate && isGroup) return

  await react(client, to, event, '⏳')

  try {
    const result = await plugin.handler(client, {
      to,
      event,
      args,
      prefix,
      senderJid,
      senderNumber,
      userIsOwner,
      config,
      saveConfig,
      startTime: BOT_START_TIME
    })

    if (result?.ok === false) {
      await react(client, to, event, '❌')
    } else {
      await react(client, to, event, '✅')
    }
  } catch (err) {
    console.error(`[plugin ${cmd}] error:`, err)
    await react(client, to, event, '❌')
  }
})

// === Start ===
startConnectionWatchdog()
await client.connect()