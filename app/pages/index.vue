<script setup lang="ts">
import type {
  AuditEntry,
  ConfigStatus,
  ExecutionMode,
  MetricsRequest,
  MetricValues,
  NormalizedMetrics,
  Platform,
  PostRequest,
  PublishResult,
} from '#shared/types'

useHead({ title: 'Relay' })
const toast = useToast()

const platforms = [
  { value: 'youtube', label: 'YouTube', icon: 'i-simple-icons-youtube' },
  { value: 'facebook', label: 'Facebook', icon: 'i-simple-icons-facebook' },
] as const

const config = ref<ConfigStatus | null>(null)
const platform = ref<Platform>('youtube')
const mode = ref<ExecutionMode>('direct')

const form = reactive({
  title: '',
  description: '',
  privacy: 'private' as 'private' | 'unlisted' | 'public',
  imageUrl: '',
  link: '',
})
const fileInput = ref<HTMLInputElement | null>(null)
const file = ref<File | null>(null)
const fileName = ref('')

const contentId = ref('')
const postResult = ref<PublishResult | null>(null)
const metrics = ref<NormalizedMetrics | null>(null)
const posting = ref(false)
const fetching = ref(false)
const audit = ref<AuditEntry[]>([])

interface ModeOutcome { metrics?: MetricValues, ms?: number, error?: string }
const comparing = ref(false)
const compareResult = ref<{ direct: ModeOutcome, orchestrated: ModeOutcome, identical: boolean | null } | null>(null)

const activePlatform = computed(() => platforms.find(p => p.value === platform.value)!)
const connected = computed(() => {
  if (!config.value) return false
  return mode.value === 'direct'
    ? config.value.platforms[platform.value].directConfigured
    : config.value.orchestrationConfigured
})

function errMsg(e: unknown): string {
  const err = e as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
  return err?.data?.statusMessage || err?.statusMessage || err?.message || 'Request failed'
}
function notifyError(e: unknown) {
  toast.add({ title: 'Couldn’t complete that', description: errMsg(e), color: 'error', icon: 'i-lucide-circle-alert' })
}

async function loadConfig() {
  try { config.value = await $fetch<ConfigStatus>('/api/config') }
  catch { /* ignore */ }
}
async function loadAudit() {
  try {
    const r = await $fetch<{ entries: AuditEntry[], enabled: boolean }>('/api/audit')
    audit.value = r.entries
  }
  catch { /* ignore */ }
}

function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0] ?? null
  file.value = f
  fileName.value = f?.name ?? ''
}
function clearFile() {
  file.value = null
  fileName.value = ''
  if (fileInput.value) fileInput.value.value = ''
}
function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const s = String(reader.result)
      resolve(s.slice(s.indexOf(',') + 1))
    }
    reader.onerror = reject
    reader.readAsDataURL(f)
  })
}

async function doPost() {
  posting.value = true
  metrics.value = null
  try {
    const body: PostRequest = {
      platform: platform.value,
      mode: mode.value,
      title: form.title,
      description: form.description,
    }
    if (platform.value === 'youtube') {
      if (!file.value) throw new Error('Choose a video to publish.')
      body.mediaBase64 = await fileToBase64(file.value)
      body.mediaContentType = file.value.type || 'video/mp4'
      body.privacy = form.privacy
    }
    else {
      if (form.imageUrl) body.imageUrl = form.imageUrl
      if (form.link) body.link = form.link
    }
    const res = await $fetch<PublishResult>('/api/post', { method: 'POST', body })
    postResult.value = res
    contentId.value = res.contentId
    toast.add({ title: 'Published', description: `${activePlatform.value.label} · ${res.contentId}`, color: 'success', icon: 'i-lucide-check' })
  }
  catch (e) {
    notifyError(e)
  }
  finally {
    posting.value = false
    loadAudit()
  }
}

async function doFetchMetrics() {
  fetching.value = true
  try {
    const id = parseContentId(contentId.value, platform.value)
    if (!id) throw new Error('Paste a video ID or a YouTube URL first.')
    contentId.value = id // reflect the extracted ID back into the field
    const body: MetricsRequest = {
      platform: platform.value,
      mode: mode.value,
      contentId: id,
      publishedAt: postResult.value?.publishedAt,
      contentUrl: postResult.value?.contentUrl,
    }
    metrics.value = await $fetch<NormalizedMetrics>('/api/metrics', { method: 'POST', body })
  }
  catch (e) {
    notifyError(e)
  }
  finally {
    fetching.value = false
    loadAudit()
  }
}

