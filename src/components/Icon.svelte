<script lang="ts" module>
  const PATHS = {
    markets: 'M3 3v18h18M7 15l4-4 3 3 6-7',
    star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
    signals: 'M3 12h4l3-8 4 16 3-8h4',
    info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7.5v.01',
    back: 'M15 5l-7 7 7 7',
    sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1.5v2M12 20.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1.5 12h2M20.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
    moon: 'M20 14.5A8.5 8.5 0 019.5 4 8.5 8.5 0 1020 14.5z',
    auto: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 3v18',
    refresh: 'M20 11a8 8 0 10-2.3 5.7M20 4v7h-7',
    search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
    close: 'M6 6l12 12M18 6L6 18',
    sort: 'M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4',
    offline: 'M2 8.5a15 15 0 0120 0M5.5 12a10 10 0 0113 0M9 15.5a5 5 0 016 0M12 19v.01M3 3l18 18',
    alert: 'M12 9v4M12 17v.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
    up: 'M6 15l6-6 6 6',
    down: 'M6 9l6 6 6-6',
    plus: 'M12 5v14M5 12h14',
    chevron: 'M9 5l7 7-7 7',
  } as const;
  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  let { name, size = 24, filled = false, class: cls = '' }: { name: IconName; size?: number; filled?: boolean; class?: string } =
    $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill={filled ? 'currentColor' : 'none'}
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  class={cls}><path d={PATHS[name]} /></svg>