async function runMode(m: ExecutionMode, id: string): Promise<ModeOutcome> {
  const t = performance.now()
  try {
    const body: MetricsRequest = { platform: platform.value, mode: m, contentId: id, publishedAt: postResult.value?.publishedAt, contentUrl: postResult.value?.contentUrl }
    const res = await $fetch<NormalizedMetrics>('/api/metrics', { method: 'POST', body })
    return { metrics: res.metrics, ms: Math.round(performance.now() - t) }
  }
  catch (e) {
    return { error: errMsg(e) }
  }
}

async function compareModes() {
  const id = parseContentId(contentId.value, platform.value)
  if (!id) { notifyError(new Error('Paste a video ID or a URL first.')); return }
  contentId.value = id
  comparing.value = true
  compareResult.value = null
  try {
    const [direct, orchestrated] = await Promise.all([runMode('direct', id), runMode('orchestrated', id)])
    const identical = direct.metrics && orchestrated.metrics
      ? JSON.stringify(direct.metrics) === JSON.stringify(orchestrated.metrics)
      : null
    compareResult.value = { direct, orchestrated, identical }
  }
  finally {
    comparing.value = false
    loadAudit()
  }
}

const METRIC_LABELS: Record<string, string> = {
  views: 'Views',
  likes: 'Likes',
  comments: 'Comments',
  shares: 'Shares',
  impressions: 'Impressions',
  engagements: 'Engagement',
  clicks: 'Clicks',
  saves: 'Saves',
}
function toRows(m?: MetricValues) {
  const v = (m ?? {}) as Record<string, number | undefined>
  return Object.entries(METRIC_LABELS).filter(([k]) => v[k] !== undefined).map(([k, label]) => ({ label, value: v[k] as number }))
}
const metricRows = computed(() => toRows(metrics.value?.metrics))

function fmt(ts?: string): string {
  if (!ts) return '—'
  try { return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }
  catch { return ts }
}
function pretty(v: unknown): string {
  return JSON.stringify(v, null, 2)
}
function modeColor(m: ExecutionMode): 'primary' | 'secondary' {
  return m === 'direct' ? 'primary' : 'secondary'
}

onMounted(() => {
  loadConfig()
  loadAudit()
})
</script>

<template>
  <div class="min-h-screen bg-(--ui-bg-muted)">
    <!-- Top bar -->
    <header class="sticky top-0 z-10 border-b border-(--ui-border) bg-(--ui-bg)/80 backdrop-blur">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="size-9 rounded-xl bg-primary text-white grid place-items-center shadow-sm">
            <UIcon name="i-lucide-send-horizontal" class="size-5" />
          </div>
          <div class="leading-tight">
            <div class="font-semibold">
              Relay
            </div>
            <div class="text-xs text-(--ui-text-muted)">
              Publish &amp; measure
            </div>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <div class="hidden sm:flex items-center gap-2 text-xs text-(--ui-text-muted)">
            <span class="size-2 rounded-full" :class="connected ? 'bg-success' : 'bg-(--ui-bg-accented)'" />
            {{ connected ? 'Connected' : 'Not connected' }}
          </div>
          <UFieldGroup>
            <UButton
              :variant="mode === 'direct' ? 'solid' : 'outline'"
              :color="mode === 'direct' ? 'primary' : 'neutral'"
              @click="mode = 'direct'"
            >
              Direct
            </UButton>
            <UButton
              :variant="mode === 'orchestrated' ? 'solid' : 'outline'"
              :color="mode === 'orchestrated' ? 'secondary' : 'neutral'"
              @click="mode = 'orchestrated'"
            >
              Orchestrated
            </UButton>
          </UFieldGroup>
        </div>
      </div>
    </header>

    <main class="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div class="grid lg:grid-cols-2 gap-6 items-start">
        <!-- Composer -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <div class="font-medium">
                Compose
              </div>
              <UFieldGroup size="sm">
                <UButton
                  v-for="p in platforms"
                  :key="p.value"
                  :icon="p.icon"
                  :variant="platform === p.value ? 'solid' : 'outline'"
                  :color="platform === p.value ? 'primary' : 'neutral'"
                  @click="platform = p.value"
                >
                  {{ p.label }}
                </UButton>
              </UFieldGroup>
            </div>
          </template>

          <div class="space-y-4">
            <UFormField label="Title">
              <UInput
                v-model="form.title"
                class="w-full"
                :placeholder="platform === 'youtube' ? 'Video title' : 'Post headline'"
              />
            </UFormField>

            <UFormField :label="platform === 'youtube' ? 'Description' : 'Message'">
              <UTextarea v-model="form.description" :rows="4" class="w-full" placeholder="Write something…" />
            </UFormField>

            <UFormField v-if="platform === 'youtube'" label="Video">
              <div class="flex items-center gap-2">
                <input ref="fileInput" type="file" accept="video/*" class="hidden" @change="onFile">
                <UButton variant="outline" color="neutral" icon="i-lucide-paperclip" @click="fileInput?.click()">
                  {{ fileName || 'Choose file' }}
                </UButton>
                <UButton v-if="fileName" variant="ghost" color="neutral" icon="i-lucide-x" size="sm" @click="clearFile" />
              </div>
            </UFormField>
            <UFormField v-if="platform === 'youtube'" label="Visibility">
              <USelect v-model="form.privacy" :items="['private', 'unlisted', 'public']" class="w-44" />
            </UFormField>

            <UFormField v-if="platform === 'facebook'" label="Image URL">
              <UInput v-model="form.imageUrl" class="w-full" placeholder="https://…" />
            </UFormField>
            <UFormField v-if="platform === 'facebook'" label="Link">
              <UInput v-model="form.link" class="w-full" placeholder="https://…" />
            </UFormField>
          </div>

          <template #footer>
            <div class="flex items-center justify-between">
              <span class="text-xs text-(--ui-text-muted)">via {{ mode }}</span>
              <UButton :loading="posting" icon="i-lucide-send-horizontal" @click="doPost">
                Publish
              </UButton>
            </div>
          </template>
        </UCard>

        <!-- Insights -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div class="font-medium">
                Insights
              </div>
              <div class="flex items-center gap-2">
                <UInput
                  v-model="contentId"
                  size="sm"
                  class="w-56 font-mono"
                  :placeholder="platform === 'youtube' ? 'video ID or YouTube URL' : 'post ID or URL'"
                />
                <UButton
                  size="sm"
                  :loading="fetching"
                  icon="i-lucide-refresh-cw"
                  :variant="metrics ? 'outline' : 'solid'"
                  :color="metrics ? 'neutral' : 'primary'"
                  @click="doFetchMetrics"
                >
                  {{ metrics ? 'Refresh' : 'Fetch' }}
                </UButton>
                <UButton
                  size="sm"
                  variant="outline"
                  color="neutral"
                  icon="i-lucide-columns-2"
                  :loading="comparing"
                  @click="compareModes"
                >
                  Compare
                </UButton>
              </div>
            </div>
          </template>

          <!-- published summary -->
          <div
            v-if="postResult"
            class="rounded-lg bg-(--ui-bg-muted) p-3 mb-4 flex items-center justify-between gap-3"
          >
            <div class="min-w-0">
              <div class="text-xs text-(--ui-text-muted)">
                Published {{ fmt(postResult.publishedAt) }}
              </div>
              <a
                v-if="postResult.contentUrl"
                :href="postResult.contentUrl"
                target="_blank"
                class="font-mono text-sm text-primary hover:underline truncate block"
              >{{ postResult.contentId }}</a>
              <div v-else class="font-mono text-sm truncate">
                {{ postResult.contentId }}
              </div>
            </div>
            <UBadge :color="modeColor(postResult.mode)" variant="subtle" class="shrink-0">
              via {{ postResult.mode }}
            </UBadge>
          </div>

          <!-- metrics -->
          <div v-if="metrics">
            <div class="flex items-center justify-between mb-3">
              <UBadge :color="modeColor(metrics.mode)" variant="subtle">
                via {{ metrics.mode }}
              </UBadge>
              <span class="text-xs text-(--ui-text-muted)">updated {{ fmt(metrics.fetchedAt) }}</span>
            </div>

            <div v-if="metricRows.length" class="grid grid-cols-3 gap-2">
              <div
                v-for="row in metricRows"
                :key="row.label"
                class="rounded-lg border border-(--ui-border) px-3 py-4 text-center"
              >
                <div class="text-xl font-semibold tabular-nums">
                  {{ row.value.toLocaleString() }}
                </div>
                <div class="text-xs text-(--ui-text-muted) mt-0.5">
                  {{ row.label }}
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-(--ui-text-muted)">
              No numbers to show yet — open the raw response below.
            </p>

            <details class="mt-4">
              <summary class="cursor-pointer text-xs text-(--ui-text-muted) hover:text-(--ui-text-highlighted) select-none">
                Raw response
              </summary>
              <pre class="mt-2 overflow-auto text-xs p-3 rounded-lg bg-(--ui-bg-muted) max-h-72">{{ pretty(metrics.raw) }}</pre>
            </details>
          </div>

          <!-- compare modes -->
          <div v-if="compareResult" class="mt-4">
            <div class="flex items-center gap-2 mb-2 flex-wrap">
              <UBadge v-if="compareResult.identical === true" color="success" variant="subtle" icon="i-lucide-check">
                Metrics match across modes
              </UBadge>
              <UBadge v-else-if="compareResult.identical === false" color="error" variant="subtle">
                Metrics differ
              </UBadge>
              <UBadge v-else color="neutral" variant="subtle">
                Couldn’t compare
              </UBadge>
              <span class="text-xs text-(--ui-text-muted)">same content, both paths</span>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div
                v-for="col in ([{ key: 'direct', label: 'Direct', color: 'primary' }, { key: 'orchestrated', label: 'Orchestrated', color: 'secondary' }] as const)"
                :key="col.key"
                class="rounded-lg border border-(--ui-border) p-3"
              >
                <div class="flex items-center justify-between mb-2">
                  <UBadge :color="col.color" variant="subtle">
                    {{ col.label }}
                  </UBadge>
                  <span v-if="compareResult[col.key].ms != null" class="text-xs text-(--ui-text-muted) tabular-nums">
                    {{ compareResult[col.key].ms }} ms
                  </span>
                </div>
                <template v-if="compareResult[col.key].metrics">
                  <div v-for="row in toRows(compareResult[col.key].metrics)" :key="row.label" class="flex justify-between text-sm py-0.5">
                    <span class="text-(--ui-text-muted)">{{ row.label }}</span>
                    <span class="font-semibold tabular-nums">{{ row.value.toLocaleString() }}</span>
                  </div>
                  <p v-if="!toRows(compareResult[col.key].metrics).length" class="text-xs text-(--ui-text-muted)">
                    no numeric metrics
                  </p>
                </template>
                <p v-else class="text-xs text-error">
                  {{ compareResult[col.key].error }}
                </p>
              </div>
            </div>
          </div>

          <!-- empty state -->
          <div v-if="!metrics && !compareResult && !postResult" class="text-center py-10">
            <UIcon name="i-lucide-chart-no-axes-column" class="size-8 text-(--ui-text-dimmed) mx-auto" />
            <p class="text-sm text-(--ui-text-muted) mt-2">
              Publish or look up content to see metrics.
            </p>
          </div>
        </UCard>
      </div>

      <!-- Activity -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div class="font-medium">
              Activity
            </div>
            <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-refresh-cw" @click="loadAudit" />
          </div>
        </template>

        <div v-if="!audit.length" class="text-sm text-(--ui-text-muted) py-1">
          Nothing here yet.
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs text-(--ui-text-muted)">
                <th class="font-medium px-2 py-2">When</th>
                <th class="font-medium px-2 py-2">Channel</th>
                <th class="font-medium px-2 py-2">Mode</th>
                <th class="font-medium px-2 py-2">Action</th>
                <th class="font-medium px-2 py-2" />
                <th class="font-medium px-2 py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in audit" :key="e.id" class="border-t border-(--ui-border)">
                <td class="px-2 py-2 whitespace-nowrap text-(--ui-text-muted)">
                  {{ fmt(e.ts) }}
                </td>
                <td class="px-2 py-2 capitalize">
                  {{ e.platform }}
                </td>
                <td class="px-2 py-2">
                  <UBadge size="xs" variant="subtle" :color="modeColor(e.mode)">
                    {{ e.mode }}
                  </UBadge>
                </td>
                <td class="px-2 py-2">
                  {{ e.action }}
                </td>
                <td class="px-2 py-2">
                  <span
                    class="size-2 inline-block rounded-full align-middle"
                    :class="e.status === 'ok' ? 'bg-success' : 'bg-error'"
                  />
                </td>
                <td class="px-2 py-2 text-(--ui-text-muted) max-w-sm truncate" :title="e.summary">
                  {{ e.summary }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>
    </main>
  </div>
</template>
